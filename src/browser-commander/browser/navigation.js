/**
 * Navigation-related browser operations
 *
 * This module provides navigation functions that can work with or without
 * the NavigationManager for backwards compatibility.
 */

import { isNavigationError } from '../core/navigation-safety.js';

/**
 * Wait for URL to stabilize (no redirects happening)
 * This is a legacy polling-based approach for backwards compatibility.
 * When navigationManager is available, use waitForPageReady instead.
 *
 * @param {Object} options - Configuration options
 * @param {Object} options.page - Browser page object
 * @param {Function} options.log - Logger instance
 * @param {Function} options.wait - Wait function
 * @param {Object} options.navigationManager - NavigationManager instance (optional)
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
    navigationManager,
    stableChecks = 3,
    checkInterval = 1000,
    timeout = 30000,
    reason = 'URL stabilization',
  } = options;

  // If NavigationManager is available, delegate to it
  if (navigationManager) {
    return navigationManager.waitForPageReady({ timeout, reason });
  }

  // Legacy polling-based approach
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
 * Navigate to URL with full wait for page ready
 * @param {Object} options - Configuration options
 * @param {Object} options.page - Browser page object
 * @param {Function} options.waitForUrlStabilization - URL stabilization function (legacy)
 * @param {Object} options.navigationManager - NavigationManager instance (preferred)
 * @param {string} options.url - URL to navigate to
 * @param {string} options.waitUntil - Wait until condition (default: 'domcontentloaded')
 * @param {boolean} options.waitForStableUrlBefore - Wait for URL to stabilize BEFORE navigation (default: true)
 * @param {boolean} options.waitForStableUrlAfter - Wait for URL to stabilize AFTER navigation (default: true)
 * @param {boolean} options.waitForNetworkIdle - Wait for all network requests to complete (default: true)
 * @param {number} options.stableChecks - Number of consecutive stable checks required (default: 3)
 * @param {number} options.checkInterval - Interval between stability checks in ms (default: 1000)
 * @param {number} options.timeout - Navigation timeout in ms (default: 60000)
 * @returns {Promise<boolean>} - True if navigation succeeded, false on navigation-related error
 */
export async function goto(options = {}) {
  const {
    page,
    waitForUrlStabilization: stabilizeFn,
    navigationManager,
    url,
    waitUntil = 'domcontentloaded',
    waitForStableUrlBefore = true,
    waitForStableUrlAfter = true,
    waitForNetworkIdle = true,
    stableChecks = 3,
    checkInterval = 1000,
    timeout = 240000,
  } = options;

  if (!url) {
    throw new Error('url is required in options');
  }

  // If NavigationManager is available, use it for full navigation handling
  if (navigationManager) {
    return navigationManager.navigate({
      url,
      waitUntil,
      timeout,
    });
  }

  // Legacy approach without NavigationManager
  try {
    // Wait for URL to stabilize BEFORE navigation (to avoid interrupting natural redirects)
    if (waitForStableUrlBefore && stabilizeFn) {
      await stabilizeFn({
        stableChecks,
        checkInterval,
        reason: 'before navigation',
      });
    }

    // Navigate to the URL
    await page.goto(url, { waitUntil, timeout });

    // Wait for URL to stabilize AFTER navigation (to ensure all redirects are complete)
    if (waitForStableUrlAfter && stabilizeFn) {
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
 * @param {Object} options.navigationManager - NavigationManager instance (optional)
 * @param {number} options.timeout - Timeout in ms
 * @returns {Promise<boolean>} - True if navigation completed, false on error
 */
export async function waitForNavigation(options = {}) {
  const { page, navigationManager, timeout } = options;

  // If NavigationManager is available, use it
  if (navigationManager) {
    return navigationManager.waitForNavigation({ timeout });
  }

  // Legacy approach
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

/**
 * Wait for page to be fully ready (DOM loaded + network idle + no redirects)
 * This is the recommended method for ensuring page is ready for manipulation.
 *
 * @param {Object} options - Configuration options
 * @param {Object} options.page - Browser page object
 * @param {Object} options.navigationManager - NavigationManager instance (required for full functionality)
 * @param {Object} options.networkTracker - NetworkTracker instance (optional)
 * @param {Function} options.log - Logger instance
 * @param {Function} options.wait - Wait function
 * @param {number} options.timeout - Maximum time to wait (default: 30000ms)
 * @param {string} options.reason - Reason for waiting (for logging)
 * @returns {Promise<boolean>} - True if ready, false if timeout
 */
export async function waitForPageReady(options = {}) {
  const {
    page,
    navigationManager,
    networkTracker,
    log,
    wait,
    timeout = 30000,
    reason = 'page ready',
  } = options;

  // If NavigationManager is available, delegate to it
  if (navigationManager) {
    return navigationManager.waitForPageReady({ timeout, reason });
  }

  // Fallback: use network tracker directly if available
  if (networkTracker) {
    log.debug(() => `⏳ Waiting for page ready (${reason})...`);
    const startTime = Date.now();

    // Wait for network idle
    const networkIdle = await networkTracker.waitForNetworkIdle({
      timeout,
    });

    const elapsed = Date.now() - startTime;
    if (networkIdle) {
      log.debug(() => `✅ Page ready after ${elapsed}ms (${reason})`);
    } else {
      log.debug(() => `⚠️  Page ready timeout after ${elapsed}ms (${reason})`);
    }

    return networkIdle;
  }

  // Minimal fallback: just wait a bit for DOM to settle
  log.debug(() => `⏳ Waiting for page ready - minimal mode (${reason})...`);
  await wait({ ms: 1000, reason: 'page settle time' });
  return true;
}

/**
 * Wait for any ongoing navigation and network requests to complete.
 * Use this after actions that might trigger navigation (like clicks).
 *
 * @param {Object} options - Configuration options
 * @param {Object} options.page - Browser page object
 * @param {Object} options.navigationManager - NavigationManager instance
 * @param {Object} options.networkTracker - NetworkTracker instance
 * @param {Function} options.log - Logger instance
 * @param {Function} options.wait - Wait function
 * @param {number} options.navigationCheckDelay - Time to wait for potential navigation to start (default: 500ms)
 * @param {number} options.timeout - Maximum time to wait (default: 30000ms)
 * @param {string} options.reason - Reason for waiting (for logging)
 * @returns {Promise<{navigated: boolean, ready: boolean}>}
 */
export async function waitAfterAction(options = {}) {
  const {
    page,
    navigationManager,
    networkTracker,
    log,
    wait,
    navigationCheckDelay = 500,
    timeout = 30000,
    reason = 'after action',
  } = options;

  const startUrl = page.url();
  const startTime = Date.now();

  log.debug(() => `⏳ Waiting after action (${reason})...`);

  // Wait briefly for potential navigation to start
  await wait({ ms: navigationCheckDelay, reason: 'checking for navigation' });

  // Check if navigation is in progress or URL changed
  const currentUrl = page.url();
  const urlChanged = currentUrl !== startUrl;

  if (navigationManager && navigationManager.isNavigating()) {
    log.debug(() => '🔄 Navigation in progress, waiting for completion...');
    await navigationManager.waitForNavigation({
      timeout: timeout - (Date.now() - startTime),
    });
    return { navigated: true, ready: true };
  }

  if (urlChanged) {
    log.debug(() => `🔄 URL changed: ${startUrl} → ${currentUrl}`);

    // Wait for page to be fully ready
    await waitForPageReady({
      page,
      navigationManager,
      networkTracker,
      log,
      wait,
      timeout: timeout - (Date.now() - startTime),
      reason: 'after URL change',
    });

    return { navigated: true, ready: true };
  }

  // No navigation detected, just wait for network idle
  // Use shorter idle time since this is just for XHR completion, not full page load
  if (networkTracker) {
    const idle = await networkTracker.waitForNetworkIdle({
      timeout: Math.max(0, timeout - (Date.now() - startTime)),
      idleTime: 2000, // Shorter idle time for non-navigation actions
    });
    return { navigated: false, ready: idle };
  }

  return { navigated: false, ready: true };
}
