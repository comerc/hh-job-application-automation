/**
 * Page Triggers - Declarative page handlers using the pageTrigger pattern
 *
 * This module implements the pageTrigger pattern from browser-commander for
 * cleaner, more declarative page handling with automatic lifecycle management.
 *
 * Benefits over manual onUrlChange handlers:
 * - Automatic action start/stop lifecycle management
 * - Built-in AbortController support for cancellation
 * - Automatic cleanup when navigating away
 * - Cleaner separation of page-specific handlers
 *
 * @see https://github.com/konard/hh-job-application-automation/issues/89
 */

import { makeUrlCondition } from './browser-commander/index.js';
import { saveQAPairs } from './vacancy-response.mjs';
import { log } from './logging.mjs';
import { createApplyButtonTracker } from './helpers/session-tracker.mjs';
import { URL_PATTERNS, extractVacancyIdFromResponseUrl, extractVacancyId } from './hh-selectors.mjs';

/**
 * Create a condition that matches vacancy response pages
 * @returns {Function} Condition function for pageTrigger
 */
export function createVacancyResponseCondition() {
  return makeUrlCondition(URL_PATTERNS.vacancyResponse);
}

/**
 * Create a condition that matches vacancy detail pages
 * @returns {Function} Condition function for pageTrigger
 */
export function createVacancyPageCondition() {
  return makeUrlCondition(URL_PATTERNS.vacancyPage);
}

/**
 * Create a condition that matches search vacancy pages
 * @returns {Function} Condition function for pageTrigger
 */
export function createSearchPageCondition() {
  return makeUrlCondition(URL_PATTERNS.searchVacancy);
}

/**
 * Register all page triggers for the HH.ru automation
 *
 * @param {Object} options - Configuration options
 * @param {Object} options.commander - Browser commander instance
 * @param {Function} options.addOrUpdateQA - Function to save Q&A pairs
 * @param {Function} options.handleVacancyResponsePage - Handler for vacancy response page
 * @param {Function} options.onVacancyPageFromResponse - Callback when navigating to vacancy from response
 * @param {Function} options.onApplicationSubmitted - Callback when application is submitted
 * @param {Function} options.onSearchPageVisited - Callback when search page URL changes (for tracking pagination)
 * @param {string} options.START_URL - URL to redirect to after submission
 * @returns {Function} Cleanup function to unregister all triggers
 */
export function registerPageTriggers({
  commander,
  addOrUpdateQA,
  handleVacancyResponsePage,
  onVacancyPageFromResponse,
  onApplicationSubmitted,
  onSearchPageVisited,
  START_URL,
}) {
  const unregisterFunctions = [];

  // Track state across page transitions
  let lastVacancyResponseId = null;
  // Track the last search page URL to return to after application confirmation
  // This allows returning to the exact page (e.g., page 2) instead of START_URL
  let lastSearchPageUrl = START_URL;

  /**
   * Vacancy Response Page Trigger
   *
   * Handles the vacancy_response page:
   * - Tracks the vacancy ID for detecting navigation to vacancy details
   * - Sets up periodic Q&A saving
   * - Calls the handleVacancyResponsePage handler
   */
  const unregisterVacancyResponse = commander.pageTrigger({
    name: 'vacancy-response-page',
    priority: 10, // High priority - specific page
    condition: createVacancyResponseCondition(),
    action: async (ctx) => {
      log.debug(() => `📋 [vacancy-response-page] Action started for: ${ctx.url}`);

      // Extract vacancy ID from URL for tracking navigation
      const vacancyId = extractVacancyIdFromResponseUrl(ctx.url);
      if (vacancyId) {
        lastVacancyResponseId = vacancyId;
        log.debug(() => `📋 [vacancy-response-page] Tracking vacancy ID: ${vacancyId}`);
      }

      // Setup periodic Q&A save (auto-cleaned up when action stops)
      const saveInterval = setInterval(async () => {
        try {
          ctx.checkStopped();
          const savedCount = await ctx.commander.safeEvaluate({
            fn: () => true, // Just to check if page is still valid
            defaultValue: false,
            operationName: 'periodic save check',
          });
          if (savedCount.value) {
            const count = await saveQAPairs({ commander: ctx.rawCommander, addOrUpdateQA });
            if (count > 0) {
              console.log(`Auto-saved ${count} Q&A pair(s)`);
            }
          }
        } catch {
          // Ignore errors during periodic save - action might be stopping
        }
      }, 5000);

      ctx.onCleanup(() => {
        clearInterval(saveInterval);
        log.debug(() => '📋 [vacancy-response-page] Cleaned up periodic save interval');
      });

      // Save Q&A pairs when leaving the page
      ctx.onCleanup(async () => {
        try {
          const savedCount = await saveQAPairs({ commander: ctx.rawCommander, addOrUpdateQA });
          if (savedCount > 0) {
            console.log(`Saved ${savedCount} Q&A pair(s) before navigation`);
          }
        } catch (error) {
          log.debug(() => `⚠️ Error saving Q&A on cleanup: ${error.message}`);
        }
      });

      // Call the main handler (this handles form filling, auto-submit, etc.)
      try {
        await handleVacancyResponsePage();
      } catch (error) {
        if (commander.isActionStoppedError(error)) {
          log.debug(() => '📋 [vacancy-response-page] Handler stopped due to navigation');
        } else {
          console.error('Error in vacancy response handler:', error.message);
        }
      }

      log.debug(() => '📋 [vacancy-response-page] Action completed');
    },
  });
  unregisterFunctions.push(unregisterVacancyResponse);

  /**
   * Vacancy Page Trigger
   *
   * Handles the vacancy detail page:
   * - Installs click listener for "Откликнуться" button
   * - Detects when user clicks the apply button
   * - Checks for submission completion and triggers redirect
   */
  const unregisterVacancyPage = commander.pageTrigger({
    name: 'vacancy-page',
    priority: 5, // Medium priority
    condition: createVacancyPageCondition(),
    action: async (ctx) => {
      log.debug(() => `📋 [vacancy-page] Action started for: ${ctx.url}`);

      // Extract vacancy ID from URL
      const vacancyId = extractVacancyId(ctx.url);
      if (!vacancyId) {
        log.debug(() => '📋 [vacancy-page] Could not extract vacancy ID');
        return;
      }

      // Check if we came from vacancy_response page for this vacancy
      const isFromVacancyResponse = lastVacancyResponseId === vacancyId;

      if (isFromVacancyResponse) {
        log.debug(() => `📋 [vacancy-page] Came from vacancy_response for ID: ${vacancyId}`);
        console.log(`Navigated to vacancy details page (ID: ${vacancyId}) from vacancy_response`);

        // Notify callback
        if (onVacancyPageFromResponse) {
          onVacancyPageFromResponse(vacancyId);
        }

        // Install click listener for "Откликнуться" button
        const buttonTracker = createApplyButtonTracker(ctx.rawCommander);
        try {
          await buttonTracker.install();
          console.log('Click listener installed for vacancy page');
        } catch (error) {
          log.debug(() => `⚠️ Error installing click listener: ${error.message}`);
        }

        // Setup periodic check for submission completion
        const checkInterval = setInterval(async () => {
          try {
            ctx.checkStopped();

            // Check if the apply button was clicked
            const checkResult = await buttonTracker.check({ clearAfterCheck: true });
            if (checkResult.navigationError) {
              return;
            }

            if (checkResult.hasFlag) {
              console.log('Detected "Откликнуться" button was clicked on vacancy page!');

              // Check if submission was completed
              const evalResult = await ctx.commander.safeEvaluate({
                fn: () => {
                  const bodyText = document.body.textContent.replace(/\s+/g, ' ');
                  return {
                    hasResponseText: bodyText.includes('Вы откликнулись'),
                    hasAlreadyResponded: bodyText.includes('Вы уже откликались'),
                    hasResponseSent: bodyText.includes('Отклик отправлен'),
                  };
                },
                defaultValue: {},
                operationName: 'submission check',
              });

              if (!evalResult.navigationError) {
                const info = evalResult.value;
                const hasSubmitted = info.hasResponseText || info.hasAlreadyResponded || info.hasResponseSent;

                if (hasSubmitted) {
                  // Use the last tracked search page URL (may include pagination)
                  const returnUrl = lastSearchPageUrl || START_URL;
                  console.log(`Application submission detected, redirecting to: ${returnUrl}`);

                  // Notify callback
                  if (onApplicationSubmitted) {
                    onApplicationSubmitted(vacancyId);
                  }

                  // Clear the tracking
                  lastVacancyResponseId = null;

                  // Redirect to last search page (not START_URL)
                  clearInterval(checkInterval);
                  await ctx.rawCommander.goto({ url: returnUrl });
                }
              }
            }
          } catch (error) {
            if (!commander.isActionStoppedError(error)) {
              log.debug(() => `⚠️ Error in check interval: ${error.message}`);
            }
          }
        }, 2000);

        ctx.onCleanup(() => {
          clearInterval(checkInterval);
          log.debug(() => '📋 [vacancy-page] Cleaned up check interval');
        });
      }

      // Keep action alive - it will be stopped when navigation occurs
      while (!ctx.isStopped()) {
        await ctx.wait(1000);
      }
    },
  });
  unregisterFunctions.push(unregisterVacancyPage);

  /**
   * Search Page Trigger
   *
   * Tracks the last search page URL for returning after application confirmation.
   * This allows the user to manually navigate to a different page number and
   * have the automation return to that exact page after submitting an application.
   */
  const unregisterSearchPage = commander.pageTrigger({
    name: 'search-page',
    priority: 3, // Lower priority - background tracking
    condition: createSearchPageCondition(),
    action: async (ctx) => {
      // Update the last search page URL whenever we visit a search page
      lastSearchPageUrl = ctx.url;
      log.debug(() => `📋 [search-page] Updated lastSearchPageUrl to: ${ctx.url}`);
      if (onSearchPageVisited) {
        onSearchPageVisited(ctx.url);
      }

      // Keep action alive - it will be stopped when navigation occurs
      while (!ctx.isStopped()) {
        // Periodically update the URL in case of in-page navigation (e.g., pagination)
        const currentUrl = ctx.commander.getUrl ? ctx.commander.getUrl() : ctx.rawCommander.getUrl();
        if (currentUrl && URL_PATTERNS.searchVacancy.test(currentUrl) && currentUrl !== lastSearchPageUrl) {
          lastSearchPageUrl = currentUrl;
          log.debug(() => `📋 [search-page] Updated lastSearchPageUrl (in-page navigation) to: ${currentUrl}`);
          if (onSearchPageVisited) {
            onSearchPageVisited(currentUrl);
          }
        }
        await ctx.wait(2000);
      }
    },
  });
  unregisterFunctions.push(unregisterSearchPage);

  // Clear the tracking when leaving vacancy response page to go elsewhere
  // (not to the vacancy page)
  commander.navigationManager?.on('onUrlChange', ({ newUrl }) => {
    // Track search page URL changes
    if (URL_PATTERNS.searchVacancy.test(newUrl)) {
      lastSearchPageUrl = newUrl;
      log.debug(() => `📋 Updated lastSearchPageUrl via onUrlChange to: ${newUrl}`);
      if (onSearchPageVisited) {
        onSearchPageVisited(newUrl);
      }
    }

    if (lastVacancyResponseId) {
      const newVacancyId = extractVacancyId(newUrl);
      if (newVacancyId !== lastVacancyResponseId) {
        // Going to a different page, clear tracking
        if (!URL_PATTERNS.vacancyResponse.test(newUrl)) {
          lastVacancyResponseId = null;
          log.debug(() => '📋 Cleared lastVacancyResponseId - navigated away');
        }
      }
    }
  });

  /**
   * Cleanup function - unregister all triggers
   */
  return () => {
    for (const unregister of unregisterFunctions) {
      unregister();
    }
    log.debug(() => '📋 All page triggers unregistered');
  };
}

/**
 * Setup page triggers with simplified interface
 *
 * @param {Object} options - Configuration options
 * @param {Object} options.commander - Browser commander instance
 * @param {Object} options.qaDB - Q&A database with addOrUpdateQA method
 * @param {Function} options.handleVacancyResponsePageWrapper - Wrapped handler for vacancy response page
 * @param {string} options.START_URL - URL to redirect to after submission
 * @param {Function} options.setIsOnVacancyPageFromResponse - State setter (optional, for legacy compatibility)
 * @param {Function} options.setLastSearchPageUrl - Setter for last search page URL (optional, for legacy compatibility)
 * @returns {Object} Object with cleanup function and getLastSearchPageUrl getter
 */
export function setupPageTriggers({
  commander,
  qaDB,
  handleVacancyResponsePageWrapper,
  START_URL,
  setIsOnVacancyPageFromResponse,
  setLastSearchPageUrl,
}) {
  const { addOrUpdateQA } = qaDB;

  // Store reference to last search page URL for external access
  let externalLastSearchPageUrl = START_URL;

  const cleanup = registerPageTriggers({
    commander,
    addOrUpdateQA,
    handleVacancyResponsePage: handleVacancyResponsePageWrapper,
    onVacancyPageFromResponse: (vacancyId) => {
      console.log(`Setting flag isOnVacancyPageFromResponse = true (vacancy ID: ${vacancyId})`);
      if (setIsOnVacancyPageFromResponse) {
        setIsOnVacancyPageFromResponse(true);
      }
    },
    onApplicationSubmitted: (vacancyId) => {
      console.log(`Application submitted for vacancy ${vacancyId}, clearing state`);
      if (setIsOnVacancyPageFromResponse) {
        setIsOnVacancyPageFromResponse(false);
      }
    },
    onSearchPageVisited: (url) => {
      externalLastSearchPageUrl = url;
      if (setLastSearchPageUrl) {
        setLastSearchPageUrl(url);
      }
    },
    START_URL,
  });

  // Return an object with cleanup function and getter
  return {
    cleanup,
    getLastSearchPageUrl: () => externalLastSearchPageUrl,
  };
}
