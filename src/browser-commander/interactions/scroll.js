import { TIMING } from '../core/constants.js';

// Shared evaluation function for checking if scrolling is needed
const needsScrollingFn = (el, thresholdPercent) => {
  const rect = el.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const elementCenter = rect.top + rect.height / 2;
  const viewportCenter = viewportHeight / 2;
  const distanceFromCenter = Math.abs(elementCenter - viewportCenter);
  const thresholdPixels = (viewportHeight * thresholdPercent) / 100;

  // Check if element is visible and within threshold
  const isVisible = rect.top >= 0 && rect.bottom <= viewportHeight;
  const isWithinThreshold = distanceFromCenter <= thresholdPixels;

  return !isVisible || !isWithinThreshold;
};

/**
 * Scroll element into view (low-level, does not check if scroll is needed)
 * @param {Object} options - Configuration options
 * @param {Object} options.page - Browser page object
 * @param {string} options.engine - Engine type ('playwright' or 'puppeteer')
 * @param {Object} options.locatorOrElement - Playwright locator or Puppeteer element
 * @param {string} options.behavior - 'smooth' or 'instant' (default: 'smooth')
 */
export async function scrollIntoView(options = {}) {
  const { page, engine, locatorOrElement, behavior = 'smooth' } = options;

  if (!locatorOrElement) {
    throw new Error('locatorOrElement is required in options');
  }

  if (engine === 'playwright') {
    await locatorOrElement.evaluate((el, scrollBehavior) => {
      el.scrollIntoView({ behavior: scrollBehavior, block: 'center', inline: 'center' });
    }, behavior);
  } else {
    await page.evaluate((el, scrollBehavior) => {
      el.scrollIntoView({ behavior: scrollBehavior, block: 'center', inline: 'center' });
    }, locatorOrElement, behavior);
  }
}

/**
 * Check if element needs scrolling (is it more than threshold% away from viewport center)
 * @param {Object} options - Configuration options
 * @param {Object} options.page - Browser page object
 * @param {string} options.engine - Engine type ('playwright' or 'puppeteer')
 * @param {Object} options.locatorOrElement - Playwright locator or Puppeteer element
 * @param {number} options.threshold - Percentage of viewport height to consider "significant" (default: 10)
 * @returns {Promise<boolean>} - True if scroll is needed
 */
export async function needsScrolling(options = {}) {
  const { page, engine, locatorOrElement, threshold = 10 } = options;

  if (!locatorOrElement) {
    throw new Error('locatorOrElement is required in options');
  }

  if (engine === 'playwright') {
    return await locatorOrElement.evaluate(needsScrollingFn, threshold);
  } else {
    return await page.evaluate(needsScrollingFn, locatorOrElement, threshold);
  }
}

/**
 * Scroll element into view only if needed (>threshold% from center)
 * Automatically waits for scroll animation if scroll was performed
 * @param {Object} options - Configuration options
 * @param {Function} options.wait - Wait function
 * @param {Function} options.log - Logger instance
 * @param {Object} options.locatorOrElement - Playwright locator or Puppeteer element
 * @param {string} options.behavior - 'smooth' or 'instant' (default: 'smooth')
 * @param {number} options.threshold - Percentage of viewport height to consider "significant" (default: 10)
 * @param {number} options.waitAfterScroll - Wait time after scroll in ms (default: TIMING.SCROLL_ANIMATION_WAIT for smooth, 0 for instant)
 * @returns {Promise<boolean>} - True if scroll was performed, false if skipped
 */
export async function scrollIntoViewIfNeeded(options = {}) {
  const {
    page,
    engine,
    wait,
    log,
    locatorOrElement,
    behavior = 'smooth',
    threshold = 10,
    waitAfterScroll = behavior === 'smooth' ? TIMING.SCROLL_ANIMATION_WAIT : 0
  } = options;

  if (!locatorOrElement) {
    throw new Error('locatorOrElement is required in options');
  }

  // Check if scrolling is needed
  const needsScroll = await needsScrolling({ page, engine, locatorOrElement, threshold });

  if (!needsScroll) {
    log.debug(() => `🔍 [VERBOSE] Element already in view (within ${threshold}% threshold), skipping scroll`);
    return false;
  }

  // Perform scroll
  log.debug(() => `🔍 [VERBOSE] Scrolling with behavior: ${behavior}`);
  await scrollIntoView({ page, engine, locatorOrElement, behavior });

  // Wait for scroll animation if specified
  if (waitAfterScroll > 0) {
    await wait({ ms: waitAfterScroll, reason: `${behavior} scroll animation to complete` });
  }

  return true;
}
