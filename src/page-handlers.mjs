/**
 * Page-specific handlers for navigation events
 * Handles Q&A saving, redirect detection, and click listeners
 */

import { isNavigationError } from './browser-commander/index.js';
import { saveQAPairs } from './vacancy-response.mjs';
import { log } from './logging.mjs';
import { createApplyButtonTracker } from './helpers/session-tracker.mjs';

/**
 * Create navigation handler that saves Q&A pairs when leaving vacancy_response page
 * @param {Object} options
 * @param {Object} options.commander - Browser commander instance
 * @param {Function} options.addOrUpdateQA - Function to save Q&A pairs
 * @param {RegExp} options.vacancyResponsePattern - Pattern to match vacancy_response URLs
 * @param {RegExp} options.vacancyPagePattern - Pattern to match vacancy page URLs
 * @param {Function} options.getLastUrl - Function to get the last URL
 * @param {Function} options.setLastUrl - Function to set the last URL
 * @param {Function} options.getIsOnVacancyPageFromResponse - Get tracking flag
 * @param {Function} options.setIsOnVacancyPageFromResponse - Set tracking flag
 * @param {Function} options.getIsNavigating - Get navigation lock
 * @param {Function} options.setIsNavigating - Set navigation lock
 * @param {string} options.START_URL - URL to return to
 * @returns {Function} Navigation handler function
 */
export function createNavigationHandler({
  commander,
  addOrUpdateQA,
  vacancyResponsePattern,
  vacancyPagePattern,
  getLastUrl,
  setLastUrl,
  getIsOnVacancyPageFromResponse,
  setIsOnVacancyPageFromResponse,
  getIsNavigating,
  setIsNavigating,
  START_URL,
}) {
  return async (currentUrl) => {
    try {
      // Prevent recursive calls while navigating
      if (getIsNavigating()) {
        log.debug(() => `Skipping navigation handler (already navigating): ${currentUrl}`);
        return;
      }

      const lastUrl = getLastUrl();

      // Log all URL changes for debugging
      if (currentUrl !== lastUrl) {
        console.log(`[URL CHANGE] ${lastUrl} -> ${currentUrl}`);
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
            console.log(`Navigated to vacancy details page (ID: ${pageVacancyId}) from vacancy_response`);
            console.log('Setting flag isOnVacancyPageFromResponse = true');
            setIsOnVacancyPageFromResponse(true);
          }
        }
      }

      // Save Q&A when leaving vacancy_response page
      if (wasOnVacancyResponse && !isOnVacancyResponse) {
        console.log('Navigation detected from vacancy_response page, saving Q&A pairs...');
        const savedCount = await saveQAPairs({ commander, addOrUpdateQA });
        if (savedCount > 0) {
          console.log(`Saved ${savedCount} Q&A pair(s) before navigation`);
        }
      }

      // Check for redirect after clicking "Откликнуться" button on vacancy page
      if (getIsOnVacancyPageFromResponse() && vacancyPageMatch && !getIsNavigating()) {
        const wasOnVacancyPage = lastUrl && vacancyPagePattern.test(lastUrl);

        // If we're navigating between different versions of the same vacancy page
        if (wasOnVacancyPage) {
          // Check if application was submitted (page shows "Вы откликнулись")
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
                hasSubmitted: hasResponseText || hasAlreadyResponded || hasResponseSent,
              };
            },
            defaultValue: { hasSubmitted: false },
            operationName: 'submission check in navigation handler',
          });

          // Skip if navigation occurred during the check
          if (evalResult.navigationError) {
            setLastUrl(currentUrl);
            return;
          }

          const submissionInfo = evalResult.value;

          log.debug(() => `Navigation handler checking submission on: ${currentUrl}`);
          log.debug(() => `"Вы откликнулись": ${submissionInfo.hasResponseText}`);
          log.debug(() => `"Вы уже откликались": ${submissionInfo.hasAlreadyResponded}`);
          log.debug(() => `"Отклик отправлен": ${submissionInfo.hasResponseSent}`);
          log.debug(() => `Will redirect: ${submissionInfo.hasSubmitted}`);

          if (submissionInfo.hasSubmitted && !getIsNavigating()) {
            console.log('Detected application submission completed, triggering redirect...');
            console.log(`Redirecting to: ${START_URL}`);

            // Set navigation lock to prevent recursive calls
            setIsNavigating(true);

            try {
              await commander.goto({
                url: START_URL,
                waitForStableUrlBefore: false,
                waitForStableUrlAfter: true,
              });

              // Reset tracking flags
              setIsOnVacancyPageFromResponse(false);
              console.log('Returned to search page! Continuing automation...');
            } finally {
              setIsNavigating(false);
            }
          }
        }
      }

      // Reset flag when leaving vacancy page
      if (!vacancyPageMatch) {
        if (getIsOnVacancyPageFromResponse()) {
          console.log('Leaving vacancy page, resetting isOnVacancyPageFromResponse flag');
        }
        setIsOnVacancyPageFromResponse(false);
      }

      setLastUrl(currentUrl);
    } catch (error) {
      // Handle navigation errors gracefully
      if (isNavigationError(error)) {
        console.log('Navigation detected in navigation handler, continuing...');
      } else {
        console.log('Error in navigation handler:', error.message);
      }
    }
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
 * Create click listener handler for vacancy pages
 * @param {Object} options
 * @param {Object} options.commander - Browser commander instance
 * @param {RegExp} options.vacancyPagePattern - Pattern to match vacancy page URLs
 * @param {Function} options.getIsOnVacancyPageFromResponse - Get tracking flag
 * @param {Function} options.getClickListenerInstalled - Get click listener flag
 * @param {Function} options.setClickListenerInstalled - Set click listener flag
 * @param {Function} options.getLastVacancyPageUrl - Get last vacancy page URL
 * @param {Function} options.setLastVacancyPageUrl - Set last vacancy page URL
 * @returns {Function} Click listener handler function
 */
export function createClickListenerHandler({
  commander,
  vacancyPagePattern,
  getIsOnVacancyPageFromResponse,
  getClickListenerInstalled,
  setClickListenerInstalled,
  getLastVacancyPageUrl,
  setLastVacancyPageUrl,
}) {
  return async (currentUrl) => {
    // Check if this is a new vacancy page (not just parameter change)
    const vacancyMatch = currentUrl.match(vacancyPagePattern);
    const currentVacancyId = vacancyMatch ? vacancyMatch[1] : null;
    const lastVacancyId = getLastVacancyPageUrl().match(vacancyPagePattern)?.[1];

    if (getIsOnVacancyPageFromResponse() && vacancyMatch) {
      // Only install listener once per vacancy page
      if (!getClickListenerInstalled() || currentVacancyId !== lastVacancyId) {
        console.log(`Detected NEW vacancy page (ID: ${currentVacancyId}) with isOnVacancyPageFromResponse=true, setting up click listener...`);
        await setupVacancyPageClickListener({ commander });
        setClickListenerInstalled(true);
        setLastVacancyPageUrl(currentUrl);
      }
    } else {
      // Reset when leaving vacancy page
      setClickListenerInstalled(false);
      setLastVacancyPageUrl('');
    }
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
