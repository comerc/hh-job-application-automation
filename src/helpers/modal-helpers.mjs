/**
 * Modal handling helpers
 *
 * Application-specific helpers for handling modals on hh.ru
 * Note: This is kept at application level (not browser-commander)
 * because the selectors and behavior are specific to hh.ru
 *
 * @module helpers/modal-helpers
 */

import { SELECTORS } from '../hh-selectors.mjs';

/**
 * Closes a modal if present on the page
 *
 * @param {Object} options - Options for closing modal
 * @param {Object} options.commander - Browser commander instance
 * @param {string} [options.closeButtonSelector] - Selector for close button (defaults to response popup close)
 * @param {number} [options.waitAfterClose=1000] - Milliseconds to wait after closing
 * @param {boolean} [options.verbose=false] - Enable verbose logging
 * @returns {Promise<boolean>} - True if modal was closed, false otherwise
 *
 * @example
 * const closed = await closeModalIfPresent({
 *   commander,
 *   closeButtonSelector: SELECTORS.responsePopupClose,
 * });
 * if (closed) {
 *   console.log('Modal was closed');
 * }
 */
export async function closeModalIfPresent(options = {}) {
  const {
    commander,
    closeButtonSelector = SELECTORS.responsePopupClose,
    waitAfterClose = 1000,
    verbose = false,
  } = options;

  try {
    const count = await commander.count({ selector: closeButtonSelector });

    if (verbose) {
      console.log(`🔍 [VERBOSE] closeModalIfPresent: found ${count} close button(s) with selector: ${closeButtonSelector}`);
    }

    if (count > 0) {
      await commander.clickButton({ selector: closeButtonSelector });
      await commander.wait({ ms: waitAfterClose, reason: 'modal to close' });

      if (verbose) {
        console.log('🔍 [VERBOSE] closeModalIfPresent: modal closed successfully');
      }

      return true;
    }

    return false;
  } catch (error) {
    if (verbose) {
      console.log(`🔍 [VERBOSE] closeModalIfPresent: error - ${error.message}`);
    }
    return false;
  }
}

/**
 * Check if a modal overlay is currently visible
 *
 * @param {Object} options - Options
 * @param {Object} options.commander - Browser commander instance
 * @param {boolean} [options.verbose=false] - Enable verbose logging
 * @returns {Promise<boolean>} - True if modal overlay is visible
 */
export async function isModalVisible(options = {}) {
  const { commander, verbose = false } = options;

  try {
    const count = await commander.count({ selector: SELECTORS.modalOverlay });
    const isVisible = count > 0;

    if (verbose) {
      console.log(`🔍 [VERBOSE] isModalVisible: ${isVisible}`);
    }

    return isVisible;
  } catch (error) {
    if (verbose) {
      console.log(`🔍 [VERBOSE] isModalVisible: error - ${error.message}`);
    }
    return false;
  }
}

/**
 * Wait for modal to close
 *
 * @param {Object} options - Options
 * @param {Object} options.commander - Browser commander instance
 * @param {number} [options.timeout=5000] - Maximum time to wait in ms
 * @param {number} [options.pollInterval=500] - How often to check in ms
 * @param {boolean} [options.verbose=false] - Enable verbose logging
 * @returns {Promise<boolean>} - True if modal closed within timeout
 */
export async function waitForModalToClose(options = {}) {
  const {
    commander,
    timeout = 5000,
    pollInterval = 500,
    verbose = false,
  } = options;

  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const isVisible = await isModalVisible({ commander, verbose: false });

    if (!isVisible) {
      if (verbose) {
        console.log('🔍 [VERBOSE] waitForModalToClose: modal closed');
      }
      return true;
    }

    await commander.wait({ ms: pollInterval, reason: 'polling for modal to close' });
  }

  if (verbose) {
    console.log('🔍 [VERBOSE] waitForModalToClose: timeout reached');
  }

  return false;
}

/**
 * Check if this is a direct application modal (application on external site)
 * and close it if found
 *
 * Direct applications redirect to employer's website instead of allowing
 * application through hh.ru. We want to skip these automatically.
 *
 * @param {Object} options - Options
 * @param {Object} options.commander - Browser commander instance
 * @param {boolean} [options.verbose=false] - Enable verbose logging
 * @returns {Promise<{isDirectApplication: boolean, closed: boolean}>}
 *   - isDirectApplication: true if this was a direct application modal
 *   - closed: true if the modal was successfully closed
 *
 * @example
 * const result = await checkAndCloseDirectApplicationModal({ commander });
 * if (result.isDirectApplication) {
 *   console.log('Skipped direct application');
 *   return { success: false, reason: 'direct_application' };
 * }
 */
export async function checkAndCloseDirectApplicationModal(options = {}) {
  const { commander, verbose = false } = options;

  try {
    // Check if the direct application cancel button exists
    const cancelButtonSelector = SELECTORS.directApplicationCancelButton;
    const count = await commander.count({ selector: cancelButtonSelector });

    if (verbose) {
      console.log(`🔍 [VERBOSE] checkAndCloseDirectApplicationModal: found ${count} cancel button(s)`);
    }

    if (count > 0) {
      // This is a direct application modal - verify by checking for the text
      const isDirectApp = await commander.safeEvaluate({
        fn: () => {
          // Check if modal contains the direct application text
          const modalOverlay = document.querySelector('[data-qa="modal-overlay"]');
          if (!modalOverlay) return false;

          const modalText = modalOverlay.textContent || '';
          // Look for the title "Вакансия с прямым откликом"
          return modalText.includes('Вакансия с прямым откликом') ||
                 modalText.includes('прямым откликом') ||
                 modalText.includes('сайте работодателя');
        },
        defaultValue: false,
        operationName: 'direct application check',
      });

      if (isDirectApp.navigationError) {
        if (verbose) {
          console.log('🔍 [VERBOSE] checkAndCloseDirectApplicationModal: navigation detected during check');
        }
        return { isDirectApplication: false, closed: false };
      }

      if (isDirectApp.value) {
        console.log('💡 Detected direct application modal (application on external site)');
        console.log('⏭️  Automatically skipping this vacancy...');

        // Click the cancel button
        await commander.clickButton({ selector: cancelButtonSelector, scrollIntoView: false });
        await commander.wait({ ms: 1000, reason: 'direct application modal to close' });

        if (verbose) {
          console.log('🔍 [VERBOSE] checkAndCloseDirectApplicationModal: clicked cancel button');
        }

        return { isDirectApplication: true, closed: true };
      }
    }

    return { isDirectApplication: false, closed: false };
  } catch (error) {
    if (verbose) {
      console.log(`🔍 [VERBOSE] checkAndCloseDirectApplicationModal: error - ${error.message}`);
    }
    return { isDirectApplication: false, closed: false };
  }
}
