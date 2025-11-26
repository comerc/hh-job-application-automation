/**
 * Navigation-related browser operations
 */

import { isNavigationError } from '../core/navigation-safety.js';

/**
 * Wait for URL to stabilize (no redirects happening)
 * @param {Object} options - Configuration options
 * @param {Object} options.page - Browser page object
 * @param {Function} options.log - Logger instance
 * @param {Function} options.wait - Wait function
 * @param {number} options.stableChecks - Number of consecutive stable checks required (default: 3)
 * @param {number} options.checkInterval - Interval between stability checks in ms (default: 1000)
 * @param {number} options.timeout - Maximum time to wait for stabilization in ms (default: 30000)
 * @param {string} options.reason - Reason for stabilization (for logging)
 * @returns {Promise<boolean>} - True if stabilized, false if timeout
 */
export async function waitForUrlStabilization(options = {}) {
  const {
    page,
    log,
    wait,
    stableChecks = 3,
    checkInterval = 1000,
    timeout = 30000,
    reason = 'URL stabilization',
  } = options;

  log.debug(() => `⏳ Waiting for URL to stabilize (${reason})...`);
  let stableCount = 0;
  let lastUrl = page.url();
  const startTime = Date.now();

  while (stableCount < stableChecks) {
    // Check timeout
    if (Date.now() - startTime > timeout) {
      log.debug(() => `⚠️  URL stabilization timeout after ${timeout}ms (${reason})`);
      return false;
    }

    await wait({ ms: checkInterval, reason: 'checking URL stability' });
    const currentUrl = page.url();

    if (currentUrl === lastUrl) {
      stableCount++;
      log.debug(() => `🔍 [VERBOSE] URL stable for ${stableCount}/${stableChecks} checks: ${currentUrl}`);
    } else {
      stableCount = 0;
      lastUrl = currentUrl;
      log.debug(() => `🔍 [VERBOSE] URL changed to: ${currentUrl}, resetting stability counter`);
    }
  }

  log.debug(() => `✅ URL stabilized (${reason})`);
  return true;
}

/**
 * Navigate to URL
 * @param {Object} options - Configuration options
 * @param {Object} options.page - Browser page object
 * @param {Function} options.waitForUrlStabilization - URL stabilization function
 * @param {string} options.url - URL to navigate to
 * @param {string} options.waitUntil - Wait until condition (default: 'domcontentloaded')
 * @param {boolean} options.waitForStableUrlBefore - Wait for URL to stabilize BEFORE navigation (default: true)
 * @param {boolean} options.waitForStableUrlAfter - Wait for URL to stabilize AFTER navigation (default: true)
 * @param {number} options.stableChecks - Number of consecutive stable checks required (default: 3)
 * @param {number} options.checkInterval - Interval between stability checks in ms (default: 1000)
 * @param {number} options.timeout - Navigation timeout in ms (default: 60000)
 * @returns {Promise<boolean>} - True if navigation succeeded, false on navigation-related error
 */
export async function goto(options = {}) {
  const {
    page,
    waitForUrlStabilization: stabilizeFn,
    url,
    waitUntil = 'domcontentloaded',
    waitForStableUrlBefore = true,
    waitForStableUrlAfter = true,
    stableChecks = 3,
    checkInterval = 1000,
    timeout = 240000,
  } = options;

  if (!url) {
    throw new Error('url is required in options');
  }

  try {
    // Wait for URL to stabilize BEFORE navigation (to avoid interrupting natural redirects)
    if (waitForStableUrlBefore) {
      await stabilizeFn({
        stableChecks,
        checkInterval,
        reason: 'before navigation',
      });
    }

    // Navigate to the URL
    await page.goto(url, { waitUntil, timeout });

    // Wait for URL to stabilize AFTER navigation (to ensure all redirects are complete)
    if (waitForStableUrlAfter) {
      await stabilizeFn({
        stableChecks,
        checkInterval,
        reason: 'after navigation',
      });
    }

    return true;
  } catch (error) {
    if (isNavigationError(error)) {
      console.log('⚠️  Navigation was interrupted, recovering gracefully');
      return false;
    }
    throw error;
  }
}

/**
 * Wait for navigation
 * @param {Object} options - Configuration options
 * @param {Object} options.page - Browser page object
 * @param {number} options.timeout - Timeout in ms
 * @returns {Promise<boolean>} - True if navigation completed, false on error
 */
export async function waitForNavigation(options = {}) {
  const { page, timeout } = options;
  try {
    await page.waitForNavigation(timeout ? { timeout } : undefined);
    return true;
  } catch (error) {
    if (isNavigationError(error)) {
      console.log('⚠️  waitForNavigation was interrupted, continuing gracefully');
      return false;
    }
    throw error;
  }
}
