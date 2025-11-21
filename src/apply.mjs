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
    .option('auto-submit-vacancy-response-form', {
      type: 'boolean',
      description: 'Auto-submit vacancy response forms when all questions are answered (default: false for safety)',
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

  // Declare patterns and tracking variables early (used by waitForUrlCondition and other functions)
  const targetPagePattern = /^https:\/\/hh\.ru\/search\/vacancy/;
  const vacancyResponsePattern = /^https:\/\/hh\.ru\/applicant\/vacancy_response\?vacancyId=/;
  const vacancyPagePattern = /^https:\/\/hh\.ru\/vacancy\/(\d+)/;
  const BUTTON_CLICK_INTERVAL = argv['job-application-interval'] * 1000;
  let isOnVacancyPageFromResponse = false;
  let clickListenerInstalled = false;
  let lastVacancyPageUrl = '';

  /**
   * Robust waiting function that waits indefinitely for a URL condition
   * Also checks for redirect flag if we're on a vacancy page from vacancy_response
   */
  async function waitForUrlCondition(targetUrl, description) {
    const pollingInterval = 1000;
    console.log(`⏳ ${description}...`);

    while (true) {
      if (pageClosedByUser) {
        return;
      }

      try {
        // Check if we should redirect (button was clicked on vacancy page)
        const currentUrl = commander.getUrl();
        if (isOnVacancyPageFromResponse && vacancyPagePattern.test(currentUrl)) {
          // Check both sessionStorage flag AND page content for "Вы откликнулись"
          const redirectInfo = await commander.evaluate({
            fn: () => {
              const flag = window.sessionStorage.getItem('shouldRedirectAfterResponse');
              // Normalize whitespace (including nbsp) for matching
              const bodyText = document.body.textContent.replace(/\s+/g, ' ');

              // Check for various response texts (handle nbsp and multiple spaces)
              const hasResponseText = bodyText.includes('Вы откликнулись');
              const hasAlreadyResponded = bodyText.includes('Вы уже откликались');
              const hasResponseSent = bodyText.includes('Отклик отправлен');

              // Find button with "Откликнуться" text
              const buttons = Array.from(document.querySelectorAll('a, button'));
              const respondButton = buttons.find(b => b.textContent.trim() === 'Откликнуться');

              return {
                hasFlag: flag === 'true',
                hasResponseText,
                hasAlreadyResponded,
                hasResponseSent,
                hasRespondButton: !!respondButton,
                // Only redirect if flag is set (button was clicked during this session)
                needsRedirect: flag === 'true',
              };
            },
          });

          if (argv.verbose && isOnVacancyPageFromResponse) {
            console.log(`🔍 [VERBOSE] Checking redirect on vacancy page: ${currentUrl}`);
            console.log(`🔍 [VERBOSE] sessionStorage flag: ${redirectInfo.hasFlag}`);
            console.log(`🔍 [VERBOSE] "Вы откликнулись": ${redirectInfo.hasResponseText}`);
            console.log(`🔍 [VERBOSE] "Вы уже откликались": ${redirectInfo.hasAlreadyResponded}`);
            console.log(`🔍 [VERBOSE] "Отклик отправлен": ${redirectInfo.hasResponseSent}`);
            console.log(`🔍 [VERBOSE] Has "Откликнуться" button: ${redirectInfo.hasRespondButton}`);
          }

          if (redirectInfo.needsRedirect) {
            if (redirectInfo.hasFlag) {
              console.log('✅ Detected "Откликнуться" button click via sessionStorage flag!');
            } else {
              console.log('✅ Detected application submission via "Вы откликнулись" text on page!');
            }
            // Trigger redirect by returning and letting the caller handle it
            return 'redirect_needed';
          }
        }

        // Check if target URL reached
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

    console.log('💡 The browser will automatically continue once you are redirected to:', START_URL);

    await waitForUrlCondition(START_URL, 'Waiting for you to complete login');

    if (!pageClosedByUser) {
      console.log('✅ Login successful! Proceeding with automation...');
    }
  } else {
    await commander.goto({ url: START_URL });
  }

  /**
   * Setup Q&A auto-fill and auto-save for all textareas and radio buttons on the page
   */
  async function setupQAHandling() {
    try {
      const qaMap = await readQADatabase();

      // Extract all questions from the page (both textareas and radio buttons)
      const pageQuestions = await commander.evaluate({
        fn: () => {
          const questions = [];

          // Extract textarea questions
          const textareas = document.querySelectorAll('textarea');
          textareas.forEach((textarea, index) => {
            const taskBody = textarea.closest('[data-qa="task-body"]');
            if (!taskBody) return;

            const questionEl = taskBody.querySelector('[data-qa="task-question"]');
            if (!questionEl) return;

            const question = questionEl.textContent.trim();
            if (question) {
              const selector = textarea.name ? `textarea[name="${textarea.name}"]` : `textarea:nth-of-type(${index + 1})`;
              questions.push({
                type: 'textarea',
                question,
                selector,
                index,
                currentValue: textarea.value.trim(),
              });
            }
          });

          // Extract radio button questions
          const taskBodies = document.querySelectorAll('[data-qa="task-body"]');
          taskBodies.forEach((taskBody) => {
            const questionEl = taskBody.querySelector('[data-qa="task-question"]');
            if (!questionEl) return;

            const question = questionEl.textContent.trim();
            if (!question) return;

            // Find radio buttons in this task body
            const radioInputs = taskBody.querySelectorAll('input[type="radio"]');
            const checkboxInputs = taskBody.querySelectorAll('input[type="checkbox"]');

            if (radioInputs.length === 0 && checkboxInputs.length === 0) return;

            // Group radio buttons by name
            const radiosByName = {};
            radioInputs.forEach((radio) => {
              if (!radio.name) return;
              if (!radiosByName[radio.name]) {
                radiosByName[radio.name] = [];
              }

              // Find the label text for this radio option
              const cell = radio.closest('[data-qa="cell"]');
              let optionText = '';
              if (cell) {
                const textContent = cell.querySelector('[data-qa="cell-text-content"]');
                if (textContent) {
                  optionText = textContent.textContent.trim();
                }
              }

              radiosByName[radio.name].push({
                value: radio.value,
                optionText,
                checked: radio.checked,
              });
            });

            // Group checkboxes by name
            const checkboxesByName = {};
            checkboxInputs.forEach((checkbox) => {
              if (!checkbox.name) return;
              if (!checkboxesByName[checkbox.name]) {
                checkboxesByName[checkbox.name] = [];
              }

              // Find the label text for this checkbox option
              const cell = checkbox.closest('[data-qa="cell"]');
              let optionText = '';
              if (cell) {
                const textContent = cell.querySelector('[data-qa="cell-text-content"]');
                if (textContent) {
                  optionText = textContent.textContent.trim();
                }
              }

              checkboxesByName[checkbox.name].push({
                value: checkbox.value,
                optionText,
                checked: checkbox.checked,
              });
            });

            // Add radio question with all options
            Object.entries(radiosByName).forEach(([name, options]) => {
              const checkedOption = options.find(opt => opt.checked);
              const currentAnswer = checkedOption ? checkedOption.optionText : '';

              questions.push({
                type: 'radio',
                question,
                name,
                options,
                currentAnswer,
                selector: `input[name="${name}"]`,
              });
            });

            // Add checkbox question with all options
            Object.entries(checkboxesByName).forEach(([name, options]) => {
              const checkedOptions = options.filter(opt => opt.checked);
              const currentAnswers = checkedOptions.map(opt => opt.optionText);

              questions.push({
                type: 'checkbox',
                question,
                name,
                options,
                currentAnswers, // Array of checked options
                selector: `input[name="${name}"]`,
              });
            });
          });

          return questions;
        },
      });

      const questionToAnswer = new Map();

      // Match questions with answers from database
      for (const item of pageQuestions) {
        const match = findBestMatch(item.question, qaMap);
        if (match) {
          questionToAnswer.set(item.question, {
            ...item,
            answer: match.answer,
            matchScore: match.score,
          });
          console.log(`[QA] Fuzzy match for "${item.question}" (score: ${match.score.toFixed(3)})`);
          console.log(`[QA] Matched to: "${match.question}"`);
          console.log(`[QA] Answer: "${match.answer}"`);
        }
      }

      // Auto-fill textareas and select radio buttons
      for (const [question, data] of questionToAnswer) {
        try {
          if (data.type === 'textarea') {
            // Skip if textarea already has content
            if (data.currentValue) {
              console.log(`[QA] Textarea already has content for: ${question}`);
              continue;
            }

            const filled = await commander.fillTextArea({
              selector: data.selector,
              text: data.answer,
              checkEmpty: true,
              scrollIntoView: true,
              simulateTyping: true,
            });
            if (filled) {
              console.log(`[QA] Prefilled textarea for: ${question}`);
            }
          } else if (data.type === 'radio') {
            // Answer could be a string or array of options
            const answers = Array.isArray(data.answer) ? data.answer : [data.answer];

            // Find matching radio option by comparing option text with any answer
            let matchingOption = null;
            for (const ans of answers) {
              matchingOption = data.options.find(opt =>
                opt.optionText && ans &&
                (opt.optionText.toLowerCase().includes(ans.toLowerCase().substring(0, 20)) ||
                 ans.toLowerCase().includes(opt.optionText.toLowerCase())),
              );
              if (matchingOption) break;
            }

            if (matchingOption) {
              // Click the matching radio button with smooth scroll animation
              const radioSelector = `input[name="${data.name}"][value="${matchingOption.value}"]`;

              // Check if already checked before clicking
              const alreadyChecked = await commander.evaluate({
                fn: (selector) => {
                  const radio = document.querySelector(selector);
                  return radio ? radio.checked : false;
                },
                args: [radioSelector],
              });

              if (!alreadyChecked) {
                // Use clickButton for smooth scroll animation
                await commander.clickButton({
                  selector: radioSelector,
                  scrollIntoView: true,
                  smoothScroll: true,
                });
                console.log(`[QA] Selected radio option "${matchingOption.optionText}" for: ${question}`);
                await commander.wait({ ms: 300, reason: 'visual feedback after radio selection' });
              } else {
                console.log(`[QA] Radio option "${matchingOption.optionText}" already selected for: ${question}`);
              }

              // If it's a custom answer option (value="open"), fill the associated textarea
              if (matchingOption.value === 'open') {
                const customTextarea = await commander.evaluate({
                  fn: (name) => {
                    const textareaName = name + '_text';
                    const textarea = document.querySelector(`textarea[name="${textareaName}"]`);
                    return textarea ? textareaName : null;
                  },
                  args: [data.name],
                });

                if (customTextarea) {
                  // Use the first answer if it's an array
                  const textToFill = Array.isArray(data.answer) ? data.answer[0] : data.answer;
                  await commander.fillTextArea({
                    selector: `textarea[name="${customTextarea}"]`,
                    text: textToFill,
                    checkEmpty: true,
                    scrollIntoView: true,
                    simulateTyping: true,
                  });
                  console.log(`[QA] Filled custom textarea for: ${question}`);
                }
              }
            } else {
              console.log(`[QA] No matching radio option found for: ${question}`);
            }
          } else if (data.type === 'checkbox') {
            // Handle multi-select checkboxes
            const answers = Array.isArray(data.answer) ? data.answer : [data.answer];

            for (const ans of answers) {
              const matchingOption = data.options.find(opt =>
                opt.optionText && ans &&
                (opt.optionText.toLowerCase().includes(ans.toLowerCase().substring(0, 20)) ||
                 ans.toLowerCase().includes(opt.optionText.toLowerCase())),
              );

              if (matchingOption) {
                const checkboxSelector = `input[name="${data.name}"][value="${matchingOption.value}"]`;

                // Check if already checked before clicking
                const alreadyChecked = await commander.evaluate({
                  fn: (selector) => {
                    const checkbox = document.querySelector(selector);
                    return checkbox ? checkbox.checked : false;
                  },
                  args: [checkboxSelector],
                });

                if (!alreadyChecked) {
                  // Use clickButton for smooth scroll animation
                  await commander.clickButton({
                    selector: checkboxSelector,
                    scrollIntoView: true,
                    smoothScroll: true,
                  });
                  console.log(`[QA] Checked option "${matchingOption.optionText}" for: ${question}`);
                  await commander.wait({ ms: 300, reason: 'visual feedback after checkbox selection' });
                } else {
                  console.log(`[QA] Option "${matchingOption.optionText}" already checked for: ${question}`);
                }

                // Handle custom text option for checkboxes
                if (matchingOption.value === 'open') {
                  const customTextarea = await commander.evaluate({
                    fn: (name) => {
                      const textareaName = name + '_text';
                      const textarea = document.querySelector(`textarea[name="${textareaName}"]`);
                      return textarea ? textareaName : null;
                    },
                    args: [data.name],
                  });

                  if (customTextarea) {
                    await commander.fillTextArea({
                      selector: `textarea[name="${customTextarea}"]`,
                      text: ans,
                      checkEmpty: true,
                      scrollIntoView: true,
                      simulateTyping: true,
                    });
                    console.log(`[QA] Filled custom textarea for checkbox: ${question}`);
                  }
                }
              }
            }
          }
        } catch (error) {
          console.error(`[QA] Error autofilling for "${question}":`, error.message);
        }
      }

      // Setup auto-save listeners for textareas
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
   * Save Q&A pairs from textareas and radio buttons after user interaction
   */
  async function saveQAPairs() {
    try {
      const qaPairs = await commander.evaluate({
        fn: () => {
          const pairs = [];

          // Save textarea answers
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

          // Save radio button and checkbox selections
          const taskBodies = document.querySelectorAll('[data-qa="task-body"]');
          taskBodies.forEach((taskBody) => {
            const questionEl = taskBody.querySelector('[data-qa="task-question"]');
            if (!questionEl) return;

            const question = questionEl.textContent.trim();
            if (!question) return;

            // Find checked radio button in this task body
            const checkedRadio = taskBody.querySelector('input[type="radio"]:checked');
            if (checkedRadio) {
              // Get the option text for the checked radio
              const cell = checkedRadio.closest('[data-qa="cell"]');
              if (!cell) return;

              const textContent = cell.querySelector('[data-qa="cell-text-content"]');
              if (!textContent) return;

              let answer = textContent.textContent.trim();

              // If it's a custom answer (value="open"), get the textarea value
              if (checkedRadio.value === 'open') {
                const customTextarea = taskBody.querySelector(`textarea[name="${checkedRadio.name}_text"]`);
                if (customTextarea && customTextarea.value.trim()) {
                  answer = customTextarea.value.trim();
                }
              }

              if (answer) {
                pairs.push({ question, answer });
              }
            }

            // Find checked checkboxes in this task body
            const checkedCheckboxes = taskBody.querySelectorAll('input[type="checkbox"]:checked');
            if (checkedCheckboxes.length > 0) {
              const answers = [];

              checkedCheckboxes.forEach((checkbox) => {
                const cell = checkbox.closest('[data-qa="cell"]');
                if (!cell) return;

                const textContent = cell.querySelector('[data-qa="cell-text-content"]');
                if (!textContent) return;

                let answer = textContent.textContent.trim();

                // If it's a custom answer (value="open"), get the textarea value
                if (checkbox.value === 'open') {
                  const customTextarea = taskBody.querySelector(`textarea[name="${checkbox.name}_text"]`);
                  if (customTextarea && customTextarea.value.trim()) {
                    answer = customTextarea.value.trim();
                  }
                }

                if (answer) {
                  answers.push(answer);
                }
              });

              if (answers.length > 0) {
                // Store as array if multiple, or single string if only one
                const finalAnswer = answers.length === 1 ? answers[0] : answers;
                pairs.push({ question, answer: finalAnswer });
              }
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

    // Setup Q&A handling first (this will auto-fill answers from database)
    await setupQAHandling();

    // Count total test questions and unanswered test questions
    const testQuestionStats = await commander.evaluate({
      fn: () => {
        const taskBodies = document.querySelectorAll('[data-qa="task-body"]');
        let totalCount = 0;
        let unansweredCount = 0;

        taskBodies.forEach((taskBody) => {
          const radios = taskBody.querySelectorAll('input[type="radio"]');
          const checkboxes = taskBody.querySelectorAll('input[type="checkbox"]');

          // Check if it's a radio question
          if (radios.length > 0) {
            totalCount++;
            const hasSelection = Array.from(radios).some(radio => radio.checked);
            if (!hasSelection) {
              unansweredCount++;
            }
          }

          // Check if it's a checkbox question
          if (checkboxes.length > 0 && radios.length === 0) {
            totalCount++;
            const hasSelection = Array.from(checkboxes).some(checkbox => checkbox.checked);
            if (!hasSelection) {
              unansweredCount++;
            }
          }
        });
        return { totalCount, unansweredCount };
      },
    });

    const hasTestQuestions = testQuestionStats.totalCount > 0;
    const hasUnansweredQuestions = testQuestionStats.unansweredCount > 0;

    if (hasUnansweredQuestions) {
      console.log(`⚠️  Found ${testQuestionStats.unansweredCount} of ${testQuestionStats.totalCount} test question(s) UNANSWERED`);
      console.log('💡 Cannot auto-submit when test questions remain unanswered - manual submission required');
      console.log('💡 Please answer the remaining questions and submit the form manually when ready');
      return;
    }

    // Decide whether to auto-submit based on configuration and question presence
    let shouldAutoSubmit = false;

    if (!hasTestQuestions) {
      // No test questions - always auto-submit (only cover letter)
      shouldAutoSubmit = true;
      console.log('✅ No test questions found, only cover letter - will auto-submit');
    } else if (argv['auto-submit-vacancy-response-form']) {
      // Has test questions but all answered and flag is enabled
      shouldAutoSubmit = true;
      console.log(`✅ All ${testQuestionStats.totalCount} test question(s) answered and --auto-submit-vacancy-response-form enabled - will auto-submit`);
    } else {
      // Has test questions, all answered, but flag is disabled
      shouldAutoSubmit = false;
      console.log(`💡 All ${testQuestionStats.totalCount} test question(s) answered, but --auto-submit-vacancy-response-form is disabled`);
      console.log('💡 Please review the answers and submit the form manually when ready');
      return;
    }

    // Auto-submit if only 1 textarea and decided to auto-submit
    if (textareaCount === 1 && shouldAutoSubmit) {
      console.log('✅ Proceeding with auto-submit');

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
      // Log all URL changes for debugging
      if (currentUrl !== lastUrl) {
        console.log(`🔗 [URL CHANGE] ${lastUrl} → ${currentUrl}`);
      }

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
            console.log('🎯 Setting flag isOnVacancyPageFromResponse = true');
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

      // Check for redirect after clicking "Откликнуться" button on vacancy page
      if (isOnVacancyPageFromResponse && vacancyPageMatch) {
        const wasOnVacancyPage = lastUrl && vacancyPagePattern.test(lastUrl);

        // If we're navigating between different versions of the same vacancy page
        if (wasOnVacancyPage) {
          // Check if application was submitted (page shows "Вы откликнулись")
          // This happens after clicking "Откликнуться" on vacancy_response page and submitting
          const submissionInfo = await commander.evaluate({
            fn: () => {
              // Normalize whitespace (including nbsp) for matching
              const bodyText = document.body.textContent.replace(/\s+/g, ' ');
              const hasResponseText = bodyText.includes('Вы откликнулись');
              const hasAlreadyResponded = bodyText.includes('Вы уже откликались');
              const hasResponseSent = bodyText.includes('Отклик отправлен');

              return {
                hasResponseText,
                hasAlreadyResponded,
                hasResponseSent,
                // If we came from vacancy_response and see response confirmation, redirect
                hasSubmitted: hasResponseText || hasAlreadyResponded || hasResponseSent,
              };
            },
          });

          if (argv.verbose) {
            console.log(`🔍 [VERBOSE] Navigation handler checking submission on: ${currentUrl}`);
            console.log(`🔍 [VERBOSE] "Вы откликнулись": ${submissionInfo.hasResponseText}`);
            console.log(`🔍 [VERBOSE] "Вы уже откликались": ${submissionInfo.hasAlreadyResponded}`);
            console.log(`🔍 [VERBOSE] "Отклик отправлен": ${submissionInfo.hasResponseSent}`);
            console.log(`🔍 [VERBOSE] Will redirect: ${submissionInfo.hasSubmitted}`);
          }

          if (submissionInfo.hasSubmitted) {
            console.log('✅ Detected application submission completed (user clicked on vacancy_response page), triggering redirect...');
            // Redirect to START_URL
            console.log(`🔄 Redirecting to: ${START_URL}`);
            await commander.goto({ url: START_URL });
            await commander.wait({ ms: 1000, reason: 'page to load after redirect' });
            // Reset tracking flags
            isOnVacancyPageFromResponse = false;
            clickListenerInstalled = false;
            lastVacancyPageUrl = '';
            console.log('✅ Returned to search page! Continuing automation...');
          }
        }
      }

      // Reset flag when leaving vacancy page
      if (!vacancyPageMatch) {
        if (isOnVacancyPageFromResponse) {
          console.log('🔄 Leaving vacancy page, resetting isOnVacancyPageFromResponse flag');
        }
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
      console.log('🎧 Setting up click listener for "Откликнуться" button on vacancy page');
      await commander.evaluate({
        fn: () => {
          // Add click listener to document (capture phase to catch all clicks)
          document.addEventListener('click', (event) => {
            // Check if clicked element or any parent contains "Откликнуться" text
            let element = event.target;
            while (element && element !== document.body) {
              const text = element.textContent?.trim() || '';
              // Check for button text (handles both exact match and contains)
              if (text === 'Откликнуться' || (element.tagName === 'A' || element.tagName === 'BUTTON') && text.includes('Откликнуться')) {
                console.log('[Click Listener] Detected click on Откликнуться button!');
                window.sessionStorage.setItem('shouldRedirectAfterResponse', 'true');
                break;
              }
              element = element.parentElement;
            }
          }, true);
        },
      });
      console.log('✅ Click listener setup completed');
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
      const currentUrl = commander.getUrl();

      if (argv.verbose) {
        console.log('🔍 [VERBOSE] checkAndRedirectIfNeeded called');
        console.log(`🔍 [VERBOSE] Current URL: ${currentUrl}`);
        console.log(`🔍 [VERBOSE] isOnVacancyPageFromResponse: ${isOnVacancyPageFromResponse}`);
      }

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

      if (argv.verbose) {
        console.log(`🔍 [VERBOSE] shouldRedirect from sessionStorage: ${shouldRedirect}`);
      }

      if (shouldRedirect) {
        console.log('✅ Detected "Откликнуться" button was clicked on vacancy page!');
        if (isOnVacancyPageFromResponse) {
          console.log('✅ Response submitted from vacancy page, redirecting back to search page...');
          await commander.goto({ url: START_URL });
          await commander.wait({ ms: 1000, reason: 'page to load after redirect' });
          // Reset the tracking flag
          isOnVacancyPageFromResponse = false;
          clickListenerInstalled = false;
          lastVacancyPageUrl = '';
          return true;
        } else {
          console.log('⚠️  shouldRedirect=true but isOnVacancyPageFromResponse=false - this should not happen');
        }
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

      // Check if this is a new vacancy page (not just parameter change)
      const vacancyMatch = currentUrl.match(vacancyPagePattern);
      const currentVacancyId = vacancyMatch ? vacancyMatch[1] : null;
      const lastVacancyId = lastVacancyPageUrl.match(vacancyPagePattern)?.[1];

      if (isOnVacancyPageFromResponse && vacancyMatch) {
        // Only install listener once per vacancy page
        if (!clickListenerInstalled || currentVacancyId !== lastVacancyId) {
          console.log(`🔧 Detected NEW vacancy page (ID: ${currentVacancyId}) with isOnVacancyPageFromResponse=true, setting up click listener...`);
          await setupVacancyPageClickListener();
          clickListenerInstalled = true;
          lastVacancyPageUrl = currentUrl;
        }
      } else {
        // Reset when leaving vacancy page
        clickListenerInstalled = false;
        lastVacancyPageUrl = '';
      }
    });
  } else {
    page.on('framenavigated', async (frame) => {
      if (frame !== page.mainFrame()) return;
      const currentUrl = frame.url();

      // Check if this is a new vacancy page (not just parameter change)
      const vacancyMatch = currentUrl.match(vacancyPagePattern);
      const currentVacancyId = vacancyMatch ? vacancyMatch[1] : null;
      const lastVacancyId = lastVacancyPageUrl.match(vacancyPagePattern)?.[1];

      if (isOnVacancyPageFromResponse && vacancyMatch) {
        // Only install listener once per vacancy page
        if (!clickListenerInstalled || currentVacancyId !== lastVacancyId) {
          console.log(`🔧 Detected NEW vacancy page (ID: ${currentVacancyId}) with isOnVacancyPageFromResponse=true, setting up click listener...`);
          await setupVacancyPageClickListener();
          clickListenerInstalled = true;
          lastVacancyPageUrl = currentUrl;
        }
      } else {
        // Reset when leaving vacancy page
        clickListenerInstalled = false;
        lastVacancyPageUrl = '';
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

    // Wait for any modals to close before proceeding
    try {
      await commander.evaluate({
        fn: () => {
          const modal = document.querySelector('[data-qa="modal-overlay"]');
          if (modal) {
            console.log('[Main Loop] Waiting for modal to close...');
          }
        },
      });
      await commander.wait({ ms: 500, reason: 'ensuring no modals are open' });
    } catch {
      // Ignore errors
    }

    // Find "Откликнуться" button using text selector
    const buttonSelector = await commander.findByText({ text: 'Откликнуться', selector: 'a' });
    const buttonCount = await commander.count({ selector: buttonSelector });

    if (buttonCount === 0) {
      console.log('✅ No more "Откликнуться" buttons found. Automation completed successfully.');
      break;
    }

    console.log(`📋 Found ${buttonCount} "Откликнуться" button(s). Processing next button...`);

    // Check if first button is enabled before clicking
    const isEnabled = await commander.isEnabled({ selector: buttonSelector });

    if (!isEnabled) {
      console.log('⚠️  First button is disabled or loading, waiting 2 seconds...');
      await commander.wait({ ms: 2000, reason: 'button to become enabled' });
      continue;
    }

    // Click first button with smooth scrolling animation
    try {
      await commander.clickButton({
        selector: buttonSelector,
        scrollIntoView: true,
        smoothScroll: true,
      });
    } catch (error) {
      console.log(`⚠️  Error clicking button: ${error.message}`);
      console.log('💡 Button might be disabled or modal is open, waiting 2 seconds and retrying...');
      await commander.wait({ ms: 2000, reason: 'retry after click error' });
      continue;
    }

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

          const waitResult = await waitForUrlCondition(START_URL, 'Waiting for you to return to the target page');
          if (pageClosedByUser) {
            return;
          }

          // Check if button was clicked and redirect if needed
          if (waitResult === 'redirect_needed') {
            const didRedirect = await checkAndRedirectIfNeeded();
            if (didRedirect) {
              console.log('✅ Redirected back to search page after detecting button click');
            }
          } else {
            console.log('✅ Returned to target page! Continuing with button loop...');
          }

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

    // Check for UNANSWERED test questions in modal (after potential auto-fill)
    const modalUnansweredTestQuestionCount = await commander.evaluate({
      fn: () => {
        const form = document.querySelector('form#RESPONSE_MODAL_FORM_ID[name="vacancy_response"]');
        if (!form) return 0;

        const taskBodies = form.querySelectorAll('[data-qa="task-body"]');
        let count = 0;
        taskBodies.forEach((taskBody) => {
          const radios = taskBody.querySelectorAll('input[type="radio"]');
          const checkboxes = taskBody.querySelectorAll('input[type="checkbox"]');

          // Check if it's a radio question without any selection
          if (radios.length > 0) {
            const hasSelection = Array.from(radios).some(radio => radio.checked);
            if (!hasSelection) {
              count++;
            }
          }

          // Check if it's a checkbox question without any selection
          if (checkboxes.length > 0 && radios.length === 0) {
            const hasSelection = Array.from(checkboxes).some(checkbox => checkbox.checked);
            if (!hasSelection) {
              count++;
            }
          }
        });
        return count;
      },
    });

    if (modalUnansweredTestQuestionCount > 0) {
      console.log(`⚠️  Found ${modalUnansweredTestQuestionCount} UNANSWERED test question(s) in modal`);
      console.log('💡 Skipping this vacancy - cannot auto-submit when test questions remain unanswered');

      // Close the modal
      const closeButtonCount = await commander.count({ selector: '[data-qa="response-popup-close"]' });
      if (closeButtonCount > 0) {
        await commander.clickButton({ selector: '[data-qa="response-popup-close"]' });
        console.log('✅ Closed the application modal');
      }

      await commander.wait({ ms: 1000, reason: 'modal to close' });
      continue;
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
