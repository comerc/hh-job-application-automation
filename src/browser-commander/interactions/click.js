import { TIMING } from '../core/constants.js';
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
 * @returns {Promise<void>}
 */
export async function clickElement(options = {}) {
  const { engine, log, locatorOrElement, noAutoScroll = false } = options;

  if (!locatorOrElement) {
    throw new Error('locatorOrElement is required in options');
  }

  if (engine === 'playwright' && noAutoScroll) {
    // Prevent Playwright's automatic scrolling by using force option
    log.debug(() => `🔍 [VERBOSE] Clicking with noAutoScroll (force: true)`);
    await locatorOrElement.click({ force: true });
  } else {
    await locatorOrElement.click();
  }
}

/**
 * Click a button or element (high-level with scrolling and waits)
 * @param {Object} options - Configuration options
 * @param {Object} options.page - Browser page object
 * @param {string} options.engine - Engine type ('playwright' or 'puppeteer')
 * @param {Function} options.wait - Wait function
 * @param {Function} options.log - Logger instance
 * @param {boolean} options.verbose - Enable verbose logging
 * @param {string|Object} options.selector - CSS selector, ElementHandle, or Playwright Locator
 * @param {boolean} options.scrollIntoView - Scroll into view (default: true)
 * @param {number} options.waitAfterScroll - Wait time after scroll in ms (default: TIMING.DEFAULT_WAIT_AFTER_SCROLL)
 * @param {boolean} options.smoothScroll - Use smooth scroll animation (default: true)
 * @param {number} options.waitAfterClick - Wait time after click in ms (default: 1000). Gives modals time to capture scroll position before opening
 * @param {number} options.timeout - Timeout in ms (default: TIMING.DEFAULT_TIMEOUT)
 * @returns {Promise<void>}
 * @throws {Error} - If selector is missing, element not found, or click operation fails
 */
export async function clickButton(options = {}) {
  const {
    page,
    engine,
    wait,
    log,
    verbose = false,
    selector,
    scrollIntoView: shouldScroll = true,
    waitAfterScroll = TIMING.DEFAULT_WAIT_AFTER_SCROLL,
    smoothScroll = true,
    waitAfterClick = 1000,
    timeout = TIMING.DEFAULT_TIMEOUT,
  } = options;

  if (!selector) {
    throw new Error('clickButton: selector is required in options');
  }

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
  await clickElement({ engine, log, locatorOrElement, noAutoScroll: !shouldScroll });
  log.debug(() => `🔍 [VERBOSE] Click completed`);

  // Wait after click if specified (useful for modals that need time to capture scroll position)
  if (waitAfterClick > 0) {
    await wait({ ms: waitAfterClick, reason: 'post-click settling time for modal scroll capture' });
  }
}
