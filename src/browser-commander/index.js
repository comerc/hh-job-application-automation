/**
 * Browser Commander - Universal browser automation library
 * Supports both Playwright and Puppeteer with a unified API
 * All functions use options objects for easy maintenance
 */

import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import makeLog from 'log-lazy';

/**
 * Common Chrome arguments used across both Playwright and Puppeteer
 */
const CHROME_ARGS = [
  '--disable-session-crashed-bubble',
  '--hide-crash-restore-bubble',
  '--disable-infobars',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-crash-restore',
];

/**
 * Timing constants for browser operations
 */
const TIMING = {
  SCROLL_ANIMATION_WAIT: 300,      // Wait time for scroll animations to complete
  DEFAULT_WAIT_AFTER_SCROLL: 1000, // Default wait after scrolling to element
  VISIBILITY_CHECK_TIMEOUT: 100,   // Timeout for quick visibility checks
  DEFAULT_TIMEOUT: 5000,           // Default timeout for most operations
};

/**
 * Disables Chrome translate feature by modifying the Preferences file
 * @param {Object} options - Configuration options
 * @param {string} options.userDataDir - Path to Chrome user data directory
 */
async function disableTranslateInPreferences(options = {}) {
  const { userDataDir } = options;

  if (!userDataDir) {
    throw new Error('userDataDir is required in options');
  }
  const preferencesPath = path.join(userDataDir, 'Default', 'Preferences');
  const defaultDir = path.join(userDataDir, 'Default');

  try {
    await fs.mkdir(defaultDir, { recursive: true });

    let preferences = {};

    try {
      const content = await fs.readFile(preferencesPath, 'utf8');
      preferences = JSON.parse(content);
    } catch {
      // File doesn't exist yet, will create new one
    }

    if (!preferences.translate) {
      preferences.translate = {};
    }
    preferences.translate.enabled = false;

    await fs.writeFile(preferencesPath, JSON.stringify(preferences, null, 2), 'utf8');
  } catch (error) {
    console.error('⚠️  Warning: Could not modify Preferences file:', error.message);
  }
}

/**
 * Check if verbose logging is enabled via environment or CLI args
 * @returns {boolean} - True if verbose mode is enabled
 */
function isVerboseEnabled() {
  return !!(process.env.VERBOSE || process.argv.includes('--verbose'));
}

/**
 * Create a logger instance with verbose level control
 * @param {Object} options - Configuration options
 * @param {boolean} options.verbose - Enable verbose logging
 * @returns {Object} - Logger instance
 */
function createLogger(options = {}) {
  const { verbose = false } = options;
  const log = makeLog({ level: verbose ? 'debug' : 'error' });
  return log;
}

/**
 * Detect which browser automation engine is being used
 * @param {Object} pageOrContext - Page or context object from Playwright or Puppeteer
 * @returns {string} - 'playwright' or 'puppeteer'
 */
function detectEngine(pageOrContext) {
  const hasEval = !!pageOrContext.$eval;
  const hasEvalAll = !!pageOrContext.$$eval;
  const locatorType = typeof pageOrContext.locator;
  const contextType = typeof pageOrContext.context;
  const hasContext = contextType === 'function' || contextType === 'object';

  // Debug logging
  if (isVerboseEnabled()) {
    console.log('🔍 [ENGINE DETECTION]', {
      hasEval,
      hasEvalAll,
      locatorType,
      contextType,
      hasContext,
    });
  }

  // Check for Playwright-specific methods first
  // Playwright has locator as a function and context() method
  // Both engines have $eval and $$eval, so we check for unique Playwright features first
  if (locatorType === 'function' && hasContext) {
    if (isVerboseEnabled()) {
      console.log('🔍 [ENGINE DETECTION] Detected: playwright');
    }
    return 'playwright';
  }
  // Check for Puppeteer-specific methods
  // Puppeteer has $eval, $$eval but no context() method
  if (hasEval && hasEvalAll && !hasContext) {
    if (isVerboseEnabled()) {
      console.log('🔍 [ENGINE DETECTION] Detected: puppeteer');
    }
    return 'puppeteer';
  }
  if (isVerboseEnabled()) {
    console.log('🔍 [ENGINE DETECTION] Could not detect engine!');
  }
  throw new Error('Unknown browser automation engine. Expected Playwright or Puppeteer page object.');
}

/**
 * Launch browser with default configuration
 * @param {Object} options - Configuration options
 * @param {string} options.engine - Browser automation engine: 'playwright' or 'puppeteer'
 * @param {string} options.userDataDir - Path to user data directory
 * @param {boolean} options.headless - Run in headless mode (default: false)
 * @param {number} options.slowMo - Slow down operations by ms (default: 150 for Playwright, 0 for Puppeteer)
 * @param {boolean} options.verbose - Enable verbose logging (default: false)
 * @returns {Promise<Object>} - Object with browser and page
 */
export async function launchBrowser(options = {}) {
  const {
    engine = 'playwright',
    userDataDir = path.join(os.homedir(), '.hh-apply', `${engine}-data`),
    headless = false,
    slowMo = engine === 'playwright' ? 150 : 0,
    verbose = false,
  } = options;

  if (!['playwright', 'puppeteer'].includes(engine)) {
    throw new Error(`Invalid engine: ${engine}. Expected 'playwright' or 'puppeteer'`);
  }

  // Set environment variables to suppress warnings
  process.env.GOOGLE_API_KEY = 'no';
  process.env.GOOGLE_DEFAULT_CLIENT_ID = 'no';
  process.env.GOOGLE_DEFAULT_CLIENT_SECRET = 'no';

  // Disable translate in Preferences
  await disableTranslateInPreferences({ userDataDir });

  if (verbose) {
    console.log(`🚀 Launching browser with ${engine} engine...`);
  }

  let browser;
  let page;

  if (engine === 'playwright') {
    const { chromium } = await import('playwright');
    browser = await chromium.launchPersistentContext(userDataDir, {
      headless,
      slowMo,
      chromiumSandbox: true,
      viewport: null,
      args: CHROME_ARGS,
      ignoreDefaultArgs: ['--enable-automation'],
    });
    page = browser.pages()[0];
  } else {
    const puppeteer = await import('puppeteer');
    browser = await puppeteer.default.launch({
      headless,
      defaultViewport: null,
      args: ['--start-maximized', ...CHROME_ARGS],
      userDataDir,
    });
    const pages = await browser.pages();
    page = pages[0];
  }

  if (verbose) {
    console.log(`✅ Browser launched with ${engine} engine`);
  }

  // Unfocus address bar automatically after browser launch
  // Using page.bringToFront() - confirmed working solution
  try {
    // Wait for the browser to fully initialize
    await new Promise(r => setTimeout(r, 500));

    // Bring page to front - this removes focus from address bar
    await page.bringToFront();

    if (verbose) {
      console.log('✅ Address bar unfocused automatically');
    }
  } catch (error) {
    // Ignore errors - this is just a UX improvement
    if (verbose) {
      console.log('⚠️  Could not unfocus address bar:', error.message);
    }
  }

  return { browser, page };
}

/**
 * Create a browser commander instance for a specific page
 * @param {Object} options - Configuration options
 * @param {Object} options.page - Playwright or Puppeteer page object
 * @param {boolean} options.verbose - Enable verbose logging
 * @returns {Object} - Browser commander API
 */
export function makeBrowserCommander(options = {}) {
  const { page, verbose = false } = options;

  if (!page) {
    throw new Error('page is required in options');
  }

  const engine = detectEngine(page);

  // Create logger instance with debug level for verbose mode
  const log = createLogger({ verbose });

  /**
   * Helper to create Playwright locator from selector string
   * Handles :nth-of-type() pseudo-selectors which don't work in Playwright locators
   * @param {Object} options - Configuration options
   * @param {string} options.selector - CSS selector
   * @returns {Object} - Playwright locator
   */
  function createPlaywrightLocator(options = {}) {
    const { selector } = options;

    if (!selector) {
      throw new Error('selector is required in options');
    }
    // Check if selector has :nth-of-type(n) pattern
    const nthOfTypeMatch = selector.match(/^(.+):nth-of-type\((\d+)\)$/);

    if (nthOfTypeMatch) {
      const baseSelector = nthOfTypeMatch[1];
      const index = parseInt(nthOfTypeMatch[2], 10) - 1; // Convert to 0-based index
      return page.locator(baseSelector).nth(index);
    }

    return page.locator(selector);
  }

  /**
   * Get locator/element from selector (unified helper for both engines)
   * Does NOT wait - use waitForLocatorOrElement() if you need to wait
   * @param {Object} options - Configuration options
   * @param {string|Object} options.selector - CSS selector or element/locator
   * @returns {Promise<Object|null>} - Locator for Playwright, Element for Puppeteer (can be null)
   */
  async function getLocatorOrElement(options = {}) {
    const { selector } = options;

    if (!selector) {
      throw new Error('selector is required in options');
    }
    if (typeof selector !== 'string') {
      return selector; // Already a locator/element
    }

    if (engine === 'playwright') {
      return createPlaywrightLocator({ selector });
    } else {
      // For Puppeteer, return element (can be null if doesn't exist)
      return await page.$(selector);
    }
  }

  /**
   * Check if an input element is empty
   * @param {Object} options - Configuration options
   * @param {Object} options.locatorOrElement - Element or locator to check
   * @returns {Promise<boolean>} - True if empty, false if has content
   */
  async function checkIfElementEmpty(options = {}) {
    const { locatorOrElement } = options;

    if (!locatorOrElement) {
      throw new Error('locatorOrElement is required in options');
    }

    if (engine === 'playwright') {
      const currentValue = await locatorOrElement.inputValue();
      return !currentValue || currentValue.trim() === '';
    } else {
      const currentValue = await page.evaluate(el => el.value, locatorOrElement);
      return !currentValue || currentValue.trim() === '';
    }
  }

  /**
   * Perform fill/type operation on an element
   * @param {Object} options - Configuration options
   * @param {Object} options.locatorOrElement - Element or locator to fill
   * @param {string} options.text - Text to fill
   * @param {boolean} options.simulateTyping - Whether to simulate typing (default: true)
   * @returns {Promise<void>}
   */
  async function performFill(options = {}) {
    const { locatorOrElement, text, simulateTyping = true } = options;

    if (!text) {
      throw new Error('text is required in options');
    }

    if (!locatorOrElement) {
      throw new Error('locatorOrElement is required in options');
    }

    if (engine === 'playwright') {
      if (simulateTyping) {
        await locatorOrElement.type(text);
      } else {
        await locatorOrElement.fill(text);
      }
    } else {
      if (simulateTyping) {
        // For Puppeteer, we need to focus first, then type
        await locatorOrElement.focus();
        await page.keyboard.type(text);
      } else {
        await page.evaluate((el, value) => {
          el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }, locatorOrElement, text);
      }
    }
  }

  /**
   * Get locator/element and wait for it to be visible
   * Unified waiting behavior for both engines
   * @param {Object} options - Configuration options
   * @param {string|Object} options.selector - CSS selector or existing locator/element
   * @param {number} options.timeout - Timeout in ms (default: TIMING.DEFAULT_TIMEOUT)
   * @returns {Promise<Object>} - Locator for Playwright (first match), Element for Puppeteer
   * @throws {Error} - If element not found or not visible within timeout
   */
  async function waitForLocatorOrElement(options = {}) {
    const { selector, timeout = TIMING.DEFAULT_TIMEOUT } = options;

    if (!selector) {
      throw new Error('selector is required in options');
    }

    if (engine === 'playwright') {
      const locator = await getLocatorOrElement({ selector });
      // Use .first() to handle multiple matches (Playwright strict mode)
      const firstLocator = locator.first();
      await firstLocator.waitFor({ state: 'visible', timeout });
      return firstLocator;
    } else {
      // Puppeteer: wait for selector to be visible (returns first match by default)
      await page.waitForSelector(selector, { visible: true, timeout });
      const element = await page.$(selector);
      if (!element) {
        throw new Error(`Element not found after waiting: ${selector}`);
      }
      return element;
    }
  }

  /**
   * Wait for element to be visible (works with existing locatorOrElement)
   * @param {Object} options - Configuration options
   * @param {Object} options.locatorOrElement - Element or locator to wait for
   * @param {number} options.timeout - Timeout in ms (default: TIMING.DEFAULT_TIMEOUT)
   * @returns {Promise<void>}
   */
  async function waitForVisible(options = {}) {
    const { locatorOrElement, timeout = TIMING.DEFAULT_TIMEOUT } = options;

    if (!locatorOrElement) {
      throw new Error('locatorOrElement is required in options');
    }

    if (engine === 'playwright') {
      await locatorOrElement.waitFor({ state: 'visible', timeout });
    } else {
      // For Puppeteer, element is already fetched, just verify it exists
      if (!locatorOrElement) {
        throw new Error('Element not found');
      }
    }
  }

  /**
   * Click an element
   * @param {Object} options - Configuration options
   * @param {Object} options.locatorOrElement - Element or locator to click
   * @returns {Promise<void>}
   */
  async function clickElement(options = {}) {
    const { locatorOrElement } = options;

    if (!locatorOrElement) {
      throw new Error('locatorOrElement is required in options');
    }

    await locatorOrElement.click();
  }

  /**
   * Get input value from element
   * @param {Object} options - Configuration options
   * @param {Object} options.locatorOrElement - Element or locator
   * @returns {Promise<string>}
   */
  async function getInputValue(options = {}) {
    const { locatorOrElement } = options;

    if (!locatorOrElement) {
      throw new Error('locatorOrElement is required in options');
    }

    if (engine === 'playwright') {
      return await locatorOrElement.inputValue();
    } else {
      return await page.evaluate(el => el.value, locatorOrElement);
    }
  }

  /**
   * Log element information for verbose debugging
   * @param {Object} options - Configuration options
   * @param {Object} options.locatorOrElement - Element or locator to log
   * @returns {Promise<void>}
   */
  async function logElementInfo(options = {}) {
    const { locatorOrElement } = options;

    if (!locatorOrElement) {
      return;
    }

    if (engine === 'playwright') {
      const tagName = await locatorOrElement.evaluate(el => el.tagName);
      const text = await locatorOrElement.textContent();
      log.debug(() => `🔍 [VERBOSE] About to scroll to ${tagName}: "${text?.trim().substring(0, 30)}..."`);
    } else {
      const tagName = await page.evaluate(el => el.tagName, locatorOrElement);
      const text = await page.evaluate(el => el.textContent?.trim().substring(0, 30), locatorOrElement);
      log.debug(() => `🔍 [VERBOSE] About to scroll to ${tagName}: "${text}..."`);
    }
  }

  /**
   * Wait/sleep for a specified time with optional verbose logging
   * @param {Object} options - Configuration options
   * @param {number} options.ms - Milliseconds to wait
   * @param {string} options.reason - Reason for waiting (for verbose logging)
   * @returns {Promise<void>}
   */
  async function wait(options = {}) {
    const { ms, reason } = options;

    if (!ms) {
      throw new Error('ms is required in options');
    }

    if (reason) {
      log.debug(() => `🔍 [VERBOSE] Waiting ${ms}ms: ${reason}`);
    }

    await new Promise(r => setTimeout(r, ms));

    if (reason) {
      log.debug(() => `🔍 [VERBOSE] Wait complete (${ms}ms)`);
    }
  }

  /**
   * Evaluate JavaScript in page context
   * @param {Object} options - Configuration options
   * @param {Function} options.fn - Function to evaluate
   * @param {Array} options.args - Arguments to pass to function (default: [])
   * @returns {Promise<any>} - Result of evaluation
   */
  async function evaluate(options = {}) {
    const { fn, args = [] } = options;

    if (!fn) {
      throw new Error('fn is required in options');
    }

    if (engine === 'playwright') {
      // Playwright only accepts a single argument (can be an array/object)
      if (args.length === 0) {
        return await page.evaluate(fn);
      } else if (args.length === 1) {
        return await page.evaluate(fn, args[0]);
      } else {
        // Multiple args - pass as array
        return await page.evaluate(fn, args);
      }
    } else {
      // Puppeteer accepts spread arguments
      return await page.evaluate(fn, ...args);
    }
  }

  /**
   * Scroll element into view (low-level, does not check if scroll is needed)
   * @param {Object} options - Configuration options
   * @param {Object} options.locatorOrElement - Playwright locator or Puppeteer element
   * @param {string} options.behavior - 'smooth' or 'instant' (default: 'smooth')
   */
  async function scrollIntoView(options = {}) {
    const { locatorOrElement, behavior = 'smooth' } = options;

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
   * @param {Object} options.locatorOrElement - Playwright locator or Puppeteer element
   * @param {number} options.threshold - Percentage of viewport height to consider "significant" (default: 10)
   * @returns {Promise<boolean>} - True if scroll is needed
   */
  async function needsScrolling(options = {}) {
    const { locatorOrElement, threshold = 10 } = options;

    if (!locatorOrElement) {
      throw new Error('locatorOrElement is required in options');
    }

    if (engine === 'playwright') {
      return await locatorOrElement.evaluate((el, thresholdPercent) => {
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
      }, threshold);
    } else {
      return await page.evaluate((el, thresholdPercent) => {
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
      }, locatorOrElement, threshold);
    }
  }

  /**
   * Scroll element into view only if needed (>threshold% from center)
   * Automatically waits for scroll animation if scroll was performed
   * @param {Object} options - Configuration options
   * @param {Object} options.locatorOrElement - Playwright locator or Puppeteer element
   * @param {string} options.behavior - 'smooth' or 'instant' (default: 'smooth')
   * @param {number} options.threshold - Percentage of viewport height to consider "significant" (default: 10)
   * @param {number} options.waitAfterScroll - Wait time after scroll in ms (default: TIMING.SCROLL_ANIMATION_WAIT for smooth, 0 for instant)
   * @returns {Promise<boolean>} - True if scroll was performed, false if skipped
   */
  async function scrollIntoViewIfNeeded(options = {}) {
    const {
      locatorOrElement,
      behavior = 'smooth',
      threshold = 10,
      waitAfterScroll = behavior === 'smooth' ? TIMING.SCROLL_ANIMATION_WAIT : 0
    } = options;

    if (!locatorOrElement) {
      throw new Error('locatorOrElement is required in options');
    }

    // Check if scrolling is needed
    const needsScroll = await needsScrolling({ locatorOrElement, threshold });

    if (!needsScroll) {
      log.debug(() => `🔍 [VERBOSE] Element already in view (within ${threshold}% threshold), skipping scroll`);
      return false;
    }

    // Perform scroll
    log.debug(() => `🔍 [VERBOSE] Scrolling with behavior: ${behavior}`);
    await scrollIntoView({ locatorOrElement, behavior });

    // Wait for scroll animation if specified
    if (waitAfterScroll > 0) {
      await wait({ ms: waitAfterScroll, reason: `${behavior} scroll animation to complete` });
    }

    return true;
  }

  /**
   * Fill a textarea with text
   * @param {Object} options - Configuration options
   * @param {string|Object} options.selector - CSS selector or Playwright Locator
   * @param {string} options.text - Text to fill
   * @param {boolean} options.checkEmpty - Only fill if empty (default: true)
   * @param {boolean} options.scrollIntoView - Scroll into view (default: true)
   * @param {boolean} options.simulateTyping - Simulate typing vs direct fill (default: true)
   * @param {number} options.timeout - Timeout in ms (default: TIMING.DEFAULT_TIMEOUT)
   * @returns {Promise<boolean>} - True if filled, false if skipped (element already has content)
   * @throws {Error} - If selector or text is missing, or if operation fails
   */
  async function fillTextArea(options = {}) {
    const {
      selector,
      text,
      checkEmpty = true,
      scrollIntoView: shouldScroll = true,
      simulateTyping = true,
      timeout = TIMING.DEFAULT_TIMEOUT,
    } = options;

    if (!selector || !text) {
      throw new Error('fillTextArea: selector and text are required in options');
    }

    // Get locator/element and wait for it to be visible (unified for both engines)
    const locatorOrElement = await waitForLocatorOrElement({ selector, timeout });

    // Check if empty (if requested)
    if (checkEmpty) {
      const isEmpty = await checkIfElementEmpty({ locatorOrElement });
      if (!isEmpty) {
        const currentValue = await getInputValue({ locatorOrElement });
        log.debug(() => `🔍 [VERBOSE] Textarea already has content, skipping: "${currentValue.substring(0, 30)}..."`);
        return false;
      }
    }

    // Scroll into view (if requested and needed)
    if (shouldScroll) {
      await scrollIntoViewIfNeeded({ locatorOrElement, behavior: 'smooth' });
    }

    // Click the element
    await clickElement({ locatorOrElement });

    // Fill the text
    await performFill({ locatorOrElement, text, simulateTyping });
    log.debug(() => `🔍 [VERBOSE] Filled textarea with text: "${text.substring(0, 50)}..."`);

    return true;
  }

  /**
   * Click a button or element
   * @param {Object} options - Configuration options
   * @param {string|Object} options.selector - CSS selector, ElementHandle, or Playwright Locator
   * @param {boolean} options.scrollIntoView - Scroll into view (default: true)
   * @param {number} options.waitAfterScroll - Wait time after scroll in ms (default: TIMING.DEFAULT_WAIT_AFTER_SCROLL)
   * @param {boolean} options.smoothScroll - Use smooth scroll animation (default: true)
   * @param {number} options.timeout - Timeout in ms (default: TIMING.DEFAULT_TIMEOUT)
   * @returns {Promise<void>}
   * @throws {Error} - If selector is missing, element not found, or click operation fails
   */
  async function clickButton(options = {}) {
    const {
      selector,
      scrollIntoView: shouldScroll = true,
      waitAfterScroll = TIMING.DEFAULT_WAIT_AFTER_SCROLL,
      smoothScroll = true,
      timeout = TIMING.DEFAULT_TIMEOUT,
    } = options;

    if (!selector) {
      throw new Error('clickButton: selector is required in options');
    }

    // Get locator/element and wait for it to be visible (unified for both engines)
    const locatorOrElement = await waitForLocatorOrElement({ selector, timeout });

    // Log element info if verbose
    if (verbose) {
      await logElementInfo({ locatorOrElement });
    }

    // Scroll into view (if requested and needed)
    if (shouldScroll) {
      const behavior = smoothScroll ? 'smooth' : 'instant';
      await scrollIntoViewIfNeeded({ locatorOrElement, behavior, waitAfterScroll });
    }

    // Perform click
    log.debug(() => `🔍 [VERBOSE] About to click element`);
    await clickElement({ locatorOrElement });
    log.debug(() => `🔍 [VERBOSE] Click completed`);
  }

  /**
   * Wait for selector to appear
   * @param {Object} options - Configuration options
   * @param {string} options.selector - CSS selector
   * @param {boolean} options.visible - Wait for visibility (default: true)
   * @param {number} options.timeout - Timeout in ms (default: TIMING.DEFAULT_TIMEOUT)
   * @returns {Promise<void>}
   */
  async function waitForSelector(options = {}) {
    const { selector, visible = true, timeout = TIMING.DEFAULT_TIMEOUT } = options;

    if (!selector) {
      throw new Error('selector is required in options');
    }

    if (engine === 'playwright') {
      const locator = createPlaywrightLocator({ selector });
      await locator.waitFor({ state: visible ? 'visible' : 'attached', timeout });
    } else {
      await page.waitForSelector(selector, { visible, timeout });
    }
  }

  /**
   * Query single element
   * @param {Object} options - Configuration options
   * @param {string} options.selector - CSS selector
   * @returns {Promise<Object|null>} - Element handle or null
   */
  async function querySelector(options = {}) {
    const { selector } = options;

    if (!selector) {
      throw new Error('selector is required in options');
    }

    if (engine === 'playwright') {
      const locator = createPlaywrightLocator({ selector }).first();
      const count = await locator.count();
      return count > 0 ? locator : null;
    } else {
      return await page.$(selector);
    }
  }

  /**
   * Query all elements
   * @param {Object} options - Configuration options
   * @param {string} options.selector - CSS selector
   * @returns {Promise<Array>} - Array of element handles
   */
  async function querySelectorAll(options = {}) {
    const { selector } = options;

    if (!selector) {
      throw new Error('selector is required in options');
    }

    if (engine === 'playwright') {
      const locator = createPlaywrightLocator({ selector });
      const count = await locator.count();
      const elements = [];
      for (let i = 0; i < count; i++) {
        elements.push(locator.nth(i));
      }
      return elements;
    } else {
      return await page.$$(selector);
    }
  }

  /**
   * Unfocus address bar to prevent it from being selected
   * Fixes the annoying issue where address bar is focused after browser launch/navigation
   * Uses page.bringToFront() as recommended by Puppeteer/Playwright communities
   * @param {Object} options - Configuration options
   * @param {Object} options.page - Browser page object (optional, uses closure if not provided)
   * @returns {Promise<void>}
   */
  async function unfocusAddressBar(options = {}) {
    const { page: pageArg } = options;

    // Use provided page or fall back to closure variable
    const targetPage = pageArg || page;

    if (!targetPage) {
      throw new Error('page is required in options or must be available in closure');
    }

    try {
      // Bring page to front - this removes focus from address bar
      await targetPage.bringToFront();
    } catch {
      // Ignore errors - this is just a UX improvement
    }
  }

  /**
   * Wait for URL to stabilize (no redirects happening)
   * @param {Object} options - Configuration options
   * @param {number} options.stableChecks - Number of consecutive stable checks required (default: 3)
   * @param {number} options.checkInterval - Interval between stability checks in ms (default: 1000)
   * @param {number} options.timeout - Maximum time to wait for stabilization in ms (default: 30000)
   * @param {string} options.reason - Reason for stabilization (for logging)
   * @returns {Promise<boolean>} - True if stabilized, false if timeout
   */
  async function waitForUrlStabilization(options = {}) {
    const {
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
   * @param {string} options.url - URL to navigate to
   * @param {string} options.waitUntil - Wait until condition (default: 'domcontentloaded')
   * @param {boolean} options.waitForStableUrlBefore - Wait for URL to stabilize BEFORE navigation (default: true)
   * @param {boolean} options.waitForStableUrlAfter - Wait for URL to stabilize AFTER navigation (default: true)
   * @param {number} options.stableChecks - Number of consecutive stable checks required (default: 3)
   * @param {number} options.checkInterval - Interval between stability checks in ms (default: 1000)
   * @returns {Promise<void>}
   */
  async function goto(options = {}) {
    const {
      url,
      waitUntil = 'domcontentloaded',
      waitForStableUrlBefore = true,
      waitForStableUrlAfter = true,
      stableChecks = 3,
      checkInterval = 1000,
    } = options;

    if (!url) {
      throw new Error('url is required in options');
    }

    // Wait for URL to stabilize BEFORE navigation (to avoid interrupting natural redirects)
    if (waitForStableUrlBefore) {
      await waitForUrlStabilization({
        stableChecks,
        checkInterval,
        reason: 'before navigation',
      });
    }

    // Navigate to the URL
    await page.goto(url, { waitUntil });

    // Wait for URL to stabilize AFTER navigation (to ensure all redirects are complete)
    if (waitForStableUrlAfter) {
      await waitForUrlStabilization({
        stableChecks,
        checkInterval,
        reason: 'after navigation',
      });
    }
  }

  /**
   * Get current URL
   * @returns {string} - Current URL
   */
  function getUrl() {
    return page.url();
  }

  /**
   * Wait for navigation
   * @param {Object} options - Configuration options
   * @param {number} options.timeout - Timeout in ms
   * @returns {Promise<void>}
   */
  async function waitForNavigation(options = {}) {
    const { timeout } = options;
    await page.waitForNavigation(timeout ? { timeout } : undefined);
  }

  /**
   * Get element attribute
   * @param {Object} options - Configuration options
   * @param {string|Object} options.selector - CSS selector or element
   * @param {string} options.attribute - Attribute name
   * @returns {Promise<string|null>} - Attribute value or null
   */
  async function getAttribute(options = {}) {
    const { selector, attribute } = options;

    if (!selector || !attribute) {
      throw new Error('selector and attribute are required in options');
    }

    if (engine === 'playwright') {
      const locator = await getLocatorOrElement({ selector });
      return await locator.getAttribute(attribute);
    } else {
      const element = await getLocatorOrElement({ selector });
      if (!element) return null;
      return await page.evaluate((el, attr) => el.getAttribute(attr), element, attribute);
    }
  }

  /**
   * Check if element is visible
   * @param {Object} options - Configuration options
   * @param {string|Object} options.selector - CSS selector or element
   * @returns {Promise<boolean>} - True if visible
   */
  async function isVisible(options = {}) {
    const { selector } = options;

    if (!selector) {
      throw new Error('selector is required in options');
    }

    if (engine === 'playwright') {
      const locator = await getLocatorOrElement({ selector });
      try {
        await locator.waitFor({ state: 'visible', timeout: TIMING.VISIBILITY_CHECK_TIMEOUT });
        return true;
      } catch {
        return false;
      }
    } else {
      const element = await getLocatorOrElement({ selector });
      if (!element) return false;
      return await page.evaluate(el => el.offsetWidth > 0 && el.offsetHeight > 0, element);
    }
  }

  /**
   * Get element count
   * @param {Object} options - Configuration options
   * @param {string} options.selector - CSS selector
   * @returns {Promise<number>} - Number of matching elements
   */
  async function count(options = {}) {
    const { selector } = options;

    if (!selector) {
      throw new Error('selector is required in options');
    }

    if (engine === 'playwright') {
      return await createPlaywrightLocator({ selector }).count();
    } else {
      const elements = await page.$$(selector);
      return elements.length;
    }
  }

  /**
   * Get text content
   * @param {Object} options - Configuration options
   * @param {string|Object} options.selector - CSS selector or element
   * @returns {Promise<string|null>} - Text content or null
   */
  async function textContent(options = {}) {
    const { selector } = options;

    if (!selector) {
      throw new Error('selector is required in options');
    }

    if (engine === 'playwright') {
      const locator = await getLocatorOrElement({ selector });
      return await locator.textContent();
    } else {
      const element = await getLocatorOrElement({ selector });
      if (!element) return null;
      return await page.evaluate(el => el.textContent, element);
    }
  }

  /**
   * Get input value
   * @param {Object} options - Configuration options
   * @param {string|Object} options.selector - CSS selector or element
   * @returns {Promise<string>} - Input value
   */
  async function inputValue(options = {}) {
    const { selector } = options;

    if (!selector) {
      throw new Error('selector is required in options');
    }

    if (engine === 'playwright') {
      const locator = await getLocatorOrElement({ selector });
      return await locator.inputValue();
    } else {
      const element = await getLocatorOrElement({ selector });
      if (!element) return '';
      return await page.evaluate(el => el.value, element);
    }
  }

  /**
   * Create locator (Playwright-style fluent API)
   * @param {Object} options - Configuration options
   * @param {string} options.selector - CSS selector
   * @returns {Object} - Locator object (Playwright) or wrapper (Puppeteer)
   */
  function locator(options = {}) {
    const { selector } = options;

    if (!selector) {
      throw new Error('selector is required in options');
    }

    if (engine === 'playwright') {
      return createPlaywrightLocator({ selector });
    } else {
      // Return a wrapper that mimics Playwright locator API for Puppeteer
      const createLocatorWrapper = (sel) => ({
        selector: sel,
        async count() {
          const elements = await page.$$(sel);
          return elements.length;
        },
        async click(options = {}) {
          await page.click(sel, options);
        },
        async fill(text) {
          await page.$eval(sel, (el, value) => {
            el.value = value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }, text);
        },
        async type(text, options = {}) {
          await page.type(sel, text, options);
        },
        async textContent() {
          const element = await page.$(sel);
          if (!element) return null;
          return await page.evaluate(el => el.textContent, element);
        },
        async inputValue() {
          const element = await page.$(sel);
          if (!element) return '';
          return await page.evaluate(el => el.value, element);
        },
        async getAttribute(name) {
          const element = await page.$(sel);
          if (!element) return null;
          return await page.evaluate((el, attr) => el.getAttribute(attr), element, name);
        },
        async isVisible() {
          const element = await page.$(sel);
          if (!element) return false;
          return await page.evaluate(el => el.offsetWidth > 0 && el.offsetHeight > 0, element);
        },
        async waitFor(options = {}) {
          const { state = 'visible', timeout = TIMING.DEFAULT_TIMEOUT } = options;
          const visible = state === 'visible';
          await page.waitForSelector(sel, { visible, timeout });
        },
        nth(index) {
          return createLocatorWrapper(`${sel}:nth-of-type(${index + 1})`);
        },
        first() {
          return createLocatorWrapper(`${sel}:nth-of-type(1)`);
        },
        last() {
          return createLocatorWrapper(`${sel}:last-of-type`);
        },
        async evaluate(fn, arg) {
          const element = await page.$(sel);
          if (!element) throw new Error(`Element not found: ${sel}`);
          return await page.evaluate(fn, element, arg);
        },
      });

      return createLocatorWrapper(selector);
    }
  }

  /**
   * Find elements by text content (works across both engines)
   * @param {Object} options - Configuration options
   * @param {string} options.text - Text to search for
   * @param {string} options.selector - Optional base selector (e.g., 'button', 'a', 'span')
   * @param {boolean} options.exact - Exact match vs contains (default: false)
   * @returns {Promise<string>} - CSS selector that can be used with other commander methods
   */
  async function findByText(options = {}) {
    const { text, selector = '*', exact = false } = options;

    if (!text) {
      throw new Error('text is required in options');
    }

    if (engine === 'playwright') {
      // Playwright supports :has-text() natively
      const textSelector = exact ? `:text-is("${text}")` : `:has-text("${text}")`;
      return `${selector}${textSelector}`;
    } else {
      // For Puppeteer, we need to use XPath or evaluate
      // Return a special selector marker that will be handled by other methods
      return {
        _isPuppeteerTextSelector: true,
        baseSelector: selector,
        text,
        exact,
      };
    }
  }

  /**
   * Normalize selector to handle Puppeteer text selectors
   * @param {Object} options - Configuration options
   * @param {string|Object} options.selector - CSS selector or text selector object
   * @returns {Promise<string|null>} - CSS selector or null if not found
   */
  async function normalizeSelector(options = {}) {
    const { selector } = options;

    if (!selector) {
      throw new Error('selector is required in options');
    }

    if (typeof selector === 'string') {
      return selector;
    }

    if (selector._isPuppeteerTextSelector) {
      // Find element by text and generate a unique selector
      const result = await page.evaluate((baseSelector, text, exact) => {
        const elements = Array.from(document.querySelectorAll(baseSelector));
        const matchingElement = elements.find(el => {
          const elementText = el.textContent.trim();
          return exact ? elementText === text : elementText.includes(text);
        });

        if (!matchingElement) {
          return null;
        }

        // Generate a unique selector using data-qa or nth-of-type
        const dataQa = matchingElement.getAttribute('data-qa');
        if (dataQa) {
          return `[data-qa="${dataQa}"]`;
        }

        // Use nth-of-type as fallback
        const tagName = matchingElement.tagName.toLowerCase();
        const siblings = Array.from(matchingElement.parentElement.children).filter(
          el => el.tagName.toLowerCase() === tagName
        );
        const index = siblings.indexOf(matchingElement);
        return `${tagName}:nth-of-type(${index + 1})`;
      }, selector.baseSelector, selector.text, selector.exact);

      return result;
    }

    return selector;
  }

  /**
   * Enhanced wrapper for functions that need to handle text selectors
   * @param {Function} fn - The function to wrap
   * @returns {Function} - Wrapped function
   */
  function withTextSelectorSupport(fn) {
    return async (options = {}) => {
      let { selector } = options;

      // Normalize Puppeteer text selectors
      if (engine === 'puppeteer' && typeof selector === 'object' && selector._isPuppeteerTextSelector) {
        selector = await normalizeSelector({ selector });
        if (!selector) {
          throw new Error('Element with specified text not found');
        }
      }

      return fn({ ...options, selector });
    };
  }

  /**
   * Enhanced count that handles text selectors
   */
  async function countEnhanced(options = {}) {
    let { selector } = options;

    if (!selector) {
      throw new Error('selector is required in options');
    }

    if (engine === 'puppeteer' && typeof selector === 'object' && selector._isPuppeteerTextSelector) {
      const result = await page.evaluate((baseSelector, text, exact) => {
        const elements = Array.from(document.querySelectorAll(baseSelector));
        return elements.filter(el => {
          const elementText = el.textContent.trim();
          return exact ? elementText === text : elementText.includes(text);
        }).length;
      }, selector.baseSelector, selector.text, selector.exact);
      return result;
    }

    return count(options);
  }

  /**
   * Check if element is enabled (not disabled, not loading)
   * @param {Object} options - Configuration options
   * @param {string|Object} options.selector - CSS selector or locator
   * @returns {Promise<boolean>} - True if enabled
   */
  async function isEnabled(options = {}) {
    const { selector } = options;

    if (!selector) {
      throw new Error('selector is required in options');
    }

    try {
      if (engine === 'playwright') {
        // For Playwright, use locator API
        const locator = typeof selector === 'string' ? page.locator(selector).first() : selector;
        return await locator.evaluate(el => {
          const isDisabled = el.hasAttribute('disabled') ||
                            el.getAttribute('aria-disabled') === 'true' ||
                            el.classList.contains('magritte-button_loading');
          return !isDisabled;
        });
      } else {
        // For Puppeteer
        const element = await getLocatorOrElement({ selector });
        if (!element) return false;
        return await page.evaluate(el => {
          const isDisabled = el.hasAttribute('disabled') ||
                            el.getAttribute('aria-disabled') === 'true' ||
                            el.classList.contains('magritte-button_loading');
          return !isDisabled;
        }, element);
      }
    } catch {
      return false;
    }
  }

  // ============================================================================
  // UNIVERSAL LOGIC - Pure Functions Following DRY Principles
  // ============================================================================

  /**
   * Wait indefinitely for a URL condition with custom check function
   * @param {Object} options - Configuration options
   * @param {Function} options.getUrl - Function to get current URL
   * @param {Function} options.wait - Wait function
   * @param {Function} options.evaluate - Evaluate function
   * @param {string} options.targetUrl - Target URL to wait for
   * @param {string} options.description - Description for logging
   * @param {Function} options.customCheck - Optional custom check function (async)
   * @param {Function} options.pageClosedCallback - Callback to check if page closed
   * @param {number} options.pollingInterval - Polling interval in ms (default: 1000)
   * @returns {Promise<any>} - Result from customCheck or true if URL matched
   */
  async function waitForUrlCondition(options = {}) {
    const {
      getUrl,
      wait,
      evaluate,
      targetUrl,
      description,
      customCheck,
      pageClosedCallback = () => false,
      pollingInterval = 1000,
    } = options;

    if (description) {
      console.log(`⏳ ${description}...`);
    }

    while (true) {
      if (pageClosedCallback()) {
        return null;
      }

      try {
        // Run custom check if provided
        if (customCheck) {
          const customResult = await customCheck(getUrl());
          if (customResult !== undefined && customResult !== null) {
            return customResult;
          }
        }

        // Check if target URL reached
        const currentUrl = getUrl();
        if (currentUrl.startsWith(targetUrl)) {
          return true;
        }
      } catch (error) {
        if (pageClosedCallback()) {
          return null;
        }

        const isDetachedFrameError = error.message && error.message.includes('detached Frame');
        if (!isDetachedFrameError) {
          console.log(`⚠️  Temporary error while checking URL: ${error.message.substring(0, 100)}... (retrying)`);
        }
      }

      await wait({ ms: pollingInterval, reason: 'polling interval before next URL check' });
    }
  }

  /**
   * Install click detection listener on page
   * @param {Object} options - Configuration options
   * @param {Function} options.evaluate - Evaluate function
   * @param {string} options.buttonText - Text to detect
   * @param {string} options.storageKey - SessionStorage key to set
   */
  async function installClickListener(options = {}) {
    const { evaluate, buttonText, storageKey } = options;

    await evaluate({
      fn: (text, key) => {
        document.addEventListener('click', (event) => {
          let element = event.target;
          while (element && element !== document.body) {
            const elementText = element.textContent?.trim() || '';
            if (elementText === text ||
                (element.tagName === 'A' || element.tagName === 'BUTTON') && elementText.includes(text)) {
              console.log(`[Click Listener] Detected click on ${text} button!`);
              window.sessionStorage.setItem(key, 'true');
              break;
            }
            element = element.parentElement;
          }
        }, true);
      },
      args: [buttonText, storageKey],
    });
  }

  /**
   * Check and clear session storage flag
   * @param {Object} options - Configuration options
   * @param {Function} options.evaluate - Evaluate function
   * @param {string} options.storageKey - SessionStorage key
   * @returns {Promise<boolean>} - True if flag was set
   */
  async function checkAndClearFlag(options = {}) {
    const { evaluate, storageKey } = options;

    return await evaluate({
      fn: (key) => {
        const flag = window.sessionStorage.getItem(key);
        if (flag === 'true') {
          window.sessionStorage.removeItem(key);
          return true;
        }
        return false;
      },
      args: [storageKey],
    });
  }

  /**
   * Find toggle button using multiple strategies
   * @param {Object} options - Configuration options
   * @param {Function} options.count - Count function
   * @param {Function} options.findByText - FindByText function
   * @param {Array<string>} options.dataQaSelectors - Data-qa selectors to try
   * @param {string} options.textToFind - Text to search for
   * @param {Array<string>} options.elementTypes - Element types to search
   * @returns {Promise<string|null>} - Selector or null
   */
  async function findToggleButton(options = {}) {
    const {
      count,
      findByText,
      dataQaSelectors = [],
      textToFind,
      elementTypes = ['button', 'a', 'span'],
    } = options;

    // Try data-qa selectors first
    for (const sel of dataQaSelectors) {
      const elemCount = await count({ selector: sel });
      if (elemCount > 0) {
        return sel;
      }
    }

    // Fallback to text search
    if (textToFind) {
      for (const elementType of elementTypes) {
        const selector = await findByText({
          text: textToFind,
          selector: elementType,
        });
        const elemCount = await count({ selector });
        if (elemCount > 0) {
          return selector;
        }
      }
    }

    return null;
  }

  return {
    // Core properties
    engine,
    page,
    log, // Expose log instance for direct use

    // Helper functions (now public)
    createPlaywrightLocator,
    getLocatorOrElement,
    waitForLocatorOrElement,
    scrollIntoView,
    scrollIntoViewIfNeeded,
    needsScrolling,
    checkIfElementEmpty,
    performFill,
    logElementInfo,
    normalizeSelector,
    withTextSelectorSupport,
    waitForVisible,
    clickElement,
    getInputValue,
    unfocusAddressBar,

    // Main API functions
    wait,
    fillTextArea: withTextSelectorSupport(fillTextArea),
    clickButton: withTextSelectorSupport(clickButton),
    evaluate,
    waitForSelector,
    querySelector,
    querySelectorAll,
    waitForUrlStabilization,
    goto,
    getUrl,
    waitForNavigation,
    getAttribute: withTextSelectorSupport(getAttribute),
    isVisible: withTextSelectorSupport(isVisible),
    isEnabled: withTextSelectorSupport(isEnabled),
    count: countEnhanced,
    textContent: withTextSelectorSupport(textContent),
    inputValue: withTextSelectorSupport(inputValue),
    locator,
    findByText,

    // Universal High-Level Functions (DRY Principle)
    waitForUrlCondition,
    installClickListener,
    checkAndClearFlag,
    findToggleButton,
  };
}
