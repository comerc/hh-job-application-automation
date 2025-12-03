/**
 * Engine Adapter - Abstract away Playwright/Puppeteer differences
 *
 * This module implements the Adapter pattern to encapsulate engine-specific
 * logic in a single place, following the "Protected Variations" principle.
 *
 * Benefits:
 * - Eliminates scattered `if (engine === 'playwright')` checks
 * - Easier to add new engines (e.g., Selenium)
 * - Easier to test with mock adapters
 * - Clearer separation of concerns
 *
 * IMPORTANT: Global Typing Mutex (Issue #115 fix)
 * Puppeteer's page.keyboard.type() types to whatever element has focus.
 * If two operations run concurrently, they can steal focus from each other,
 * causing character interleaving and text corruption. The global typing mutex
 * ensures only one typing operation runs at a time, preventing this issue.
 */

import { TIMING } from './constants.js';
import { isVerboseEnabled } from './logger.js';

// ============================================================================
// Global Typing Mutex (Issue #115 fix)
// ============================================================================
// Puppeteer's page.keyboard.type() sends keystrokes to whatever element
// currently has focus. When multiple fill operations run concurrently:
//   1. Operation A focuses textarea A
//   2. Operation B focuses textarea B (steals focus!)
//   3. Operation A types → goes to textarea B instead!
//   4. Characters from both operations interleave
//
// This mutex ensures only ONE typing operation can occur at a time across
// all textareas, preventing the focus-stealing race condition.
// ============================================================================

let globalTypingLock = Promise.resolve(); // Start with resolved promise
let typingLockOwner = null; // For debugging: track who holds the lock
let lockAcquisitionCounter = 0; // For debugging: track lock acquisitions
let lockWaitCounter = 0; // For debugging: track how many operations are waiting

/**
 * Acquire the global typing lock
 * Waits if another operation is currently typing
 * @param {string} operationId - Identifier for debugging (e.g., selector)
 * @returns {Promise<Function>} Release function to call when done typing
 */
async function acquireTypingLock(operationId = 'unknown') {
  const acquisitionId = ++lockAcquisitionCounter;
  const startTime = Date.now();
  const verbose = isVerboseEnabled();

  if (verbose) {
    console.log(`🔒 [TYPING-LOCK-${acquisitionId}] Requesting lock for: ${operationId}`);
  }

  // Atomically chain onto the existing lock to prevent race conditions
  // This ensures operations are serialized in the order they arrive
  const currentLock = globalTypingLock;

  // Check if we need to wait
  const needsToWait = typingLockOwner !== null;
  if (needsToWait) {
    lockWaitCounter++;
    if (verbose) {
      console.log(`⏳ [TYPING-LOCK-${acquisitionId}] Waiting for lock (current owner: ${typingLockOwner}, waiting operations: ${lockWaitCounter})`);
    }
  }

  // Wait for the current lock to complete
  await currentLock;

  const waitTime = Date.now() - startTime;
  if (needsToWait) {
    lockWaitCounter--;
    if (verbose) {
      console.log(`✅ [TYPING-LOCK-${acquisitionId}] Lock acquired after ${waitTime}ms wait for: ${operationId}`);
    }
  } else {
    if (verbose) {
      console.log(`✅ [TYPING-LOCK-${acquisitionId}] Lock acquired immediately (no wait) for: ${operationId}`);
    }
  }

  // Create new lock for the next operation
  let releaseLock;
  globalTypingLock = new Promise(resolve => {
    releaseLock = () => {
      const lockDuration = Date.now() - (startTime + waitTime);
      if (verbose) {
        console.log(`🔓 [TYPING-LOCK-${acquisitionId}] Lock released after ${lockDuration}ms by: ${operationId}`);
      }
      typingLockOwner = null;
      resolve();
    };
  });
  typingLockOwner = operationId;

  return releaseLock;
}

/**
 * Base class defining the engine adapter interface
 * All engine-specific operations should be defined here
 */
export class EngineAdapter {
  constructor(page) {
    this.page = page;
  }

  /**
   * Get engine name
   * @returns {string} - 'playwright' or 'puppeteer'
   */
  getEngineName() {
    throw new Error('getEngineName() must be implemented by subclass');
  }

  // ============================================================================
  // Element Selection and Locators
  // ============================================================================

  /**
   * Create a locator/element handle from a selector
   * @param {string} selector - CSS selector
   * @returns {Object} - Locator (Playwright) or ElementHandle (Puppeteer)
   */
  createLocator(selector) {
    throw new Error('createLocator() must be implemented by subclass');
  }

  /**
   * Query single element
   * @param {string} selector - CSS selector
   * @returns {Promise<Object|null>} - Locator/Element or null
   */
  async querySelector(selector) {
    throw new Error('querySelector() must be implemented by subclass');
  }

  /**
   * Query all elements
   * @param {string} selector - CSS selector
   * @returns {Promise<Array>} - Array of locators/elements
   */
  async querySelectorAll(selector) {
    throw new Error('querySelectorAll() must be implemented by subclass');
  }

  /**
   * Wait for selector to appear
   * @param {string} selector - CSS selector
   * @param {Object} options - Wait options {visible, timeout}
   * @returns {Promise<void>}
   */
  async waitForSelector(selector, options = {}) {
    throw new Error('waitForSelector() must be implemented by subclass');
  }

  /**
   * Wait for element to be visible
   * @param {Object} locatorOrElement - Locator or element
   * @param {number} timeout - Timeout in ms
   * @returns {Promise<Object>} - The locator/element
   */
  async waitForVisible(locatorOrElement, timeout = TIMING.DEFAULT_TIMEOUT) {
    throw new Error('waitForVisible() must be implemented by subclass');
  }

  /**
   * Count matching elements
   * @param {string} selector - CSS selector
   * @returns {Promise<number>} - Number of matching elements
   */
  async count(selector) {
    throw new Error('count() must be implemented by subclass');
  }

  // ============================================================================
  // Element Evaluation and Properties
  // ============================================================================

  /**
   * Evaluate function on element
   * @param {Object} locatorOrElement - Locator or element
   * @param {Function} fn - Function to evaluate
   * @param {any} args - Arguments to pass (optional)
   * @returns {Promise<any>} - Result of evaluation
   */
  async evaluateOnElement(locatorOrElement, fn, args) {
    throw new Error('evaluateOnElement() must be implemented by subclass');
  }

  /**
   * Get element text content
   * @param {Object} locatorOrElement - Locator or element
   * @returns {Promise<string|null>} - Text content
   */
  async getTextContent(locatorOrElement) {
    throw new Error('getTextContent() must be implemented by subclass');
  }

  /**
   * Get input value
   * @param {Object} locatorOrElement - Locator or element
   * @returns {Promise<string>} - Input value
   */
  async getInputValue(locatorOrElement) {
    throw new Error('getInputValue() must be implemented by subclass');
  }

  /**
   * Get element attribute
   * @param {Object} locatorOrElement - Locator or element
   * @param {string} attribute - Attribute name
   * @returns {Promise<string|null>} - Attribute value
   */
  async getAttribute(locatorOrElement, attribute) {
    throw new Error('getAttribute() must be implemented by subclass');
  }

  // ============================================================================
  // Element Interactions
  // ============================================================================

  /**
   * Click element
   * @param {Object} locatorOrElement - Locator or element
   * @param {Object} options - Click options {force, etc.}
   * @returns {Promise<void>}
   */
  async click(locatorOrElement, options = {}) {
    throw new Error('click() must be implemented by subclass');
  }

  /**
   * Type text into element (simulates typing)
   * @param {Object} locatorOrElement - Locator or element
   * @param {string} text - Text to type
   * @returns {Promise<void>}
   */
  async type(locatorOrElement, text) {
    throw new Error('type() must be implemented by subclass');
  }

  /**
   * Fill element with text (direct value assignment)
   * @param {Object} locatorOrElement - Locator or element
   * @param {string} text - Text to fill
   * @returns {Promise<void>}
   */
  async fill(locatorOrElement, text) {
    throw new Error('fill() must be implemented by subclass');
  }

  /**
   * Focus element
   * @param {Object} locatorOrElement - Locator or element
   * @returns {Promise<void>}
   */
  async focus(locatorOrElement) {
    throw new Error('focus() must be implemented by subclass');
  }

  // ============================================================================
  // Page-level Operations
  // ============================================================================

  /**
   * Evaluate JavaScript in page context
   * @param {Function} fn - Function to evaluate
   * @param {Array} args - Arguments to pass
   * @returns {Promise<any>} - Result of evaluation
   */
  async evaluateOnPage(fn, args = []) {
    throw new Error('evaluateOnPage() must be implemented by subclass');
  }

  /**
   * Get the main frame
   * @returns {Object} - Main frame
   */
  getMainFrame() {
    throw new Error('getMainFrame() must be implemented by subclass');
  }
}

/**
 * Playwright adapter implementation
 */
export class PlaywrightAdapter extends EngineAdapter {
  getEngineName() {
    return 'playwright';
  }

  // ============================================================================
  // Element Selection and Locators
  // ============================================================================

  createLocator(selector) {
    // Handle :nth-of-type() pseudo-selectors which don't work in Playwright locators
    const nthOfTypeMatch = selector.match(/^(.+):nth-of-type\((\d+)\)$/);
    if (nthOfTypeMatch) {
      const baseSelector = nthOfTypeMatch[1];
      const index = parseInt(nthOfTypeMatch[2], 10) - 1; // Convert to 0-based
      return this.page.locator(baseSelector).nth(index);
    }
    return this.page.locator(selector);
  }

  async querySelector(selector) {
    const locator = this.createLocator(selector).first();
    const count = await locator.count();
    return count > 0 ? locator : null;
  }

  async querySelectorAll(selector) {
    const locator = this.createLocator(selector);
    const count = await locator.count();
    const elements = [];
    for (let i = 0; i < count; i++) {
      elements.push(locator.nth(i));
    }
    return elements;
  }

  async waitForSelector(selector, options = {}) {
    const { visible = true, timeout = 5000 } = options;
    const locator = this.createLocator(selector);
    await locator.waitFor({ state: visible ? 'visible' : 'attached', timeout });
  }

  async waitForVisible(locatorOrElement, timeout = TIMING.DEFAULT_TIMEOUT) {
    const firstLocator = locatorOrElement.first();
    await firstLocator.waitFor({ state: 'visible', timeout });
    return firstLocator;
  }

  async count(selector) {
    return await this.page.locator(selector).count();
  }

  // ============================================================================
  // Element Evaluation and Properties
  // ============================================================================

  async evaluateOnElement(locatorOrElement, fn, args) {
    // Playwright only accepts a single argument
    if (args === undefined) {
      return await locatorOrElement.evaluate(fn);
    }
    return await locatorOrElement.evaluate(fn, args);
  }

  async getTextContent(locatorOrElement) {
    return await locatorOrElement.textContent();
  }

  async getInputValue(locatorOrElement) {
    return await locatorOrElement.inputValue();
  }

  async getAttribute(locatorOrElement, attribute) {
    return await locatorOrElement.getAttribute(attribute);
  }

  // ============================================================================
  // Element Interactions
  // ============================================================================

  async click(locatorOrElement, options = {}) {
    await locatorOrElement.click(options);
  }

  async type(locatorOrElement, text) {
    await locatorOrElement.type(text);
  }

  async fill(locatorOrElement, text) {
    await locatorOrElement.fill(text);
  }

  async focus(locatorOrElement) {
    await locatorOrElement.focus();
  }

  // ============================================================================
  // Page-level Operations
  // ============================================================================

  async evaluateOnPage(fn, args = []) {
    // Playwright only accepts a single argument (can be array/object)
    if (args.length === 0) {
      return await this.page.evaluate(fn);
    } else if (args.length === 1) {
      return await this.page.evaluate(fn, args[0]);
    } else {
      // Multiple args - pass as array
      return await this.page.evaluate(fn, args);
    }
  }

  getMainFrame() {
    return this.page.mainFrame();
  }
}

/**
 * Puppeteer adapter implementation
 */
export class PuppeteerAdapter extends EngineAdapter {
  getEngineName() {
    return 'puppeteer';
  }

  // ============================================================================
  // Element Selection and Locators
  // ============================================================================

  createLocator(selector) {
    // Puppeteer doesn't have locators - just returns selector
    // The actual element will be queried when needed
    return selector;
  }

  async querySelector(selector) {
    return await this.page.$(selector);
  }

  async querySelectorAll(selector) {
    return await this.page.$$(selector);
  }

  async waitForSelector(selector, options = {}) {
    const { visible = true, timeout = 5000 } = options;
    await this.page.waitForSelector(selector, { visible, timeout });
  }

  async waitForVisible(locatorOrElement, timeout = TIMING.DEFAULT_TIMEOUT) {
    // For Puppeteer, locatorOrElement is already an ElementHandle
    // We can't wait on it directly, so we just return it
    // The caller should have already used waitForSelector
    return locatorOrElement;
  }

  async count(selector) {
    const elements = await this.page.$$(selector);
    return elements.length;
  }

  // ============================================================================
  // Element Evaluation and Properties
  // ============================================================================

  async evaluateOnElement(locatorOrElement, fn, args) {
    // Puppeteer accepts the element as first arg, then spread args
    if (args === undefined) {
      return await this.page.evaluate(fn, locatorOrElement);
    }
    return await this.page.evaluate(fn, locatorOrElement, args);
  }

  async getTextContent(locatorOrElement) {
    return await this.page.evaluate(el => el.textContent, locatorOrElement);
  }

  async getInputValue(locatorOrElement) {
    return await this.page.evaluate(el => el.value, locatorOrElement);
  }

  async getAttribute(locatorOrElement, attribute) {
    return await this.page.evaluate(
      (el, attr) => el.getAttribute(attr),
      locatorOrElement,
      attribute
    );
  }

  // ============================================================================
  // Element Interactions
  // ============================================================================

  async click(locatorOrElement, options = {}) {
    await locatorOrElement.click(options);
  }

  async type(locatorOrElement, text) {
    // CRITICAL: Acquire global typing lock before focus+type
    // This prevents race conditions where another operation steals focus
    // between our focus() and type() calls, causing character interleaving.
    // See Issue #115 for details on this bug.

    // Get element info for logging
    let elementInfo = 'unknown-element';
    try {
      const tagName = await this.page.evaluate(el => el.tagName, locatorOrElement);
      const dataQa = await this.page.evaluate(el => el.getAttribute('data-qa'), locatorOrElement);
      const id = await this.page.evaluate(el => el.id, locatorOrElement);
      const name = await this.page.evaluate(el => el.name, locatorOrElement);
      elementInfo = `${tagName}${dataQa ? `[data-qa="${dataQa}"]` : ''}${id ? `#${id}` : ''}${name ? `[name="${name}"]` : ''}`;
    } catch (e) {
      // If we can't get info, just use 'unknown'
    }

    const textPreview = text.length > 50 ? text.substring(0, 50) + '...' : text;
    const release = await acquireTypingLock(`puppeteer-type:${elementInfo}`);
    const verbose = isVerboseEnabled();

    try {
      if (verbose) {
        console.log(`⌨️  [TYPING] Starting focus+type for ${elementInfo}: "${textPreview}"`);
      }

      // Puppeteer requires focus before typing
      await locatorOrElement.focus();
      if (verbose) {
        console.log(`👁️  [TYPING] Focused ${elementInfo}, about to type ${text.length} characters`);
      }

      await this.page.keyboard.type(text);
      if (verbose) {
        console.log(`✍️  [TYPING] Completed typing ${text.length} characters to ${elementInfo}`);
      }
    } finally {
      release();
    }
  }

  async fill(locatorOrElement, text) {
    // Puppeteer doesn't have fill() - use evaluate to set value
    await this.page.evaluate((el, value) => {
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, locatorOrElement, text);
  }

  async focus(locatorOrElement) {
    await locatorOrElement.focus();
  }

  // ============================================================================
  // Page-level Operations
  // ============================================================================

  async evaluateOnPage(fn, args = []) {
    // Puppeteer accepts spread arguments
    return await this.page.evaluate(fn, ...args);
  }

  getMainFrame() {
    return this.page.mainFrame();
  }
}

/**
 * Factory function to create appropriate adapter
 * @param {Object} page - Playwright or Puppeteer page object
 * @param {string} engine - Engine type ('playwright' or 'puppeteer')
 * @returns {EngineAdapter} - Appropriate adapter instance
 */
export function createEngineAdapter(page, engine) {
  if (!page) {
    const errorDetails = {
      page: page,
      pageType: typeof page,
      engine: engine,
      stackTrace: new Error().stack,
    };
    throw new Error(`page is required in createEngineAdapter. Received: page=${page} (type: ${typeof page}), engine=${engine}. This may indicate that the page object was not properly passed through the function call chain. Stack trace: ${errorDetails.stackTrace}`);
  }

  if (engine === 'playwright') {
    return new PlaywrightAdapter(page);
  } else if (engine === 'puppeteer') {
    return new PuppeteerAdapter(page);
  } else {
    throw new Error(`Unsupported engine: ${engine}. Expected 'playwright' or 'puppeteer'`);
  }
}
