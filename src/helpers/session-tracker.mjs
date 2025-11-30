/**
 * Session Storage Tracker Helper
 *
 * Factory for managing session storage flags to track user interactions
 * across page navigations. Used for detecting button clicks and triggering
 * redirects.
 *
 * @module session-tracker
 */

import { log } from '../logging.mjs';

/**
 * Session storage key for redirect flag
 */
export const SESSION_KEYS = {
  shouldRedirectAfterResponse: 'shouldRedirectAfterResponse',
};

/**
 * Create a session storage tracker for button click detection
 *
 * @param {Object} options - Configuration options
 * @param {string} options.storageKey - The sessionStorage key to use
 * @param {string} options.buttonText - The button text to listen for
 * @param {Function} options.evaluate - Browser evaluation function (commander.evaluate)
 * @param {Function} options.safeEvaluate - Safe browser evaluation function (commander.safeEvaluate)
 * @returns {Object} Tracker object with install and check methods
 */
export function createSessionStorageTracker(options) {
  const { storageKey, buttonText, evaluate, safeEvaluate } = options;

  return {
    /**
     * Install a click listener that sets the sessionStorage flag when
     * the specified button is clicked
     */
    async install() {
      log.debug(() => `Installing click listener for "${buttonText}"`);

      try {
        await evaluate({
          fn: (key, text) => {
            // Add click listener to document (capture phase to catch all clicks)
            document.addEventListener('click', (event) => {
              // Check if clicked element or any parent contains the button text
              let element = event.target;
              while (element && element !== document.body) {
                const elementText = element.textContent?.trim() || '';
                // Check for button text (handles both exact match and contains)
                if (elementText === text || (element.tagName === 'A' || element.tagName === 'BUTTON') && elementText.includes(text)) {
                  console.log(`[Click Listener] Detected click on ${text} button!`);
                  window.sessionStorage.setItem(key, 'true');
                  break;
                }
                element = element.parentElement;
              }
            }, true);
          },
          args: [storageKey, buttonText],
        });
        console.log(`✅ Click listener for "${buttonText}" setup completed`);
        return true;
      } catch (error) {
        console.log(`⚠️  Error setting up click listener for "${buttonText}":`, error.message);
        return false;
      }
    },

    /**
     * Check if the sessionStorage flag is set and optionally clear it
     *
     * @param {Object} options - Check options
     * @param {boolean} options.clearAfterCheck - Whether to clear the flag after checking (default: true)
     * @returns {Promise<{hasFlag: boolean, navigationError: boolean}>}
     */
    async check({ clearAfterCheck = true } = {}) {
      const evalResult = await safeEvaluate({
        fn: (key, shouldClear) => {
          const flag = window.sessionStorage.getItem(key);
          if (flag === 'true' && shouldClear) {
            window.sessionStorage.removeItem(key);
          }
          return flag === 'true';
        },
        args: [storageKey, clearAfterCheck],
        defaultValue: false,
        operationName: `check sessionStorage flag "${storageKey}"`,
      });

      if (evalResult.value) {
        log.debug(() => `Flag "${storageKey}" detected${clearAfterCheck ? ' and cleared' : ''}`);
      }

      return {
        hasFlag: evalResult.value,
        navigationError: evalResult.navigationError || false,
      };
    },

    /**
     * Clear the sessionStorage flag without checking it
     */
    async clear() {
      try {
        await evaluate({
          fn: (key) => {
            window.sessionStorage.removeItem(key);
          },
          args: [storageKey],
        });
        log.debug(() => `Flag "${storageKey}" cleared`);
        return true;
      } catch (error) {
        log.debug(() => `Error clearing flag "${storageKey}": ${error.message}`);
        return false;
      }
    },
  };
}

/**
 * Create a tracker specifically for the "Откликнуться" (Apply) button
 *
 * @param {Object} commander - Browser commander instance
 * @returns {Object} Tracker object with install, check, and clear methods
 */
export function createApplyButtonTracker(commander) {
  return createSessionStorageTracker({
    storageKey: SESSION_KEYS.shouldRedirectAfterResponse,
    buttonText: 'Откликнуться',
    evaluate: commander.evaluate.bind(commander),
    safeEvaluate: commander.safeEvaluate.bind(commander),
  });
}
