/**
 * Page-specific handlers for navigation events
 *
 * NOTE: This module contains legacy handlers that use onUrlChange pattern.
 * The primary navigation handling is now done by page-triggers.mjs using the
 * pageTrigger pattern from browser-commander. These handlers are kept for
 * backward compatibility with the redirect check in the main loop.
 *
 * @see page-triggers.mjs for the new pageTrigger-based handlers
 * @see https://github.com/konard/hh-job-application-automation/issues/89
 */

import { isNavigationError } from './browser-commander/index.js';
import { log } from './logging.mjs';
import { createApplyButtonTracker } from './helpers/session-tracker.mjs';
import { URL_PATTERNS } from './hh-selectors.mjs';

/**
 * @deprecated Use pageTriggers from page-triggers.mjs instead.
 *
 * Create navigation handler that saves Q&A pairs when leaving vacancy_response page.
 * This handler is no longer used - Q&A saving is now handled by the vacancy-response-page
 * pageTrigger with proper lifecycle management.
 *
 * @param {Object} options - Configuration options
 * @returns {Function} Navigation handler function
 */
export function createNavigationHandler(/* options */) {
  // This function is deprecated - navigation handling is now done by pageTriggers
  // Keeping the function signature for backward compatibility
  return async () => {
    // No-op - handled by pageTriggers
  };
}

/**
 * Setup click listener on vacancy page to detect "Откликнуться" button clicks
 * @param {Object} options
 * @param {Object} options.commander - Browser commander instance
 */
export async function setupVacancyPageClickListener({ commander }) {
  const buttonTracker = createApplyButtonTracker(commander);
  await buttonTracker.install();
}

/**
 * @deprecated Use pageTriggers from page-triggers.mjs instead.
 *
 * Create click listener handler for vacancy pages.
 * This handler is no longer used - click listener installation is now handled
 * by the vacancy-page pageTrigger with proper lifecycle management.
 *
 * @param {Object} options - Configuration options
 * @returns {Function} Click listener handler function
 */
export function createClickListenerHandler(/* options */) {
  // This function is deprecated - click listener handling is now done by pageTriggers
  // Keeping the function signature for backward compatibility
  return async () => {
    // No-op - handled by pageTriggers
  };
}

/**
 * Check and redirect if "Откликнуться" button was clicked on vacancy page
 * @param {Object} options
 * @param {Object} options.commander - Browser commander instance
 * @param {Function} options.getIsOnVacancyPageFromResponse - Get tracking flag
 * @param {Function} options.setIsOnVacancyPageFromResponse - Set tracking flag
 * @param {Function} options.getIsNavigating - Get navigation lock
 * @param {Function} options.setIsNavigating - Set navigation lock
 * @param {Function} options.setClickListenerInstalled - Set click listener flag
 * @param {Function} options.setLastVacancyPageUrl - Set last vacancy page URL
 * @param {string} options.START_URL - URL to return to (fallback)
 * @param {Function} options.getLastSearchPageUrl - Get last tracked search page URL (for pagination)
 * @returns {Promise<boolean>} True if redirect was triggered
 */
export async function checkAndRedirectIfNeeded({
  commander,
  getIsOnVacancyPageFromResponse,
  setIsOnVacancyPageFromResponse,
  getIsNavigating,
  setIsNavigating,
  setClickListenerInstalled,
  setLastVacancyPageUrl,
  START_URL,
  getLastSearchPageUrl,
}) {
  try {
    const currentUrl = commander.getUrl();

    log.debug(() => 'checkAndRedirectIfNeeded called');
    log.debug(() => `Current URL: ${currentUrl}`);
    log.debug(() => `isOnVacancyPageFromResponse: ${getIsOnVacancyPageFromResponse()}`);

    // Only check on vacancy pages when we came from vacancy_response
    if (!getIsOnVacancyPageFromResponse() || !URL_PATTERNS.vacancyPage.test(currentUrl)) {
      return false;
    }

    const buttonTracker = createApplyButtonTracker(commander);
    const checkResult = await buttonTracker.check({ clearAfterCheck: false });

    // If navigation occurred, just return false
    if (checkResult.navigationError) {
      return false;
    }

    const hasSessionFlag = checkResult.hasFlag;

    log.debug(() => `shouldRedirect from sessionStorage: ${hasSessionFlag}`);

    // Also check for response text on the page (handles cases where session flag wasn't set)
    // This is the same logic as in waitForUrlCondition in orchestrator.mjs
    const evalResult = await commander.safeEvaluate({
      fn: () => {
        // Normalize whitespace (including nbsp) for matching
        const bodyText = document.body.textContent.replace(/\s+/g, ' ');

        // Check for various response texts (handle nbsp and multiple spaces)
        const hasResponseText = bodyText.includes('Вы откликнулись');
        const hasAlreadyResponded = bodyText.includes('Вы уже откликались');
        const hasResponseSent = bodyText.includes('Отклик отправлен');

        return {
          hasResponseText,
          hasAlreadyResponded,
          hasResponseSent,
        };
      },
      defaultValue: null,
      operationName: 'check response text on vacancy page',
    });

    // If navigation occurred during evaluation, just return false
    if (evalResult.navigationError || !evalResult.value) {
      return false;
    }

    const pageInfo = evalResult.value;
    const hasResponseTextOnPage = pageInfo.hasResponseText || pageInfo.hasAlreadyResponded || pageInfo.hasResponseSent;

    log.debug(() => `"Вы откликнулись" on page: ${pageInfo.hasResponseText}`);
    log.debug(() => `"Вы уже откликались" on page: ${pageInfo.hasAlreadyResponded}`);
    log.debug(() => `"Отклик отправлен" on page: ${pageInfo.hasResponseSent}`);

    // Redirect if sessionStorage flag is set OR if response text is on the page
    const shouldRedirect = hasSessionFlag || hasResponseTextOnPage;

    if (shouldRedirect) {
      if (hasSessionFlag) {
        console.log('Detected "Откликнуться" button was clicked on vacancy page!');
      } else {
        console.log('Detected application submission via response text on vacancy page!');
      }

      if (!getIsNavigating()) {
        // Use the last tracked search page URL (may include pagination) or fall back to START_URL
        const returnUrl = (getLastSearchPageUrl && getLastSearchPageUrl()) || START_URL;
        console.log(`Response submitted from vacancy page, redirecting to: ${returnUrl}`);

        // Clear the session flag if it was set
        if (hasSessionFlag) {
          await buttonTracker.clear();
        }

        // Set navigation lock
        setIsNavigating(true);

        try {
          await commander.goto({ url: returnUrl });

          // Reset the tracking flags
          setIsOnVacancyPageFromResponse(false);
          setClickListenerInstalled(false);
          setLastVacancyPageUrl('');
          return true;
        } finally {
          setIsNavigating(false);
        }
      } else {
        console.log('Already navigating, skipping redirect');
      }
    }

    return false;
  } catch (error) {
    // Handle navigation errors gracefully
    if (isNavigationError(error)) {
      console.log('Navigation detected during redirect check, continuing...');
    } else {
      console.log('Error checking redirect condition:', error.message);
    }
    return false;
  }
}
