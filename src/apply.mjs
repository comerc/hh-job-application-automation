#!/usr/bin/env node

/**
 * Universal job application automation for hh.ru
 * Works with both Playwright and Puppeteer through browser-commander
 */

import path from 'path';
import { createQADatabase } from './qa-database.mjs';
import { launchBrowser, makeBrowserCommander, isNavigationError } from './browser-commander/index.js';
import {
  handleVacancyResponsePage,
  saveQAPairs,
} from './vacancy-response.mjs';
import {
  handleLimitError,
  findAndProcessVacancyButton,
  waitForButtonsAfterNavigation,
} from './vacancies.mjs';
import { log, enableDebugLevel } from './logging.mjs';
import { createConfig, getUserDataDir } from './config.mjs';
import { URL_PATTERNS } from './hh-selectors.mjs';

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

  // Cleanup browser-commander resources (network tracker, navigation manager)
  if (commander) {
    try {
      commander.destroy();
      console.log('✅ Browser commander cleaned up');
    } catch (error) {
      console.error('⚠️  Error cleaning up commander:', error.message);
    }
  }

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
  // Parse command-line arguments using lino-arguments config module
  const argv = createConfig();

  // Set user data dir based on engine if not explicitly set
  if (!argv.userDataDir) {
    argv.userDataDir = getUserDataDir(argv.engine);
  }

  // Enable debug logging if verbose mode is on
  if (argv.verbose) {
    enableDebugLevel();
  }

  // Use message from config (already has default from config module)
  const MESSAGE = argv.message;
  const START_URL = argv.url;

  // Launch browser with default configuration from browser-commander
  const { browser: launchedBrowser, page } = await launchBrowser({
    engine: argv.engine,
    userDataDir: argv.userDataDir,
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
  // Use centralized URL patterns from hh-selectors.mjs
  const targetPagePattern = URL_PATTERNS.searchVacancy;
  const vacancyResponsePattern = URL_PATTERNS.vacancyResponse;
  const vacancyPagePattern = URL_PATTERNS.vacancyPage;
  const BUTTON_CLICK_INTERVAL = argv.jobApplicationInterval * 1000;
  let isOnVacancyPageFromResponse = false;
  let clickListenerInstalled = false;
  let lastVacancyPageUrl = '';
  let isNavigating = false; // Prevent recursive navigation handler calls

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
          const evalResult = await commander.safeEvaluate({
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
            defaultValue: null,
            operationName: 'redirect check',
          });

          // Skip if navigation occurred
          if (evalResult.navigationError) {
            await commander.wait({ ms: pollingInterval, reason: 'waiting after navigation detected' });
            continue;
          }

          const redirectInfo = evalResult.value;
          if (redirectInfo && isOnVacancyPageFromResponse) {
            log.debug(() => `🔍 Checking redirect on vacancy page: ${currentUrl}`);
            log.debug(() => `🔍 sessionStorage flag: ${redirectInfo.hasFlag}`);
            log.debug(() => `🔍 "Вы откликнулись": ${redirectInfo.hasResponseText}`);
            log.debug(() => `🔍 "Вы уже откликались": ${redirectInfo.hasAlreadyResponded}`);
            log.debug(() => `🔍 "Отклик отправлен": ${redirectInfo.hasResponseSent}`);
            log.debug(() => `🔍 Has "Откликнуться" button: ${redirectInfo.hasRespondButton}`);
          }

          if (redirectInfo && redirectInfo.needsRedirect) {
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
        const urlCheckResult = await commander.safeEvaluate({
          fn: (url) => window.location.href.startsWith(url),
          args: [targetUrl],
          defaultValue: false,
          operationName: 'URL check',
          silent: true,
        });

        if (urlCheckResult.navigationError) {
          // Navigation happened, continue waiting
          await commander.wait({ ms: pollingInterval, reason: 'waiting after navigation detected' });
          continue;
        }

        if (urlCheckResult.value) {
          return true;
        }
      } catch (error) {
        if (pageClosedByUser) {
          return;
        }
        // Handle navigation errors gracefully
        if (isNavigationError(error)) {
          console.log('⚠️  Navigation detected during URL check, continuing to wait...');
        } else {
          console.log(`⚠️  Temporary error while checking URL: ${error.message.substring(0, 100)}... (retrying)`);
        }
      }

      await commander.wait({ ms: pollingInterval, reason: 'polling interval before next URL check' });
    }
  }

  // Handle manual login if requested
  if (argv.manualLogin) {
    const backurl = encodeURIComponent(START_URL);
    const loginUrl = `https://hh.ru/account/login?role=applicant&backurl=${backurl}&hhtmFrom=vacancy_search_list`;

    console.log('🔐 Opening login page for manual authentication...');
    console.log('📍 Login URL:', loginUrl);

    // Initial navigation - no need to wait for stabilization before
    await commander.goto({ url: loginUrl, waitForStableUrlBefore: false });

    console.log('💡 The browser will automatically continue once you are redirected to:', START_URL);

    await waitForUrlCondition(START_URL, 'Waiting for you to complete login');

    if (!pageClosedByUser) {
      console.log('✅ Login successful! Proceeding with automation...');
    }
  } else {
    // Initial navigation - no need to wait for stabilization before
    await commander.goto({ url: START_URL, waitForStableUrlBefore: false });
  }

  // Wrapper function to pass all dependencies to handleVacancyResponsePage
  async function handleVacancyResponsePageWrapper() {
    return handleVacancyResponsePage({
      commander,
      MESSAGE,
      vacancyResponsePattern,
      readQADatabase,
      addOrUpdateQA,
      autoSubmitEnabled: argv.autoSubmitVacancyResponseForm,
      verbose: argv.verbose,
    });
  }

  /**
   * Check if we should redirect after vacancy response
   * This is checked after clicking "Откликнуться" on vacancy page from vacancy_response flow
   */
  async function checkAndRedirectIfNeeded() {
    try {
      const currentUrl = commander.getUrl();

      log.debug(() => '🔍 checkAndRedirectIfNeeded called');
      log.debug(() => `🔍 Current URL: ${currentUrl}`);
      log.debug(() => `🔍 isOnVacancyPageFromResponse: ${isOnVacancyPageFromResponse}`);

      const evalResult = await commander.safeEvaluate({
        fn: () => {
          const flag = window.sessionStorage.getItem('shouldRedirectAfterResponse');
          if (flag === 'true') {
            window.sessionStorage.removeItem('shouldRedirectAfterResponse');
            return true;
          }
          return false;
        },
        defaultValue: false,
        operationName: 'checkAndRedirectIfNeeded',
      });

      // If navigation occurred, just return false
      if (evalResult.navigationError) {
        return false;
      }

      const shouldRedirect = evalResult.value;

      log.debug(() => `🔍 shouldRedirect from sessionStorage: ${shouldRedirect}`);

      if (shouldRedirect) {
        console.log('✅ Detected "Откликнуться" button was clicked on vacancy page!');
        if (isOnVacancyPageFromResponse && !isNavigating) {
          console.log('✅ Response submitted from vacancy page, redirecting back to search page...');

          // Set navigation lock
          isNavigating = true;

          try {
            // goto() will automatically stabilize before and after navigation
            await commander.goto({ url: START_URL });

            // Reset the tracking flag
            isOnVacancyPageFromResponse = false;
            clickListenerInstalled = false;
            lastVacancyPageUrl = '';
            return true;
          } finally {
            isNavigating = false;
          }
        } else {
          if (!isOnVacancyPageFromResponse) {
            console.log('⚠️  shouldRedirect=true but isOnVacancyPageFromResponse=false - this should not happen');
          } else {
            console.log('⚠️  Already navigating, skipping redirect');
          }
        }
      }

      return false;
    } catch (error) {
      // Handle navigation errors gracefully
      if (isNavigationError(error)) {
        console.log('⚠️  Navigation detected during redirect check, continuing...');
      } else {
        console.log('⚠️  Error checking redirect condition:', error.message);
      }
      return false;
    }
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

  // Check if already on vacancy_response page
  const currentUrl = commander.getUrl();
  if (vacancyResponsePattern.test(currentUrl)) {
    await handleVacancyResponsePageWrapper();
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
        const savedCount = await saveQAPairs({ commander, addOrUpdateQA });
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
      // Prevent recursive calls while navigating
      if (isNavigating) {
        log.debug(() => `🔍 Skipping navigation handler (already navigating): ${currentUrl}`);
        return;
      }

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
        const savedCount = await saveQAPairs({ commander, addOrUpdateQA });
        if (savedCount > 0) {
          console.log(`💾 Saved ${savedCount} Q&A pair(s) before navigation`);
        }
      }

      // Check for redirect after clicking "Откликнуться" button on vacancy page
      if (isOnVacancyPageFromResponse && vacancyPageMatch && !isNavigating) {
        const wasOnVacancyPage = lastUrl && vacancyPagePattern.test(lastUrl);

        // If we're navigating between different versions of the same vacancy page
        if (wasOnVacancyPage) {
          // Check if application was submitted (page shows "Вы откликнулись")
          // This happens after clicking "Откликнуться" on vacancy_response page and submitting
          const evalResult = await commander.safeEvaluate({
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
            defaultValue: { hasSubmitted: false },
            operationName: 'submission check in navigation handler',
          });

          // Skip if navigation occurred during the check
          if (evalResult.navigationError) {
            lastUrl = currentUrl;
            return;
          }

          const submissionInfo = evalResult.value;

          log.debug(() => `🔍 Navigation handler checking submission on: ${currentUrl}`);
          log.debug(() => `🔍 "Вы откликнулись": ${submissionInfo.hasResponseText}`);
          log.debug(() => `🔍 "Вы уже откликались": ${submissionInfo.hasAlreadyResponded}`);
          log.debug(() => `🔍 "Отклик отправлен": ${submissionInfo.hasResponseSent}`);
          log.debug(() => `🔍 Will redirect: ${submissionInfo.hasSubmitted}`);

          if (submissionInfo.hasSubmitted && !isNavigating) {
            console.log('✅ Detected application submission completed (user clicked on vacancy_response page), triggering redirect...');
            console.log(`🔄 Redirecting to: ${START_URL}`);

            // Set navigation lock to prevent recursive calls
            isNavigating = true;

            try {
              // Don't wait for stabilization BEFORE navigation here - we're already in a navigation handler
              // Just navigate and wait for stabilization AFTER
              await commander.goto({
                url: START_URL,
                waitForStableUrlBefore: false, // Skip "before" stabilization to avoid infinite loop
                waitForStableUrlAfter: true,   // Still wait after navigation
              });

              // Reset tracking flags
              isOnVacancyPageFromResponse = false;
              clickListenerInstalled = false;
              lastVacancyPageUrl = '';
              console.log('✅ Returned to search page! Continuing automation...');
            } finally {
              // Always release the lock
              isNavigating = false;
            }
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
      // Handle navigation errors gracefully - don't crash the handler
      if (isNavigationError(error)) {
        console.log('⚠️  Navigation detected in navigation handler, continuing...');
      } else {
        console.log('⚠️  Error in navigation handler:', error.message);
      }
    }
  };

  // Use browser-commander's navigation event system (works for both Playwright and Puppeteer)
  // This is cleaner and automatically handles main frame filtering
  commander.onUrlChange(async ({ newUrl }) => {
    await handleNavigation(newUrl);
  });

  // Setup click listener whenever we navigate to a vacancy page from vacancy_response
  // Using the unified navigation event system from browser-commander
  commander.onUrlChange(async ({ newUrl }) => {
    const currentUrl = newUrl;

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

  // Main loop to process all "Откликнуться" buttons
  // Each iteration represents a "page context" - we wait for page to be ready before any automation
  while (true) {
    // ============================================================
    // STEP 1: Ensure page is fully loaded before ANY automation
    // ============================================================

    // Check if navigation is in progress or abort signal is set
    const shouldWaitForPage = (
      (commander.navigationManager && commander.navigationManager.isNavigating()) ||
      (commander.shouldAbort && commander.shouldAbort())
    );

    if (shouldWaitForPage) {
      console.log('⏳ Page is loading, waiting for it to be fully ready...');
      await commander.waitForPageReady({ timeout: 120000, reason: 'ensuring page is ready before automation' });

      // After page ready, check URL to log where we are
      const currentUrl = commander.getUrl();
      console.log(`✅ Page ready: ${currentUrl.substring(0, 80)}...`);
    }

    // ============================================================
    // STEP 2: Check for page-closed condition
    // ============================================================
    if (pageClosedByUser) {
      return;
    }

    // ============================================================
    // STEP 3: Handle redirect logic (only if page is ready)
    // ============================================================
    const didRedirect = await checkAndRedirectIfNeeded();
    if (didRedirect) {
      // Redirect initiated navigation - wait for new page
      await commander.waitForPageReady({ timeout: 120000, reason: 'after redirect' });
      continue;
    }

    // ============================================================
    // STEP 4: Verify we're still on a stable page (no navigation started)
    // ============================================================
    if (commander.shouldAbort && commander.shouldAbort()) {
      // Navigation started while we were checking redirect - go back to step 1
      continue;
    }

    // ============================================================
    // STEP 5: Wait for modals to close (short wait)
    // ============================================================
    try {
      await commander.evaluate({
        fn: () => {
          const modal = document.querySelector('[data-qa="modal-overlay"]');
          if (modal) {
            console.log('[Main Loop] Waiting for modal to close...');
          }
        },
      });

      // Short wait for modal - use non-abortable wait here since it's brief
      await new Promise(r => setTimeout(r, 500));
    } catch {
      // Ignore errors - might happen during navigation
    }

    // Check again after modal wait
    if (commander.shouldAbort && commander.shouldAbort()) {
      continue; // Go back to step 1
    }

    // ============================================================
    // STEP 6: Process vacancy buttons (main automation logic)
    // ============================================================
    const result = await findAndProcessVacancyButton({
      commander,
      MESSAGE,
      targetPagePattern,
      vacancyResponsePattern,
      handleVacancyResponsePage: handleVacancyResponsePageWrapper,
      waitForUrlCondition,
      START_URL,
      pageClosedByUser: () => pageClosedByUser,
    });

    // ============================================================
    // STEP 7: Handle result - navigation detection has highest priority
    // ============================================================

    // Navigation detected - go back to step 1 (wait for page ready)
    if (result.status === 'navigation_detected') {
      console.log('🔄 Navigation detected during processing, restarting with new page context...');
      continue;
    }

    // Not on target page - wait and retry
    if (result.status === 'not_on_target_page') {
      console.log('📍 Not on target page, waiting for page to be ready...');
      await commander.waitForPageReady({ timeout: 120000, reason: 'not on target page' });
      continue;
    }

    // No buttons found - wait for user navigation or dynamic content
    if (result.status === 'no_buttons_found') {
      const waitResult = await waitForButtonsAfterNavigation({
        commander,
        pageClosedByUser: () => pageClosedByUser,
      });

      if (waitResult.status === 'page_closed') {
        return;
      }

      // Navigation was detected - the wait loop already exited quickly
      // Now wait for the new page to be fully ready
      if (waitResult.status === 'navigation_detected') {
        console.log('🔄 Navigation detected, waiting for new page to be fully loaded...');
        await commander.waitForPageReady({ timeout: 120000, reason: 'after navigation in button wait' });
      }

      continue;
    }

    // Handle limit errors
    if (result.status === 'limit_error' || result.status === 'limit_error_after_submit') {
      await handleLimitError({ commander, START_URL });
      continue;
    }

    // Success - wait before processing next button
    if (result.status === 'success') {
      console.log(`⏳ Waiting ${BUTTON_CLICK_INTERVAL / 1000} seconds before processing next button...`);

      // Use abortable wait so we can respond to navigation during the interval
      const intervalWait = await commander.wait({
        ms: BUTTON_CLICK_INTERVAL,
        reason: 'interval before next application',
      });

      // If wait was aborted due to navigation, that's fine - next iteration will handle it
      if (intervalWait && intervalWait.aborted) {
        console.log('🔄 Interval wait was interrupted by navigation');
      }
    }

    // For other statuses, continue the loop
  }
})().catch(async (error) => {
  // Check if this is a navigation error - if so, don't crash
  if (isNavigationError(error)) {
    console.log('⚠️  Navigation-related error occurred, attempting to recover...');
    console.log('💡 The automation may have been interrupted by page navigation.');
    console.log('💡 Please restart the script if needed.');
    // Don't exit with error for navigation issues
    process.exit(0);
  }
  console.error('❌ Error occurred:', error.message);
  process.exit(1);
});
