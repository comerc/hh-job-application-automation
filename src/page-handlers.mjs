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
 * @param {string} options.START_URL - URL to return to
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
}) {
  try {
    const currentUrl = commander.getUrl();

    log.debug(() => 'checkAndRedirectIfNeeded called');
    log.debug(() => `Current URL: ${currentUrl}`);
    log.debug(() => `isOnVacancyPageFromResponse: ${getIsOnVacancyPageFromResponse()}`);

    const buttonTracker = createApplyButtonTracker(commander);
    const checkResult = await buttonTracker.check({ clearAfterCheck: true });

    // If navigation occurred, just return false
    if (checkResult.navigationError) {
      return false;
    }

    const shouldRedirect = checkResult.hasFlag;

    log.debug(() => `shouldRedirect from sessionStorage: ${shouldRedirect}`);

    if (shouldRedirect) {
      console.log('Detected "Откликнуться" button was clicked on vacancy page!');
      if (getIsOnVacancyPageFromResponse() && !getIsNavigating()) {
        console.log('Response submitted from vacancy page, redirecting back to search page...');

        // Set navigation lock
        setIsNavigating(true);

        try {
          await commander.goto({ url: START_URL });

          // Reset the tracking flags
          setIsOnVacancyPageFromResponse(false);
          setClickListenerInstalled(false);
          setLastVacancyPageUrl('');
          return true;
        } finally {
          setIsNavigating(false);
        }
      } else {
        if (!getIsOnVacancyPageFromResponse()) {
          console.log('shouldRedirect=true but isOnVacancyPageFromResponse=false - this should not happen');
        } else {
          console.log('Already navigating, skipping redirect');
        }
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
