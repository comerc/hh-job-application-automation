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
