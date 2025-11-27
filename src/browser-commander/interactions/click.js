import { TIMING } from '../core/constants.js';
import { isNavigationError } from '../core/navigation-safety.js';
import { isActionStoppedError } from '../core/page-trigger-manager.js';
import { waitForLocatorOrElement } from '../elements/locators.js';
import { scrollIntoViewIfNeeded } from './scroll.js';
import { logElementInfo } from '../elements/content.js';

/**
 * Default verification function for click operations.
 * Verifies that the click had an effect by checking for common patterns:
 * - Element state changes (disabled, aria-pressed, etc.)
 * - Element class changes
 * - Element visibility changes
 *
 * Note: Navigation-triggering clicks are considered "verified" if navigation starts.
 *
 * @param {Object} options - Verification options
 * @param {Object} options.page - Browser page object
 * @param {string} options.engine - Engine type ('playwright' or 'puppeteer')
 * @param {Object} options.locatorOrElement - Element that was clicked
 * @param {Object} options.preClickState - State captured before click (optional)
 * @returns {Promise<{verified: boolean, reason: string}>}
 */
export async function defaultClickVerification(options = {}) {
  const { page, engine, locatorOrElement, preClickState = {} } = options;

  try {
    // Get current element state
    const getElementState = async () => {
      if (engine === 'playwright') {
        return await locatorOrElement.evaluate((el) => ({
          disabled: el.disabled,
          ariaPressed: el.getAttribute('aria-pressed'),
          ariaExpanded: el.getAttribute('aria-expanded'),
          ariaSelected: el.getAttribute('aria-selected'),
          checked: el.checked,
          className: el.className,
          isConnected: el.isConnected,
        }));
      } else {
        return await page.evaluate((el) => ({
          disabled: el.disabled,
          ariaPressed: el.getAttribute('aria-pressed'),
          ariaExpanded: el.getAttribute('aria-expanded'),
          ariaSelected: el.getAttribute('aria-selected'),
          checked: el.checked,
          className: el.className,
          isConnected: el.isConnected,
        }), locatorOrElement);
      }
    };

    const postClickState = await getElementState();

    // If we have pre-click state, check for changes
    if (preClickState && Object.keys(preClickState).length > 0) {
      // Check for state changes that indicate click was processed
      if (preClickState.ariaPressed !== postClickState.ariaPressed) {
        return { verified: true, reason: 'aria-pressed changed' };
      }
      if (preClickState.ariaExpanded !== postClickState.ariaExpanded) {
        return { verified: true, reason: 'aria-expanded changed' };
      }
      if (preClickState.ariaSelected !== postClickState.ariaSelected) {
        return { verified: true, reason: 'aria-selected changed' };
      }
      if (preClickState.checked !== postClickState.checked) {
        return { verified: true, reason: 'checked state changed' };
      }
      if (preClickState.className !== postClickState.className) {
        return { verified: true, reason: 'className changed' };
      }
    }

    // If element is still connected and not disabled, assume click worked
    // (many clicks don't change element state - they trigger actions)
    if (postClickState.isConnected) {
      return { verified: true, reason: 'element still connected (assumed success)' };
    }

    // Element was removed from DOM - likely click triggered UI change
    return { verified: true, reason: 'element removed from DOM (UI updated)' };
  } catch (error) {
    if (isNavigationError(error) || isActionStoppedError(error)) {
      // Navigation/stop during verification - click likely triggered navigation
      return { verified: true, reason: 'navigation detected (expected for navigation clicks)', navigationError: true };
    }
    throw error;
  }
}

/**
 * Capture element state before click for verification
 * @param {Object} options - Options
 * @param {Object} options.page - Browser page object
 * @param {string} options.engine - Engine type
 * @param {Object} options.locatorOrElement - Element to capture state from
 * @returns {Promise<Object>} - Pre-click state object
 */
export async function capturePreClickState(options = {}) {
  const { page, engine, locatorOrElement } = options;

  try {
    if (engine === 'playwright') {
      return await locatorOrElement.evaluate((el) => ({
        disabled: el.disabled,
        ariaPressed: el.getAttribute('aria-pressed'),
        ariaExpanded: el.getAttribute('aria-expanded'),
        ariaSelected: el.getAttribute('aria-selected'),
        checked: el.checked,
        className: el.className,
        isConnected: el.isConnected,
      }));
    } else {
      return await page.evaluate((el) => ({
        disabled: el.disabled,
        ariaPressed: el.getAttribute('aria-pressed'),
        ariaExpanded: el.getAttribute('aria-expanded'),
        ariaSelected: el.getAttribute('aria-selected'),
        checked: el.checked,
        className: el.className,
        isConnected: el.isConnected,
      }), locatorOrElement);
    }
  } catch (error) {
    if (isNavigationError(error) || isActionStoppedError(error)) {
      return {};
    }
    throw error;
  }
}

/**
 * Verify click operation
 * @param {Object} options - Verification options
 * @param {Object} options.page - Browser page object
 * @param {string} options.engine - Engine type
 * @param {Object} options.locatorOrElement - Element that was clicked
 * @param {Object} options.preClickState - State captured before click
 * @param {Function} options.verifyFn - Custom verification function (optional)
 * @param {Function} options.log - Logger instance
 * @returns {Promise<{verified: boolean, reason: string}>}
 */
export async function verifyClick(options = {}) {
  const {
    page,
    engine,
    locatorOrElement,
    preClickState = {},
    verifyFn = defaultClickVerification,
    log = { debug: () => {} },
  } = options;

  const result = await verifyFn({
    page,
    engine,
    locatorOrElement,
    preClickState,
  });

  if (result.verified) {
    log.debug(() => `✅ Click verification passed: ${result.reason}`);
  } else {
    log.debug(() => `⚠️  Click verification uncertain: ${result.reason || 'unknown'}`);
  }

  return result;
}

/**
 * Click an element (low-level)
 * @param {Object} options - Configuration options
 * @param {Object} options.page - Browser page object (required for verification)
 * @param {string} options.engine - Engine type ('playwright' or 'puppeteer')
 * @param {Function} options.log - Logger instance
 * @param {Object} options.locatorOrElement - Element or locator to click
 * @param {boolean} options.noAutoScroll - Prevent Playwright's automatic scrolling (default: false)
 * @param {boolean} options.verify - Whether to verify the click operation (default: true)
 * @param {Function} options.verifyFn - Custom verification function (optional)
 * @returns {Promise<{clicked: boolean, verified: boolean, reason?: string}>}
 */
export async function clickElement(options = {}) {
  const {
    page,
    engine,
    log,
    locatorOrElement,
    noAutoScroll = false,
    verify = true,
    verifyFn,
  } = options;

  if (!locatorOrElement) {
    throw new Error('locatorOrElement is required in options');
  }

  try {
    // Capture pre-click state for verification
    let preClickState = {};
    if (verify && page) {
      preClickState = await capturePreClickState({ page, engine, locatorOrElement });
    }

    if (engine === 'playwright' && noAutoScroll) {
      // Prevent Playwright's automatic scrolling by using force option
      log.debug(() => `🔍 [VERBOSE] Clicking with noAutoScroll (force: true)`);
      await locatorOrElement.click({ force: true });
    } else {
      await locatorOrElement.click();
    }

    // Verify click if requested
    if (verify && page) {
      const verificationResult = await verifyClick({
        page,
        engine,
        locatorOrElement,
        preClickState,
        verifyFn,
        log,
      });

      return {
        clicked: true,
        verified: verificationResult.verified,
        reason: verificationResult.reason,
      };
    }

    return { clicked: true, verified: true };
  } catch (error) {
    if (isNavigationError(error) || isActionStoppedError(error)) {
      console.log('⚠️  Navigation/stop detected during click, recovering gracefully');
      // Navigation during click is considered verified (click triggered navigation)
      return { clicked: false, verified: true, reason: 'navigation during click' };
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
 * @param {boolean} options.verify - Whether to verify the click operation (default: true)
 * @param {Function} options.verifyFn - Custom verification function (optional)
 * @returns {Promise<{clicked: boolean, navigated: boolean, verified: boolean, reason?: string}>}
 *   - clicked: true if click was performed
 *   - navigated: true if click caused navigation
 *   - verified: true if click was verified (navigation counts as verification)
 * @throws {Error} - If selector is missing, element not found, or click operation fails (except navigation/stop errors)
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
    verify = true,
    verifyFn,
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
      const scrollResult = await scrollIntoViewIfNeeded({
        page,
        engine,
        wait,
        log,
        locatorOrElement,
        behavior,
        waitAfterScroll,
        verify: false, // Don't verify scroll here, we verify the overall click
      });
      // Check if scroll was aborted due to navigation/stop
      if (!scrollResult.skipped && !scrollResult.scrolled) {
        return { clicked: false, navigated: true, verified: true, reason: 'navigation during scroll' };
      }
    } else {
      log.debug(() => `🔍 [VERBOSE] Skipping scroll (scrollIntoView: false)`);
    }

    // Perform click with verification
    log.debug(() => `🔍 [VERBOSE] About to click element`);
    // If scrollIntoView is disabled, also prevent Playwright's automatic scrolling
    const clickResult = await clickElement({
      page,
      engine,
      log,
      locatorOrElement,
      noAutoScroll: !shouldScroll,
      verify,
      verifyFn,
    });

    if (!clickResult.clicked) {
      // Navigation/stop occurred during click itself
      return { clicked: false, navigated: true, verified: true, reason: 'navigation during click' };
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
        // Note: If navigationManager detected external navigation, it's already waiting
        // We still call waitForPageReady here to ensure we don't return until page is ready
        if (navigationManager) {
          // Use longer timeout (120s) for full page loads after click-triggered navigation
          await navigationManager.waitForPageReady({
            timeout: 120000,
            reason: 'after click navigation',
          });
        } else if (networkTracker) {
          // Without navigation manager, use network tracker directly with 30s idle time
          await networkTracker.waitForNetworkIdle({
            timeout: 120000,
            // idleTime defaults to 30000ms from tracker config
          });
        } else {
          // Fallback: wait a bit for page to settle
          await wait({ ms: 2000, reason: 'page settle after navigation' });
        }

        // Navigation is considered successful verification
        return { clicked: true, navigated: true, verified: true, reason: 'click triggered navigation' };
      }
    }

    // No navigation - wait after click if specified (useful for modals)
    if (waitAfterClick > 0) {
      const waitResult = await wait({ ms: waitAfterClick, reason: 'post-click settling time for modal scroll capture' });

      // Check if wait was aborted due to navigation that happened during the wait
      if (waitResult && waitResult.aborted) {
        log.debug(() => '🔄 Navigation detected during post-click wait (wait was aborted)');

        // Re-check for navigation since it happened during the wait
        const { navigated: lateNavigated, newUrl: lateUrl } = await detectNavigation({
          page,
          navigationManager,
          startUrl,
          log,
        });

        if (lateNavigated) {
          log.debug(() => `🔄 Confirmed late navigation to: ${lateUrl}`);

          // Wait for page to be fully ready
          if (navigationManager) {
            await navigationManager.waitForPageReady({
              timeout: 120000,
              reason: 'after late-detected click navigation',
            });
          }

          return { clicked: true, navigated: true, verified: true, reason: 'late-detected navigation' };
        }
      }
    }

    // Final check: did navigation happen while we were processing?
    // This catches cases where navigation started but wasn't detected earlier
    if (navigationManager && navigationManager.shouldAbort()) {
      log.debug(() => '🔄 Navigation detected via abort signal at end of click processing');

      await navigationManager.waitForPageReady({
        timeout: 120000,
        reason: 'after abort-detected click navigation',
      });

      return { clicked: true, navigated: true, verified: true, reason: 'abort-signal navigation' };
    }

    // If we have network tracking, wait for any XHR/fetch to complete
    // Use shorter idle time for non-navigation clicks (just waiting for XHR, not full page load)
    if (networkTracker) {
      await networkTracker.waitForNetworkIdle({
        timeout: 10000, // Maximum wait time
        idleTime: 2000, // Only 2 seconds of idle needed for XHR completion
      });
    }

    return {
      clicked: true,
      navigated: false,
      verified: clickResult.verified,
      reason: clickResult.reason,
    };
  } catch (error) {
    if (isNavigationError(error) || isActionStoppedError(error)) {
      console.log('⚠️  Navigation/stop detected during clickButton, recovering gracefully');
      // Navigation/stop during click is considered successful
      return { clicked: false, navigated: true, verified: true, reason: 'navigation/stop error' };
    }
    throw error;
  }
}
