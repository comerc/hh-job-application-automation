/**
 * Browser Commander - Universal browser automation library
 * Supports both Playwright and Puppeteer with a unified API
 * All functions use options objects for easy maintenance
 */

import path from 'path';
import os from 'os';
import fs from 'fs/promises';

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

  /**
   * Log verbose message if verbose mode is enabled
   * @param {Object} options - Configuration options
   * @param {string} options.message - Message to log
   * @param {string} options.prefix - Prefix for the message (default: 'VERBOSE')
   */
  function logVerbose(options = {}) {
    const { message, prefix = 'VERBOSE' } = options;

    if (!message) {
      throw new Error('message is required in options');
    }

    if (verbose) {
      console.log(`🔍 [${prefix}] ${message}`);
    }
  }

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
   * Reduces code duplication across functions
   * @param {Object} options - Configuration options
   * @param {string|Object} options.selector - CSS selector or element/locator
   * @returns {Promise<Object|null>} - Locator for Playwright, Element for Puppeteer
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
      // For Puppeteer, return element
      return await page.$(selector);
    }
  }

  /**
   * Check if an input element is empty
   * @param {Object} options - Configuration options
   * @param {Object} options.locatorOrElement - Element or locator to check
   * @param {string} options.selector - CSS selector (for Puppeteer fallback)
   * @returns {Promise<boolean>} - True if empty, false if has content
   */
  async function checkIfElementEmpty(options = {}) {
    const { locatorOrElement, selector } = options;

    if (engine === 'playwright') {
      if (!locatorOrElement) {
        throw new Error('locatorOrElement is required for Playwright');
      }
      const currentValue = await locatorOrElement.inputValue();
      return !currentValue || currentValue.trim() === '';
    } else {
      if (!selector) {
        throw new Error('selector is required for Puppeteer');
      }
      const currentValue = await page.$eval(selector, el => el.value);
      return !currentValue || currentValue.trim() === '';
    }
  }

  /**
   * Perform fill/type operation on an element
   * @param {Object} options - Configuration options
   * @param {Object} options.locatorOrElement - Element or locator to fill
   * @param {string} options.selector - CSS selector (for Puppeteer)
   * @param {string} options.text - Text to fill
   * @param {boolean} options.simulateTyping - Whether to simulate typing (default: true)
   * @returns {Promise<void>}
   */
  async function performFill(options = {}) {
    const { locatorOrElement, selector, text, simulateTyping = true } = options;

    if (!text) {
      throw new Error('text is required in options');
    }

    if (engine === 'playwright') {
      if (!locatorOrElement) {
        throw new Error('locatorOrElement is required for Playwright');
      }
      if (simulateTyping) {
        await locatorOrElement.type(text);
      } else {
        await locatorOrElement.fill(text);
      }
    } else {
      if (!selector) {
        throw new Error('selector is required for Puppeteer');
      }
      if (simulateTyping) {
        await page.type(selector, text);
      } else {
        await page.$eval(selector, (el, value) => {
          el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }, text);
      }
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
      logVerbose({ message: `About to scroll to ${tagName}: "${text?.trim().substring(0, 30)}..."` });
    } else {
      const tagName = await page.evaluate(el => el.tagName, locatorOrElement);
      const text = await page.evaluate(el => el.textContent?.trim().substring(0, 30), locatorOrElement);
      logVerbose({ message: `About to scroll to ${tagName}: "${text}..."` });
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
      logVerbose({ message: `Waiting ${ms}ms: ${reason}` });
    }

    await new Promise(r => setTimeout(r, ms));

    if (reason) {
      logVerbose({ message: `Wait complete (${ms}ms)` });
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
   * Scroll element into view
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
   * Fill a textarea with text
   * @param {Object} options - Configuration options
   * @param {string|Object} options.selector - CSS selector or Playwright Locator
   * @param {string} options.text - Text to fill
   * @param {boolean} options.checkEmpty - Only fill if empty (default: true)
   * @param {boolean} options.scrollIntoView - Scroll into view (default: true)
   * @param {boolean} options.simulateTyping - Simulate typing vs direct fill (default: true)
   * @param {number} options.timeout - Timeout in ms (default: TIMING.DEFAULT_TIMEOUT)
   * @returns {Promise<boolean>} - True if filled, false if skipped
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
      console.error('⚠️  fillTextArea: selector and text are required');
      return false;
    }

    try {
      if (engine === 'playwright') {
        const locator = await getLocatorOrElement({ selector });
        await locator.waitFor({ state: 'visible', timeout });

        if (checkEmpty) {
          const isEmpty = await checkIfElementEmpty({ locatorOrElement: locator });
          if (!isEmpty) {
            const currentValue = await locator.inputValue();
            logVerbose({ message: `Textarea already has content, skipping: "${currentValue.substring(0, 30)}..."` });
            return false;
          }
        }

        if (shouldScroll) {
          await scrollIntoView({ locatorOrElement: locator, behavior: 'smooth' });
          await wait({ ms: TIMING.SCROLL_ANIMATION_WAIT, reason: 'scroll animation to complete' });
        }

        await locator.click();
        await performFill({ locatorOrElement: locator, text, simulateTyping });
        logVerbose({ message: `Filled textarea with text: "${text.substring(0, 50)}..."` });

        return true;
      } else {
        // Puppeteer implementation
        await page.waitForSelector(selector, { visible: true, timeout });

        if (checkEmpty) {
          const isEmpty = await checkIfElementEmpty({ selector });
          if (!isEmpty) {
            const currentValue = await page.$eval(selector, el => el.value);
            logVerbose({ message: `Textarea already has content, skipping: "${currentValue.substring(0, 30)}..."` });
            return false;
          }
        }

        const element = await page.$(selector);
        if (shouldScroll) {
          await scrollIntoView({ locatorOrElement: element, behavior: 'smooth' });
          await wait({ ms: TIMING.SCROLL_ANIMATION_WAIT, reason: 'scroll animation to complete' });
        }

        await page.click(selector);
        await performFill({ selector, text, simulateTyping });
        logVerbose({ message: `Filled textarea with text: "${text.substring(0, 50)}..."` });

        return true;
      }
    } catch (error) {
      console.error('⚠️  Error in fillTextArea:', error.message);
      return false;
    }
  }

  /**
   * Click a button or element
   * @param {Object} options - Configuration options
   * @param {string|Object} options.selector - CSS selector, ElementHandle, or Playwright Locator
   * @param {boolean} options.scrollIntoView - Scroll into view (default: true)
   * @param {number} options.waitAfterScroll - Wait time after scroll in ms (default: TIMING.DEFAULT_WAIT_AFTER_SCROLL)
   * @param {boolean} options.smoothScroll - Use smooth scroll animation (default: true)
   * @param {number} options.timeout - Timeout in ms (default: TIMING.DEFAULT_TIMEOUT)
   * @returns {Promise<boolean>} - True if clicked, false if failed
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
      console.error('⚠️  clickButton: selector is required');
      return false;
    }

    try {
      const locatorOrElement = await getLocatorOrElement({ selector });

      if (engine === 'playwright') {
        await locatorOrElement.waitFor({ state: 'visible', timeout });
      } else {
        // Puppeteer - check element exists
        if (!locatorOrElement) {
          console.error(`⚠️  clickButton: Element not found for selector "${selector}"`);
          return false;
        }
      }

      // Log element info if verbose
      if (verbose) {
        await logElementInfo({ locatorOrElement });
      }

      // Scroll if needed
      if (shouldScroll) {
        const behavior = smoothScroll ? 'smooth' : 'instant';
        logVerbose({ message: `Scrolling with behavior: ${behavior}` });
        await scrollIntoView({ locatorOrElement, behavior });
        await wait({ ms: waitAfterScroll, reason: `${behavior} scroll animation to complete` });
      }

      // Perform click
      logVerbose({ message: 'About to click element' });
      await locatorOrElement.click();
      logVerbose({ message: 'Click completed' });

      return true;
    } catch (error) {
      console.error('⚠️  Error in clickButton:', error.message);
      return false;
    }
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
   * Navigate to URL
   * @param {Object} options - Configuration options
   * @param {string} options.url - URL to navigate to
   * @param {string} options.waitUntil - Wait until condition (default: 'domcontentloaded')
   * @returns {Promise<void>}
   */
  async function goto(options = {}) {
    const { url, waitUntil = 'domcontentloaded' } = options;

    if (!url) {
      throw new Error('url is required in options');
    }

    await page.goto(url, { waitUntil });
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
      // Return a wrapper that mimics Playwright locator API
      return {
        selector,
        async count() {
          const elements = await page.$$(selector);
          return elements.length;
        },
        async click() {
          await page.click(selector);
        },
        async fill(text) {
          await page.type(selector, text);
        },
        async textContent() {
          const element = await page.$(selector);
          if (!element) return null;
          return await page.evaluate(el => el.textContent, element);
        },
        nth(index) {
          return {
            selector: `${selector}:nth-of-type(${index + 1})`,
          };
        },
      };
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
          // Return appropriate default based on function
          if (fn === clickButton) {
            console.error('⚠️  Element with text not found');
            return false;
          }
          return null;
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

  return {
    // Core properties
    engine,
    page,

    // Helper functions (now public)
    logVerbose,
    createPlaywrightLocator,
    getLocatorOrElement,
    scrollIntoView,
    checkIfElementEmpty,
    performFill,
    logElementInfo,
    normalizeSelector,
    withTextSelectorSupport,

    // Main API functions
    wait,
    fillTextArea,
    clickButton: withTextSelectorSupport(clickButton),
    evaluate,
    waitForSelector,
    querySelector,
    querySelectorAll,
    goto,
    getUrl,
    waitForNavigation,
    getAttribute: withTextSelectorSupport(getAttribute),
    isVisible,
    count: countEnhanced,
    textContent: withTextSelectorSupport(textContent),
    inputValue,
    locator,
    findByText,
  };
}
