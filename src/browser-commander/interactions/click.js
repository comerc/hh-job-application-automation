import { TIMING } from '../core/constants.js';
import { isNavigationError } from '../core/navigation-safety.js';
import { waitForLocatorOrElement } from '../elements/locators.js';
import { scrollIntoViewIfNeeded } from './scroll.js';
import { logElementInfo } from '../elements/content.js';

/**
 * Click an element (low-level)
 * @param {Object} options - Configuration options
 * @param {string} options.engine - Engine type ('playwright' or 'puppeteer')
 * @param {Function} options.log - Logger instance
 * @param {Object} options.locatorOrElement - Element or locator to click
 * @param {boolean} options.noAutoScroll - Prevent Playwright's automatic scrolling (default: false)
 * @returns {Promise<boolean>} - True if clicked, false on navigation
 */
export async function clickElement(options = {}) {
  const { engine, log, locatorOrElement, noAutoScroll = false } = options;

  if (!locatorOrElement) {
    throw new Error('locatorOrElement is required in options');
  }

  try {
    if (engine === 'playwright' && noAutoScroll) {
      // Prevent Playwright's automatic scrolling by using force option
      log.debug(() => `🔍 [VERBOSE] Clicking with noAutoScroll (force: true)`);
      await locatorOrElement.click({ force: true });
    } else {
      await locatorOrElement.click();
    }
    return true;
  } catch (error) {
    if (isNavigationError(error)) {
      console.log('⚠️  Navigation detected during click, recovering gracefully');
      return false;
    }
    throw error;
  }
}

/**
 * Detect if a click caused navigation by checking URL change or navigation state
 * @param {Object} options - Configuration options
 * @param {Object} options.page - Browser page object
 * @param {Object} options.navigationManager - NavigationManager instance (optional)
 * @param {string} options.startUrl - URL before click
 * @param {Function} options.log - Logger instance
 * @returns {Promise<{navigated: boolean, newUrl: string}>}
 */
async function detectNavigation(options = {}) {
  const { page, navigationManager, startUrl, log } = options;

  const currentUrl = page.url();
  const urlChanged = currentUrl !== startUrl;

  if (navigationManager && navigationManager.isNavigating()) {
    log.debug(() => '🔄 Navigation detected via NavigationManager');
    return { navigated: true, newUrl: currentUrl };
  }

  if (urlChanged) {
    log.debug(() => `🔄 URL changed: ${startUrl} → ${currentUrl}`);
    return { navigated: true, newUrl: currentUrl };
  }

  return { navigated: false, newUrl: currentUrl };
}

/**
 * Click a button or element (high-level with scrolling and waits)
 * Now navigation-aware - automatically waits for page ready after navigation-causing clicks.
 *
 * @param {Object} options - Configuration options
 * @param {Object} options.page - Browser page object
 * @param {string} options.engine - Engine type ('playwright' or 'puppeteer')
 * @param {Function} options.wait - Wait function
 * @param {Function} options.log - Logger instance
 * @param {boolean} options.verbose - Enable verbose logging
 * @param {Object} options.navigationManager - NavigationManager instance (optional)
 * @param {Object} options.networkTracker - NetworkTracker instance (optional)
 * @param {string|Object} options.selector - CSS selector, ElementHandle, or Playwright Locator
 * @param {boolean} options.scrollIntoView - Scroll into view (default: true)
 * @param {number} options.waitAfterScroll - Wait time after scroll in ms (default: TIMING.DEFAULT_WAIT_AFTER_SCROLL)
 * @param {boolean} options.smoothScroll - Use smooth scroll animation (default: true)
 * @param {number} options.waitAfterClick - Wait time after click in ms (default: 1000). Gives modals time to capture scroll position before opening
 * @param {boolean} options.waitForNavigation - Wait for navigation to complete if click causes navigation (default: true)
 * @param {number} options.navigationCheckDelay - Time to check if navigation started (default: 500ms)
 * @param {number} options.timeout - Timeout in ms (default: TIMING.DEFAULT_TIMEOUT)
 * @returns {Promise<{clicked: boolean, navigated: boolean}>} - Click and navigation result
 * @throws {Error} - If selector is missing, element not found, or click operation fails (except navigation errors)
 */
export async function clickButton(options = {}) {
  const {
    page,
    engine,
    wait,
    log,
    verbose = false,
    navigationManager,
    networkTracker,
    selector,
    scrollIntoView: shouldScroll = true,
    waitAfterScroll = TIMING.DEFAULT_WAIT_AFTER_SCROLL,
    smoothScroll = true,
    waitAfterClick = 1000,
    waitForNavigation = true,
    navigationCheckDelay = 500,
    timeout = TIMING.DEFAULT_TIMEOUT,
  } = options;

  if (!selector) {
    throw new Error('clickButton: selector is required in options');
  }

  // Record URL before click for navigation detection
  const startUrl = page.url();

  try {
    // Get locator/element and wait for it to be visible (unified for both engines)
    const locatorOrElement = await waitForLocatorOrElement({ page, engine, selector, timeout });

    // Log element info if verbose
    if (verbose) {
      await logElementInfo({ page, engine, log, locatorOrElement });
    }

    // Scroll into view (if requested and needed)
    if (shouldScroll) {
      const behavior = smoothScroll ? 'smooth' : 'instant';
      await scrollIntoViewIfNeeded({ page, engine, wait, log, locatorOrElement, behavior, waitAfterScroll });
    } else {
      log.debug(() => `🔍 [VERBOSE] Skipping scroll (scrollIntoView: false)`);
    }

    // Perform click
    log.debug(() => `🔍 [VERBOSE] About to click element`);
    // If scrollIntoView is disabled, also prevent Playwright's automatic scrolling
    const clicked = await clickElement({ engine, log, locatorOrElement, noAutoScroll: !shouldScroll });
    if (!clicked) {
      // Navigation occurred during click itself
      return { clicked: false, navigated: true };
    }
    log.debug(() => `🔍 [VERBOSE] Click completed`);

    // Check if click caused navigation
    if (waitForNavigation) {
      // Wait briefly for navigation to potentially start
      await wait({ ms: navigationCheckDelay, reason: 'checking for navigation after click' });

      // Detect if navigation occurred
      const { navigated, newUrl } = await detectNavigation({
        page,
        navigationManager,
        startUrl,
        log,
      });

      if (navigated) {
        log.debug(() => `🔄 Click triggered navigation to: ${newUrl}`);

        // Wait for page to be fully ready (network idle + no more redirects)
        if (navigationManager) {
          await navigationManager.waitForPageReady({
            timeout,
            reason: 'after click navigation',
          });
        } else if (networkTracker) {
          await networkTracker.waitForNetworkIdle({ timeout });
        } else {
          // Fallback: wait a bit for page to settle
          await wait({ ms: 2000, reason: 'page settle after navigation' });
        }

        return { clicked: true, navigated: true };
      }
    }

    // No navigation - wait after click if specified (useful for modals)
    if (waitAfterClick > 0) {
      await wait({ ms: waitAfterClick, reason: 'post-click settling time for modal scroll capture' });
    }

    // If we have network tracking, wait for any XHR/fetch to complete
    if (networkTracker) {
      await networkTracker.waitForNetworkIdle({
        timeout: 5000, // Shorter timeout for non-navigation clicks
      });
    }

    return { clicked: true, navigated: false };
  } catch (error) {
    if (isNavigationError(error)) {
      console.log('⚠️  Navigation detected during clickButton, recovering gracefully');
      return { clicked: false, navigated: true };
    }
    throw error;
  }
}
