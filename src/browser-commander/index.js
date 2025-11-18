/**
 * Browser Commander - Universal browser automation library
 * Supports both Playwright and Puppeteer with a unified API
 * All functions use options objects for easy maintenance
 */

import path from 'path';
import os from 'os';
import fs from 'fs/promises';

/**
 * Disables Chrome translate feature by modifying the Preferences file
 * @param {string} userDataDir - Path to Chrome user data directory
 */
async function disableTranslateInPreferences(userDataDir) {
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
 * Detect which browser automation engine is being used
 * @param {Object} pageOrContext - Page or context object from Playwright or Puppeteer
 * @returns {string} - 'playwright' or 'puppeteer'
 */
function detectEngine(pageOrContext) {
  // Playwright pages have evaluate that returns a JSHandle, Puppeteer has different API
  // Check for Playwright-specific methods
  if (pageOrContext.locator) {
    return 'playwright';
  }
  // Check for Puppeteer-specific methods
  if (pageOrContext.$eval) {
    return 'puppeteer';
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
  await disableTranslateInPreferences(userDataDir);

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
      args: [
        '--disable-session-crashed-bubble',
        '--hide-crash-restore-bubble',
        '--disable-infobars',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-crash-restore',
      ],
      ignoreDefaultArgs: ['--enable-automation'],
    });
    page = browser.pages()[0];
  } else {
    const puppeteer = await import('puppeteer');
    browser = await puppeteer.default.launch({
      headless,
      defaultViewport: null,
      args: [
        '--start-maximized',
        '--disable-session-crashed-bubble',
        '--hide-crash-restore-bubble',
        '--disable-infobars',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-crash-restore',
      ],
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

    if (verbose && reason) {
      console.log(`🔍 [VERBOSE] Waiting ${ms}ms: ${reason}`);
    }

    await new Promise(r => setTimeout(r, ms));

    if (verbose && reason) {
      console.log(`🔍 [VERBOSE] Wait complete (${ms}ms)`);
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
   * @param {number} options.timeout - Timeout in ms (default: 5000)
   * @returns {Promise<boolean>} - True if filled, false if skipped
   */
  async function fillTextArea(options = {}) {
    const {
      selector,
      text,
      checkEmpty = true,
      scrollIntoView = true,
      simulateTyping = true,
      timeout = 5000,
    } = options;

    if (!selector || !text) {
      console.error('⚠️  fillTextArea: selector and text are required');
      return false;
    }

    try {
      if (engine === 'playwright') {
        // Playwright implementation
        const locator = typeof selector === 'string'
          ? page.locator(selector)
          : selector;

        await locator.waitFor({ state: 'visible', timeout });

        if (checkEmpty) {
          const currentValue = await locator.inputValue();
          if (currentValue && currentValue.trim() !== '') {
            if (verbose) {
              console.log(`🔍 [VERBOSE] Textarea already has content, skipping: "${currentValue.substring(0, 30)}..."`);
            }
            return false;
          }
        }

        if (scrollIntoView) {
          await locator.evaluate((el) => {
            el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
          });
          await wait({ ms: 300, reason: 'scroll animation to complete' });
        }

        await locator.click();

        if (simulateTyping) {
          await locator.type(text);
        } else {
          await locator.fill(text);
        }

        if (verbose) {
          console.log(`🔍 [VERBOSE] Filled textarea with text: "${text.substring(0, 50)}..."`);
        }

        return true;
      } else {
        // Puppeteer implementation
        await page.waitForSelector(selector, { visible: true, timeout });

        if (checkEmpty) {
          const currentValue = await page.$eval(selector, el => el.value);
          if (currentValue && currentValue.trim() !== '') {
            if (verbose) {
              console.log(`🔍 [VERBOSE] Textarea already has content, skipping: "${currentValue.substring(0, 30)}..."`);
            }
            return false;
          }
        }

        if (scrollIntoView) {
          await page.$eval(selector, (el) => {
            el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
          });
          await wait({ ms: 300, reason: 'scroll animation to complete' });
        }

        await page.click(selector);

        if (simulateTyping) {
          await page.type(selector, text);
        } else {
          await page.$eval(selector, (el, value) => {
            el.value = value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }, text);
        }

        if (verbose) {
          console.log(`🔍 [VERBOSE] Filled textarea with text: "${text.substring(0, 50)}..."`);
        }

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
   * @param {number} options.waitAfterScroll - Wait time after scroll in ms (default: 1000)
   * @param {boolean} options.smoothScroll - Use smooth scroll animation (default: true)
   * @param {number} options.timeout - Timeout in ms (default: 5000)
   * @returns {Promise<boolean>} - True if clicked, false if failed
   */
  async function clickButton(options = {}) {
    const {
      selector,
      scrollIntoView = true,
      waitAfterScroll = 1000,
      smoothScroll = true,
      timeout = 5000,
    } = options;

    if (!selector) {
      console.error('⚠️  clickButton: selector is required');
      return false;
    }

    try {
      if (engine === 'playwright') {
        // Playwright implementation
        const locator = typeof selector === 'string'
          ? page.locator(selector)
          : selector;

        await locator.waitFor({ state: 'visible', timeout });

        if (verbose) {
          const tagName = await locator.evaluate(el => el.tagName);
          const text = await locator.textContent();
          console.log(`🔍 [VERBOSE] About to scroll to ${tagName}: "${text?.trim().substring(0, 30)}..."`);
        }

        if (scrollIntoView) {
          const behavior = smoothScroll ? 'smooth' : 'instant';
          if (verbose) {
            console.log(`🔍 [VERBOSE] Scrolling with behavior: ${behavior}`);
          }

          await locator.evaluate((el, scrollBehavior) => {
            el.scrollIntoView({ behavior: scrollBehavior, block: 'center', inline: 'center' });
          }, behavior);

          // Wait for scroll animation to complete
          await wait({ ms: waitAfterScroll, reason: `${behavior} scroll animation to complete` });
        }

        if (verbose) {
          console.log('🔍 [VERBOSE] About to click element');
        }

        await locator.click();

        if (verbose) {
          console.log('🔍 [VERBOSE] Click completed');
        }

        return true;
      } else {
        // Puppeteer implementation
        const element = typeof selector === 'string'
          ? await page.$(selector)
          : selector;

        if (!element) {
          console.error(`⚠️  clickButton: Element not found for selector "${selector}"`);
          return false;
        }

        if (verbose) {
          const tagName = await page.evaluate(el => el.tagName, element);
          const text = await page.evaluate(el => el.textContent?.trim().substring(0, 30), element);
          console.log(`🔍 [VERBOSE] About to scroll to ${tagName}: "${text}..."`);
        }

        if (scrollIntoView) {
          const behavior = smoothScroll ? 'smooth' : 'instant';
          if (verbose) {
            console.log(`🔍 [VERBOSE] Scrolling with behavior: ${behavior}`);
          }

          await page.evaluate((el, scrollBehavior) => {
            el.scrollIntoView({ behavior: scrollBehavior, block: 'center', inline: 'center' });
          }, element, behavior);

          await wait({ ms: waitAfterScroll, reason: `${behavior} scroll animation to complete` });
        }

        if (verbose) {
          console.log('🔍 [VERBOSE] About to click element');
        }

        if (typeof selector === 'string') {
          await page.click(selector);
        } else {
          await element.click();
        }

        if (verbose) {
          console.log('🔍 [VERBOSE] Click completed');
        }

        return true;
      }
    } catch (error) {
      console.error('⚠️  Error in clickButton:', error.message);
      return false;
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

    return await page.evaluate(fn, ...args);
  }

  /**
   * Wait for selector to appear
   * @param {Object} options - Configuration options
   * @param {string} options.selector - CSS selector
   * @param {boolean} options.visible - Wait for visibility (default: true)
   * @param {number} options.timeout - Timeout in ms (default: 5000)
   * @returns {Promise<void>}
   */
  async function waitForSelector(options = {}) {
    const { selector, visible = true, timeout = 5000 } = options;

    if (!selector) {
      throw new Error('selector is required in options');
    }

    if (engine === 'playwright') {
      const locator = page.locator(selector);
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
      const locator = page.locator(selector).first();
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
      const locator = page.locator(selector);
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

    if (engine === 'playwright') {
      await page.goto(url, { waitUntil });
    } else {
      await page.goto(url, { waitUntil });
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

    if (engine === 'playwright') {
      await page.waitForNavigation(timeout ? { timeout } : undefined);
    } else {
      await page.waitForNavigation(timeout ? { timeout } : undefined);
    }
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
      const locator = typeof selector === 'string'
        ? page.locator(selector)
        : selector;
      return await locator.getAttribute(attribute);
    } else {
      if (typeof selector === 'string') {
        const element = await page.$(selector);
        if (!element) return null;
        return await page.evaluate((el, attr) => el.getAttribute(attr), element, attribute);
      } else {
        return await page.evaluate((el, attr) => el.getAttribute(attr), selector, attribute);
      }
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
      const locator = typeof selector === 'string'
        ? page.locator(selector)
        : selector;
      try {
        await locator.waitFor({ state: 'visible', timeout: 100 });
        return true;
      } catch {
        return false;
      }
    } else {
      if (typeof selector === 'string') {
        const element = await page.$(selector);
        if (!element) return false;
        return await page.evaluate(el => el.offsetWidth > 0 && el.offsetHeight > 0, element);
      } else {
        return await page.evaluate(el => el.offsetWidth > 0 && el.offsetHeight > 0, selector);
      }
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
      return await page.locator(selector).count();
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
      const locator = typeof selector === 'string'
        ? page.locator(selector)
        : selector;
      return await locator.textContent();
    } else {
      if (typeof selector === 'string') {
        const element = await page.$(selector);
        if (!element) return null;
        return await page.evaluate(el => el.textContent, element);
      } else {
        return await page.evaluate(el => el.textContent, selector);
      }
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
      const locator = typeof selector === 'string'
        ? page.locator(selector)
        : selector;
      return await locator.inputValue();
    } else {
      if (typeof selector === 'string') {
        return await page.$eval(selector, el => el.value);
      } else {
        return await page.evaluate(el => el.value, selector);
      }
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
      return page.locator(selector);
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

  return {
    engine,
    page,
    wait,
    fillTextArea,
    clickButton,
    evaluate,
    waitForSelector,
    querySelector,
    querySelectorAll,
    goto,
    getUrl,
    waitForNavigation,
    getAttribute,
    isVisible,
    count,
    textContent,
    inputValue,
    locator,
  };
}
