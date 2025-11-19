#!/usr/bin/env node

/**
 * Universal job application automation for hh.ru
 * Works with both Playwright and Puppeteer through browser-commander
 */

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import path from 'path';
import os from 'os';
import { createQADatabase, findBestMatch } from './qa-database.mjs';
import { launchBrowser, makeBrowserCommander } from './browser-commander/index.js';

// Create QA database instance with explicit production file path
const QA_DB_PATH = path.join(process.cwd(), 'data', 'qa.lino');
const qaDB = createQADatabase(QA_DB_PATH);

// Extract methods from database instance
const { readQADatabase, addOrUpdateQA } = qaDB;

let browser = null;
let commander = null;

// Handle graceful shutdown on exit signals
async function gracefulShutdown(signal) {
  console.log(`\n🛑 Received ${signal}, closing browser gracefully...`);
  if (browser) {
    try {
      await browser.close();
      console.log('✅ Browser closed successfully');
    } catch (error) {
      console.error('❌ Error closing browser:', error.message);
    }
  }
  process.exit(0);
}

// Register signal handlers for graceful shutdown
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

(async () => {
  // Parse command-line arguments
  const argv = yargs(hideBin(process.argv))
    .option('engine', {
      type: 'string',
      description: 'Browser automation engine to use: playwright or puppeteer',
      choices: ['playwright', 'puppeteer'],
      default: 'playwright',
    })
    .option('url', {
      alias: 'u',
      type: 'string',
      description: 'URL to navigate to',
      default: process.env.npm_config_url || process.env.START_URL || 'https://hh.ru/search/vacancy?from=resumelist',
    })
    .option('manual-login', {
      type: 'boolean',
      description: 'Open login page and wait for manual authentication before proceeding',
      default: false,
    })
    .option('user-data-dir', {
      type: 'string',
      description: 'Path to user data directory for persistent session storage',
      default: (lib) => path.join(os.homedir(), '.hh-automation', `${lib || 'playwright'}-data`),
    })
    .option('job-application-interval', {
      type: 'number',
      description: 'Interval in seconds to wait between job application button clicks',
      default: 20,
    })
    .option('message', {
      alias: 'm',
      type: 'string',
      description: 'Message to send with job application',
    })
    .option('verbose', {
      type: 'boolean',
      description: 'Enable verbose logging for debugging',
      default: false,
    })
    .help()
    .argv;

  // Set user data dir based on engine if not explicitly set
  if (!argv['user-data-dir']) {
    argv['user-data-dir'] = path.join(os.homedir(), '.hh-apply', `${argv.engine}-data`);
  }

  const MESSAGE = argv.message || process.env.MESSAGE || `В какой форме предлагается юридическое оформление удалённой работы?

Посмотреть мой код на GitHub можно тут:

github.com/konard
github.com/deep-assistant
github.com/linksplatform
github.com/link-foundation`;
  const START_URL = argv.url;

  // Launch browser with default configuration from browser-commander
  const { browser: launchedBrowser, page } = await launchBrowser({
    engine: argv.engine,
    userDataDir: argv['user-data-dir'],
    headless: false,
    verbose: argv.verbose,
  });

  browser = launchedBrowser;

  // Create browser commander instance
  commander = makeBrowserCommander({ page, verbose: argv.verbose });

  console.log(`🚀 Using ${commander.engine} automation engine`);

  // Track if page was closed by user
  let pageClosedByUser = false;

  // Detect tab close event
  page.on('close', async () => {
    pageClosedByUser = true;
    console.log('🔴 Tab close detected! Page was closed by user.');
    console.log('✅ Closing browser gracefully...');
    try {
      await browser.close();
      console.log('✅ Browser closed successfully');
    } catch (error) {
      console.error('❌ Error closing browser:', error.message);
    }
    process.exit(0);
  });

  /**
   * Robust waiting function that waits indefinitely for a URL condition
   */
  async function waitForUrlCondition(targetUrl, description) {
    const pollingInterval = 1000;
    console.log(`⏳ ${description}...`);

    while (true) {
      if (pageClosedByUser) {
        return;
      }

      try {
        const result = await commander.evaluate({
          fn: (url) => window.location.href.startsWith(url),
          args: [targetUrl],
        });
        if (result) {
          return true;
        }
      } catch (error) {
        if (pageClosedByUser) {
          return;
        }
        const isDetachedFrameError = error.message && error.message.includes('detached Frame');
        if (!isDetachedFrameError) {
          console.log(`⚠️  Temporary error while checking URL: ${error.message.substring(0, 100)}... (retrying)`);
        }
      }

      await commander.wait({ ms: pollingInterval, reason: 'polling interval before next URL check' });
    }
  }

  // Handle manual login if requested
  if (argv['manual-login']) {
    const backurl = encodeURIComponent(START_URL);
    const loginUrl = `https://hh.ru/account/login?role=applicant&backurl=${backurl}&hhtmFrom=vacancy_search_list`;

    console.log('🔐 Opening login page for manual authentication...');
    console.log('📍 Login URL:', loginUrl);

    await commander.goto({ url: loginUrl });
    await commander.focusPageContent();

    console.log('💡 The browser will automatically continue once you are redirected to:', START_URL);

    await waitForUrlCondition(START_URL, 'Waiting for you to complete login');

    if (!pageClosedByUser) {
      console.log('✅ Login successful! Proceeding with automation...');
      await commander.focusPageContent();
    }
  } else {
    await commander.goto({ url: START_URL });
    await commander.focusPageContent();
  }

  const targetPagePattern = /^https:\/\/hh\.ru\/search\/vacancy/;
  const vacancyResponsePattern = /^https:\/\/hh\.ru\/applicant\/vacancy_response\?vacancyId=/;
  const vacancyPagePattern = /^https:\/\/hh\.ru\/vacancy\/(\d+)/;
  const BUTTON_CLICK_INTERVAL = argv['job-application-interval'] * 1000;

  // Track vacancy page flow: vacancy_response -> vacancy details -> click button -> back to START_URL
  let isOnVacancyPageFromResponse = false;

  /**
   * Setup Q&A auto-fill and auto-save for all textareas on the page
   */
  async function setupQAHandling() {
    try {
      const qaMap = await readQADatabase();

      const pageQuestions = await commander.evaluate({
        fn: () => {
          const questions = [];
          const textareas = document.querySelectorAll('textarea');

          textareas.forEach((textarea, index) => {
            const taskBody = textarea.closest('[data-qa="task-body"]');
            if (!taskBody) return;

            const questionEl = taskBody.querySelector('[data-qa="task-question"]');
            if (!questionEl) return;

            const question = questionEl.textContent.trim();
            if (question) {
              const selector = textarea.name ? `textarea[name="${textarea.name}"]` : `textarea:nth-of-type(${index + 1})`;
              questions.push({ question, selector, index });
            }
          });

          return questions;
        },
      });

      const questionToAnswer = new Map();
      for (const { question, selector, index } of pageQuestions) {
        const match = findBestMatch(question, qaMap);
        if (match) {
          questionToAnswer.set(question, { answer: match.answer, selector, index });
          console.log(`[QA] Fuzzy match for "${question}" (score: ${match.score.toFixed(3)})`);
          console.log(`[QA] Matched to: "${match.question}"`);
          console.log(`[QA] Answer: "${match.answer}"`);
        }
      }

      for (const [question, { answer, selector }] of questionToAnswer) {
        try {
          const filled = await commander.fillTextArea({
            selector,
            text: answer,
            checkEmpty: true,
            scrollIntoView: true,
            simulateTyping: true,
          });
          if (filled) {
            console.log(`[QA] Prefilled answer for: ${question}`);
          } else {
            console.log(`[QA] Textarea already has content for: ${question}`);
          }
        } catch (error) {
          console.error(`[QA] Error prefilling textarea for "${question}":`, error.message);
        }
      }

      await commander.evaluate({
        fn: (qaData) => {
          const qaObj = Object.fromEntries(qaData);
          const textareas = document.querySelectorAll('textarea');

          textareas.forEach((textarea) => {
            const taskBody = textarea.closest('[data-qa="task-body"]');
            if (!taskBody) return;

            const questionEl = taskBody.querySelector('[data-qa="task-question"]');
            if (!questionEl) return;

            const question = questionEl.textContent.trim();
            if (!question) return;

            const knownAnswer = qaObj[question]?.answer;

            textarea.addEventListener('blur', async () => {
              const answer = textarea.value.trim();
              if (answer && answer !== knownAnswer) {
                textarea.dataset.qaQuestion = question;
                textarea.dataset.qaAnswer = answer;
                console.log('[QA] Marked for saving:', question, '->', answer);
              }
            });
          });
        },
        args: [Array.from(questionToAnswer.entries())],
      });

      const qaPairsToSave = await commander.evaluate({
        fn: () => {
          const pairs = [];
          const textareas = document.querySelectorAll('textarea[data-qa-question][data-qa-answer]');
          textareas.forEach((textarea) => {
            pairs.push({
              question: textarea.dataset.qaQuestion,
              answer: textarea.dataset.qaAnswer,
            });
          });
          return pairs;
        },
      });

      for (const { question, answer } of qaPairsToSave) {
        await addOrUpdateQA(question, answer);
        console.log('💾 Saved Q&A:', question);
      }

      return qaPairsToSave.length;
    } catch (error) {
      console.error('⚠️  Error setting up Q&A handling:', error.message);
      return 0;
    }
  }

  /**
   * Save Q&A pairs from textareas after user interaction
   */
  async function saveQAPairs() {
    try {
      const qaPairs = await commander.evaluate({
        fn: () => {
          const pairs = [];
          const textareas = document.querySelectorAll('textarea');

          textareas.forEach((textarea) => {
            const taskBody = textarea.closest('[data-qa="task-body"]');
            if (!taskBody) return;

            const questionEl = taskBody.querySelector('[data-qa="task-question"]');
            if (!questionEl) return;

            const question = questionEl.textContent.trim();
            const answer = textarea.value.trim();

            if (question && answer) {
              pairs.push({ question, answer });
            }
          });

          return pairs;
        },
      });

      for (const { question, answer } of qaPairs) {
        await addOrUpdateQA(question, answer);
        console.log('💾 Saved Q&A:', question);
      }

      return qaPairs.length;
    } catch (error) {
      console.error('⚠️  Error saving Q&A pairs:', error.message);
      return 0;
    }
  }

  /**
   * Handle the vacancy_response page
   */
  async function handleVacancyResponsePage() {
    console.log('📝 Detected vacancy_response page, handling application form...');

    if (argv.verbose) {
      console.log(`🔍 [VERBOSE] Engine: ${commander.engine}`);
      console.log('🔍 [VERBOSE] About to wait for body selector');
    }

    await commander.waitForSelector({ selector: 'body' });

    if (argv.verbose) {
      console.log('🔍 [VERBOSE] Body selector found');
    }

    // Log all textareas for debugging
    if (argv.verbose) {
      console.log('🔍 [VERBOSE] About to count textareas');
    }
    const initialCount = await commander.count({ selector: 'textarea' });
    console.log(`🔍 Initial scan: Found ${initialCount} textarea(s) on page`);

    if (argv.verbose) {
      console.log('🔍 [VERBOSE] Starting to inspect each textarea');
      for (let i = 0; i < initialCount; i++) {
        const selector = `textarea:nth-of-type(${i + 1})`;
        console.log(`🔍 [VERBOSE] Processing textarea ${i} with selector: ${selector}`);
        const dataQa = await commander.getAttribute({ selector, attribute: 'data-qa' });
        const visible = await commander.isVisible({ selector });
        const dataQaDisplay = dataQa || '(none)';
        console.log(`🔍 Initial textarea ${i}: data-qa="${dataQaDisplay}", visible=${visible}`);
      }
      console.log('🔍 [VERBOSE] Finished inspecting textareas');
    }

    // Check if textarea is already visible
    if (argv.verbose) {
      console.log('🔍 [VERBOSE] Checking if textarea is already visible');
    }
    let textareaAlreadyVisible = false;
    let textareaSelector = '';
    const possibleSelectors = [
      'textarea[data-qa="vacancy-response-popup-form-letter-input"]',
      'textarea[data-qa="vacancy-response-form-letter-input"]',
    ];

    for (const sel of possibleSelectors) {
      if (argv.verbose) {
        console.log(`🔍 [VERBOSE] Checking selector: ${sel}`);
      }
      const count = await commander.count({ selector: sel });
      if (argv.verbose) {
        console.log(`🔍 [VERBOSE] Count for ${sel}: ${count}`);
      }
      if (count > 0) {
        const visible = await commander.isVisible({ selector: sel });
        if (argv.verbose) {
          console.log(`🔍 [VERBOSE] Visible for ${sel}: ${visible}`);
        }
        if (visible) {
          textareaAlreadyVisible = true;
          textareaSelector = sel;
          console.log('💡 Cover letter section already expanded, textarea visible');
          break;
        }
      }
    }
    if (argv.verbose) {
      console.log(`🔍 [VERBOSE] textareaAlreadyVisible: ${textareaAlreadyVisible}`);
    }

    // If textarea not visible, click toggle button
    if (!textareaAlreadyVisible) {
      try {
        let toggleFound = false;
        let toggleSelector = null;

        // Try data-qa attributes first
        const dataQaSelectors = [
          '[data-qa="vacancy-response-letter-toggle"]',
          '[data-qa="add-cover-letter"]',
        ];

        for (const sel of dataQaSelectors) {
          const count = await commander.count({ selector: sel });
          if (count > 0) {
            toggleFound = true;
            toggleSelector = sel;
            break;
          }
        }

        // Fallback to text matching for small elements
        if (!toggleFound) {
          if (argv.verbose) {
            console.log('🔍 [VERBOSE] data-qa not found, searching by text');
          }

          // Try each element type separately using findByText
          const elementTypes = ['button', 'a', 'span'];
          for (const elementType of elementTypes) {
            toggleSelector = await commander.findByText({
              text: 'Сопроводительное письмо',
              selector: elementType,
            });
            const count = await commander.count({ selector: toggleSelector });
            if (count > 0) {
              toggleFound = true;
              break;
            }
          }
        }

        if (toggleFound) {
          const text = await commander.textContent({ selector: toggleSelector });
          const dataQa = await commander.getAttribute({ selector: toggleSelector, attribute: 'data-qa' });
          if (argv.verbose) {
            console.log(`🔍 [VERBOSE] Found toggle element: text="${text?.trim()}", data-qa="${dataQa}"`);
          }
          console.log(`🔘 Cover letter section is collapsed, clicking toggle (text: "${text?.trim()}", data-qa: "${dataQa}") to expand...`);

          await commander.clickButton({
            selector: toggleSelector,
            scrollIntoView: true,
          });

          console.log('🔍 Toggle click completed');

          await commander.wait({ ms: 1700, reason: 'expand animation to complete' });
          console.log('✅ Cover letter section expanded');

          // Log textareas after toggle
          const countAfter = await commander.count({ selector: 'textarea' });
          if (argv.verbose) {
            console.log(`📊 After toggle click: Found ${countAfter} textarea(s) on page`);
          }
        } else {
          console.log('💡 Toggle button not found, cover letter section may already be expanded');
        }
      } catch (error) {
        console.log('💡 Toggle button not found, cover letter section may already be expanded');
        console.log(`🔍 Error during toggle: ${error.message}`);
      }
    }

    // Wait for textarea
    if (!textareaAlreadyVisible) {
      textareaSelector = 'textarea[data-qa="vacancy-response-popup-form-letter-input"]';
    }

    try {
      if (argv.verbose) {
        console.log(`🔍 [VERBOSE] Waiting for textarea selector: ${textareaSelector}`);
      }
      await commander.waitForSelector({ selector: textareaSelector, visible: true, timeout: 2000 });
      if (argv.verbose) {
        console.log('🔍 [VERBOSE] Textarea found and visible');
      }
    } catch {
      if (argv.verbose) {
        console.log('🔍 [VERBOSE] First selector timed out after 2000ms, trying alternative');
      }
      textareaSelector = 'textarea[data-qa="vacancy-response-form-letter-input"]';
      try {
        if (argv.verbose) {
          console.log(`🔍 [VERBOSE] Trying alternative textarea selector: ${textareaSelector}`);
        }
        await commander.waitForSelector({ selector: textareaSelector, visible: true, timeout: 2000 });
        if (argv.verbose) {
          console.log('🔍 [VERBOSE] Alternative textarea found and visible');
        }
      } catch {
        if (argv.verbose) {
          console.log('🔍 [VERBOSE] Alternative selector timed out after 2000ms, trying any textarea');
        }
        textareaSelector = 'textarea';
        console.log('⚠️  Warning: Using generic textarea selector (no data-qa found). This may be fragile.');
        try {
          if (argv.verbose) {
            console.log(`🔍 [VERBOSE] Trying any textarea selector: ${textareaSelector}`);
          }
          await commander.waitForSelector({ selector: textareaSelector, visible: true, timeout: 2000 });
          if (argv.verbose) {
            console.log('🔍 [VERBOSE] Any textarea found and visible');
          }
        } catch {
          console.log('⚠️  Cover letter textarea not found on vacancy_response page');
          const count = await commander.count({ selector: 'textarea' });
          console.log(`🔍 Found ${count} textarea(s) on page`);
          return;
        }
      }
    }

    // Fill cover letter
    if (argv.verbose) {
      console.log(`🔍 [VERBOSE] About to fill textarea with selector: ${textareaSelector}`);
    }
    const filled = await commander.fillTextArea({
      selector: textareaSelector,
      text: MESSAGE,
      checkEmpty: true,
      scrollIntoView: true,
      simulateTyping: true,
    });
    if (filled) {
      console.log(`✅ Prefilled cover letter message into: ${textareaSelector}`);
    } else {
      console.log('⏭️  Cover letter already contains text, skipping prefill');
    }

    // Count textareas
    const textareaCount = await commander.count({ selector: 'textarea' });
    console.log(`📊 Found ${textareaCount} textarea(s) on the page`);

    // Setup Q&A handling
    await setupQAHandling();

    // Auto-submit if only 1 textarea
    if (textareaCount === 1) {
      console.log('✅ Only one textarea found, safe to auto-submit');

      const submitSelector = '[data-qa="vacancy-response-submit-popup"]';
      const submitCount = await commander.count({ selector: submitSelector });

      if (submitCount === 0) {
        console.log('⚠️  Submit button not found');
        return;
      }

      const isButtonDisabled = await commander.evaluate({
        fn: (sel) => {
          const el = document.querySelector(sel);
          return el && (el.hasAttribute('disabled') || el.classList.contains('disabled'));
        },
        args: [submitSelector],
      });

      if (isButtonDisabled) {
        console.log('⚠️  Submit button is disabled, manual action required');
      } else {
        await commander.clickButton({
          selector: submitSelector,
          scrollIntoView: true,
        });
        console.log('✅ Clicked submit button');
        await commander.wait({ ms: 2000, reason: 'submission to complete' });
      }
    } else {
      console.log('⚠️  Multiple textareas found, manual submission required to avoid errors');
      console.log('💡 Please review and submit the form manually when ready');

      const savedCount = await saveQAPairs();
      if (savedCount > 0) {
        console.log(`💾 Saved ${savedCount} Q&A pair(s) to database`);
      }
    }
  }

  // Check if already on vacancy_response page
  const currentUrl = commander.getUrl();
  if (vacancyResponsePattern.test(currentUrl)) {
    await handleVacancyResponsePage();
    console.log('✅ Initial vacancy_response page handled. Script will continue monitoring...');
  }

  // Setup periodic Q&A saving and navigation listener
  let lastUrl = commander.getUrl();
  let lastSaveTime = Date.now();
  const SAVE_INTERVAL_MS = 5000;

  const saveInterval = setInterval(async () => {
    try {
      const currentUrl = commander.getUrl();
      const now = Date.now();

      if (vacancyResponsePattern.test(currentUrl) && (now - lastSaveTime) >= SAVE_INTERVAL_MS) {
        const savedCount = await saveQAPairs();
        if (savedCount > 0) {
          console.log(`💾 Auto-saved ${savedCount} Q&A pair(s)`);
          lastSaveTime = now;
        }
      }
    } catch {
      // Ignore errors during periodic save
    }
  }, SAVE_INTERVAL_MS);

  process.on('exit', () => clearInterval(saveInterval));

  // Setup navigation listener (engine-specific)
  const handleNavigation = async (currentUrl) => {
    try {
      const wasOnVacancyResponse = vacancyResponsePattern.test(lastUrl);
      const isOnVacancyResponse = vacancyResponsePattern.test(currentUrl);
      const vacancyPageMatch = currentUrl.match(vacancyPagePattern);

      // Track when navigating from vacancy_response to vacancy details page
      if (wasOnVacancyResponse && vacancyPageMatch) {
        const vacancyResponseMatch = lastUrl.match(/vacancyId=(\d+)/);
        if (vacancyResponseMatch) {
          const responseVacancyId = vacancyResponseMatch[1];
          const pageVacancyId = vacancyPageMatch[1];

          // Check if vacancyId matches
          if (responseVacancyId === pageVacancyId) {
            console.log(`📄 Navigated to vacancy details page (ID: ${pageVacancyId}) from vacancy_response`);
            isOnVacancyPageFromResponse = true;
          }
        }
      }

      // Save Q&A when leaving vacancy_response page
      if (wasOnVacancyResponse && !isOnVacancyResponse) {
        console.log('🔄 Navigation detected from vacancy_response page, saving Q&A pairs...');
        const savedCount = await saveQAPairs();
        if (savedCount > 0) {
          console.log(`💾 Saved ${savedCount} Q&A pair(s) before navigation`);
        }
      }

      // Reset flag when leaving vacancy page
      if (!vacancyPageMatch) {
        isOnVacancyPageFromResponse = false;
      }

      lastUrl = currentUrl;
    } catch (error) {
      console.log('⚠️  Error in navigation handler:', error.message);
    }
  };

  if (commander.engine === 'playwright') {
    page.on('framenavigated', async (frame) => {
      if (frame !== page.mainFrame()) return;
      await handleNavigation(frame.url());
    });
  } else {
    // Puppeteer navigation listener
    page.on('framenavigated', async (frame) => {
      if (frame !== page.mainFrame()) return;
      await handleNavigation(frame.url());
    });
  }

  /**
   * Setup click listener on vacancy page to detect "Откликнуться" button clicks
   * When clicked from vacancy_response flow, redirect back to START_URL
   */
  async function setupVacancyPageClickListener() {
    try {
      await commander.evaluate({
        fn: () => {
          // Add click listener to all links
          document.addEventListener('click', (event) => {
            const target = event.target.closest('a, button');
            if (target && target.textContent.trim() === 'Откликнуться') {
              // Store flag in sessionStorage to trigger redirect after response
              window.sessionStorage.setItem('shouldRedirectAfterResponse', 'true');
            }
          }, true);
        },
      });
    } catch (error) {
      console.log('⚠️  Error setting up vacancy page click listener:', error.message);
    }
  }

  /**
   * Check if we should redirect after vacancy response
   * This is checked after clicking "Откликнуться" on vacancy page from vacancy_response flow
   */
  async function checkAndRedirectIfNeeded() {
    try {
      const shouldRedirect = await commander.evaluate({
        fn: () => {
          const flag = window.sessionStorage.getItem('shouldRedirectAfterResponse');
          if (flag === 'true') {
            window.sessionStorage.removeItem('shouldRedirectAfterResponse');
            return true;
          }
          return false;
        },
      });

      if (shouldRedirect && isOnVacancyPageFromResponse) {
        console.log('✅ Response submitted from vacancy page, redirecting back to search page...');
        await commander.goto({ url: START_URL });
        await commander.wait({ ms: 1000, reason: 'page to load after redirect' });
        // Reset the tracking flag
        isOnVacancyPageFromResponse = false;
        return true;
      }

      return false;
    } catch (error) {
      console.log('⚠️  Error checking redirect condition:', error.message);
      return false;
    }
  }

  // Setup click listener whenever we navigate to a vacancy page from vacancy_response
  if (commander.engine === 'playwright') {
    page.on('framenavigated', async (frame) => {
      if (frame !== page.mainFrame()) return;
      const currentUrl = frame.url();
      if (isOnVacancyPageFromResponse && vacancyPagePattern.test(currentUrl)) {
        await setupVacancyPageClickListener();
      }
    });
  } else {
    page.on('framenavigated', async (frame) => {
      if (frame !== page.mainFrame()) return;
      const currentUrl = frame.url();
      if (isOnVacancyPageFromResponse && vacancyPagePattern.test(currentUrl)) {
        await setupVacancyPageClickListener();
      }
    });
  }

  // Main loop to process all "Откликнуться" buttons
  while (true) {
    // Check if we should redirect back from vacancy page
    const didRedirect = await checkAndRedirectIfNeeded();
    if (didRedirect) {
      continue;
    }

    // Find "Откликнуться" button using text selector
    const buttonSelector = await commander.findByText({ text: 'Откликнуться', selector: 'a' });
    const buttonCount = await commander.count({ selector: buttonSelector });

    if (buttonCount === 0) {
      console.log('✅ No more "Откликнуться" buttons found. Automation completed successfully.');
      break;
    }

    console.log(`📋 Found ${buttonCount} "Откликнуться" button(s). Processing next button...`);

    // Click first button with smooth scrolling animation
    await commander.clickButton({
      selector: buttonSelector,
      scrollIntoView: true,
      smoothScroll: true,
    });

    // Handle navigation or modal
    await Promise.race([
      commander.wait({ ms: 2000, reason: 'navigation or modal to appear' }),
      commander.waitForNavigation({ timeout: 2000 }).catch(() => {}),
    ]);

    await commander.wait({ ms: 2000, reason: 'delayed redirects to complete' });

    const currentUrl = commander.getUrl();

    if (!targetPagePattern.test(currentUrl)) {
      console.log('⚠️  Redirected to a different page:', currentUrl);

      if (vacancyResponsePattern.test(currentUrl)) {
        console.log('💡 This is a vacancy_response page, handling automatically...');
        await handleVacancyResponsePage();

        await commander.wait({ ms: 2000, reason: 'potential redirect or manual navigation' });

        const newUrl = commander.getUrl();
        if (targetPagePattern.test(newUrl)) {
          console.log('✅ Back on search page after submission');
          await commander.wait({ ms: 1000, reason: 'page to fully load' });
          continue;
        } else if (vacancyResponsePattern.test(newUrl)) {
          console.log('💡 Waiting for you to complete and navigate back to:', START_URL);

          const savedCount = await saveQAPairs();
          if (savedCount > 0) {
            console.log(`💾 Saved ${savedCount} Q&A pair(s) before waiting for navigation`);
          }

          await waitForUrlCondition(START_URL, 'Waiting for you to return to the target page');
          if (pageClosedByUser) {
            return;
          }
          console.log('✅ Returned to target page! Continuing with button loop...');
          await commander.wait({ ms: 1000, reason: 'page to fully load after navigation' });
          continue;
        }
      } else {
        console.log('💡 This appears to be a separate application form page.');
        console.log('💡 Please fill out the form manually. Take as much time as you need.');
        console.log('💡 Once done, navigate back to:', START_URL);

        await waitForUrlCondition(START_URL, 'Waiting for you to return to the target page');

        if (pageClosedByUser) {
          return;
        }

        console.log('✅ Returned to target page! Continuing with button loop...');
        await commander.wait({ ms: 1000, reason: 'page to fully load after manual navigation' });
        continue;
      }
    }

    // Wait for modal
    let modalAppeared = false;
    try {
      await commander.waitForSelector({
        selector: 'form#RESPONSE_MODAL_FORM_ID[name="vacancy_response"]',
        visible: true,
        timeout: 10000,
      });
      modalAppeared = true;
    } catch {
      console.log('⚠️  Modal did not appear within timeout. This may be a different type of vacancy response.');
      console.log('💡 Skipping this button and moving to the next one...');
      continue;
    }

    if (!modalAppeared) {
      continue;
    }

    // Check for limit error
    const limitErrorCount = await commander.count({
      selector: '[data-qa-popup-error-code="negotiations-limit-exceeded"]',
    });

    if (limitErrorCount > 0) {
      console.log('⚠️  Limit reached: 200 applications in 24 hours');
      console.log('💤 Waiting 1 hour before retrying...');

      const closeButtonCount = await commander.count({ selector: '[data-qa="response-popup-close"]' });
      if (closeButtonCount > 0) {
        await commander.clickButton({ selector: '[data-qa="response-popup-close"]' });
        console.log('✅ Closed the application modal');
      }

      const oneHourInMs = 60 * 60 * 1000;
      await commander.wait({ ms: oneHourInMs, reason: '200 application limit cooldown (1 hour)' });

      console.log('🔄 Refreshing the page after wait period...');
      await commander.goto({ url: START_URL });
      await commander.wait({ ms: 2000, reason: 'page to load after refresh' });
      continue;
    }

    // Click cover letter toggle
    let coverToggleSelector = null;
    let coverToggleCount = 0;

    // Try data-qa selectors first
    const coverDataQaSelectors = [
      '[data-qa="add-cover-letter"]',
      '[data-qa="vacancy-response-letter-toggle"]',
    ];

    for (const sel of coverDataQaSelectors) {
      const count = await commander.count({ selector: sel });
      if (count > 0) {
        coverToggleSelector = sel;
        coverToggleCount = count;
        break;
      }
    }

    // Fallback to text search
    if (coverToggleCount === 0) {
      const elementTypes = ['button', 'a'];
      for (const elementType of elementTypes) {
        coverToggleSelector = await commander.findByText({
          text: 'сопроводительное',
          selector: elementType,
        });
        coverToggleCount = await commander.count({ selector: coverToggleSelector });
        if (coverToggleCount > 0) {
          break;
        }
      }
    }

    if (coverToggleCount > 0) {
      if (argv.verbose) {
        const text = await commander.textContent({ selector: coverToggleSelector });
        const dataQa = await commander.getAttribute({ selector: coverToggleSelector, attribute: 'data-qa' });
        console.log(`🔍 [VERBOSE] Clicking cover letter toggle: text="${text?.trim()}", data-qa="${dataQa}"`);
      }
      await commander.clickButton({ selector: coverToggleSelector });
    }

    // Fill cover letter in modal
    const filled = await commander.fillTextArea({
      selector: 'textarea[data-qa="vacancy-response-popup-form-letter-input"]',
      text: MESSAGE,
      checkEmpty: true,
      scrollIntoView: true,
      simulateTyping: true,
    });
    if (filled) {
      console.log(`✅ ${commander.engine}: typed message successfully`);
    } else {
      console.log(`⏭️  ${commander.engine}: textarea already contains text, skipping typing to prevent double entry`);
    }

    // Verify textarea value
    const textareaValue = await commander.inputValue({
      selector: 'textarea[data-qa="vacancy-response-popup-form-letter-input"]',
    });
    if (textareaValue === MESSAGE) {
      console.log(`✅ ${commander.engine}: verified textarea contains target message`);
    } else {
      console.error(`❌ ${commander.engine}: textarea value does not match expected message`);
      console.error('Expected:', MESSAGE);
      console.error('Actual:', textareaValue);
    }

    // Check if submit button is disabled
    const submitButtonSelector = '[data-qa="vacancy-response-submit-popup"]';
    const isButtonDisabled = await commander.evaluate({
      fn: (sel) => {
        const el = document.querySelector(sel);
        return el && (el.hasAttribute('disabled') || el.classList.contains('disabled'));
      },
      args: [submitButtonSelector],
    });

    if (isButtonDisabled) {
      console.error('❌ Application button is still disabled after entering the message!');

      try {
        const modalText = await commander.evaluate({
          fn: () => {
            const form = document.querySelector('form#RESPONSE_MODAL_FORM_ID[name="vacancy_response"]');
            return form ? form.innerText : 'Could not find modal';
          },
        });

        console.error('📋 Reason from modal:');
        console.error(modalText);
      } catch {
        console.error('⚠️  Could not extract detailed error message from modal');
      }

      console.error('');
      console.error('💡 Please resolve this issue and try again.');

      if (browser) {
        await browser.close();
      }
      process.exit(1);
    }

    // Click submit button
    await commander.clickButton({
      selector: submitButtonSelector,
      scrollIntoView: true,
    });
    console.log(`✅ ${commander.engine}: clicked submit button`);

    await commander.wait({ ms: 2000, reason: 'modal to close after submission' });

    console.log(`⏳ Waiting ${BUTTON_CLICK_INTERVAL / 1000} seconds before processing next button...`);
    await commander.wait({ ms: BUTTON_CLICK_INTERVAL, reason: 'interval before next application' });
  }
})().catch(async (error) => {
  console.error('❌ Error occurred:', error.message);
  process.exit(1);
});
