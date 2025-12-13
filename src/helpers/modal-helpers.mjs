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
 * The direct application modal has this structure:
 * - Container: div.magritte-desktop-container with data-qa="magritte-alert" inside
 * - Title: "Вакансия с прямым откликом"
 * - Cancel button: data-qa="vacancy-response-link-advertising-cancel"
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
      console.log(`🔍 [VERBOSE] checkAndCloseDirectApplicationModal: found ${count} cancel button(s) with selector: ${cancelButtonSelector}`);
    }

    if (count > 0) {
      // Cancel button found - verify by checking for direct application text
      // The modal uses "magritte-alert" data-qa attribute, not "modal-overlay"
      // We check the text near the cancel button or in the page
      const isDirectApp = await commander.safeEvaluate({
        fn: () => {
          // First, verify the cancel button exists
          const cancelButton = document.querySelector('[data-qa="vacancy-response-link-advertising-cancel"]');
          if (!cancelButton) return { found: false, reason: 'no cancel button' };

          // Look for the magritte-alert container which is used for direct application modals
          // Note: Using hardcoded selector here since we're in browser context
          const magritteAlert = document.querySelector('[data-qa="magritte-alert"]');
          if (magritteAlert) {
            const alertText = magritteAlert.textContent || '';
            if (alertText.includes('Вакансия с прямым откликом') ||
                alertText.includes('прямым откликом') ||
                alertText.includes('сайте работодателя')) {
              return { found: true, reason: 'magritte-alert with direct application text' };
            }
          }

          // Fallback: check if the cancel button's container has the text
          // Walk up the DOM to find a container with the text
          let container = cancelButton.parentElement;
          for (let i = 0; i < 5 && container; i++) {
            const containerText = container.textContent || '';
            if (containerText.includes('Вакансия с прямым откликом') ||
                containerText.includes('прямым откликом') ||
                containerText.includes('сайте работодателя')) {
              return { found: true, reason: 'parent container with direct application text' };
            }
            container = container.parentElement;
          }

          // Also check for modal-overlay (original approach) as a fallback
          const modalOverlay = document.querySelector('[data-qa="modal-overlay"]');
          if (modalOverlay) {
            const modalText = modalOverlay.textContent || '';
            if (modalText.includes('Вакансия с прямым откликом') ||
                modalText.includes('прямым откликом') ||
                modalText.includes('сайте работодателя')) {
              return { found: true, reason: 'modal-overlay with direct application text' };
            }
          }

          return { found: false, reason: 'cancel button found but no direct application text nearby' };
        },
        defaultValue: { found: false, reason: 'evaluate failed' },
        operationName: 'direct application check',
      });

      if (isDirectApp.navigationError) {
        if (verbose) {
          console.log('🔍 [VERBOSE] checkAndCloseDirectApplicationModal: navigation detected during check');
        }
        return { isDirectApplication: false, closed: false };
      }

      if (verbose) {
        console.log(`🔍 [VERBOSE] checkAndCloseDirectApplicationModal: detection result = ${JSON.stringify(isDirectApp.value)}`);
      }

      if (isDirectApp.value && isDirectApp.value.found) {
        console.log('💡 Detected direct application modal (application on external site)');
        console.log(`   Detection reason: ${isDirectApp.value.reason}`);
        console.log('⏭️  Automatically skipping this vacancy...');

        // Click the cancel button
        await commander.clickButton({ selector: cancelButtonSelector, scrollIntoView: false });
        await commander.wait({ ms: 1000, reason: 'direct application modal to close' });

        console.log('✅ Direct application skipped, continuing with next vacancy...');

        if (verbose) {
          console.log('🔍 [VERBOSE] checkAndCloseDirectApplicationModal: clicked cancel button successfully');
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
