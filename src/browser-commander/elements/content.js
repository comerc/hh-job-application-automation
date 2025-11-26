import { isNavigationError } from '../core/navigation-safety.js';
import { getLocatorOrElement } from './locators.js';

/**
 * Get text content
 * @param {Object} options - Configuration options
 * @param {Object} options.page - Browser page object
 * @param {string} options.engine - Engine type ('playwright' or 'puppeteer')
 * @param {string|Object} options.selector - CSS selector or element
 * @returns {Promise<string|null>} - Text content or null
 */
export async function textContent(options = {}) {
  const { page, engine, selector } = options;

  if (!selector) {
    throw new Error('selector is required in options');
  }

  try {
    if (engine === 'playwright') {
      const locator = await getLocatorOrElement({ page, engine, selector });
      return await locator.textContent();
    } else {
      const element = await getLocatorOrElement({ page, engine, selector });
      if (!element) return null;
      return await page.evaluate(el => el.textContent, element);
    }
  } catch (error) {
    if (isNavigationError(error)) {
      console.log('⚠️  Navigation detected during textContent, returning null');
      return null;
    }
    throw error;
  }
}

/**
 * Get input value
 * @param {Object} options - Configuration options
 * @param {Object} options.page - Browser page object
 * @param {string} options.engine - Engine type ('playwright' or 'puppeteer')
 * @param {string|Object} options.selector - CSS selector or element
 * @returns {Promise<string>} - Input value
 */
export async function inputValue(options = {}) {
  const { page, engine, selector } = options;

  if (!selector) {
    throw new Error('selector is required in options');
  }

  try {
    if (engine === 'playwright') {
      const locator = await getLocatorOrElement({ page, engine, selector });
      return await locator.inputValue();
    } else {
      const element = await getLocatorOrElement({ page, engine, selector });
      if (!element) return '';
      return await page.evaluate(el => el.value, element);
    }
  } catch (error) {
    if (isNavigationError(error)) {
      console.log('⚠️  Navigation detected during inputValue, returning empty string');
      return '';
    }
    throw error;
  }
}

/**
 * Get element attribute
 * @param {Object} options - Configuration options
 * @param {Object} options.page - Browser page object
 * @param {string} options.engine - Engine type ('playwright' or 'puppeteer')
 * @param {string|Object} options.selector - CSS selector or element
 * @param {string} options.attribute - Attribute name
 * @returns {Promise<string|null>} - Attribute value or null
 */
export async function getAttribute(options = {}) {
  const { page, engine, selector, attribute } = options;

  if (!selector || !attribute) {
    throw new Error('selector and attribute are required in options');
  }

  try {
    if (engine === 'playwright') {
      const locator = await getLocatorOrElement({ page, engine, selector });
      return await locator.getAttribute(attribute);
    } else {
      const element = await getLocatorOrElement({ page, engine, selector });
      if (!element) return null;
      return await page.evaluate((el, attr) => el.getAttribute(attr), element, attribute);
    }
  } catch (error) {
    if (isNavigationError(error)) {
      console.log('⚠️  Navigation detected during getAttribute, returning null');
      return null;
    }
    throw error;
  }
}

/**
 * Get input value from element (helper)
 * @param {Object} options - Configuration options
 * @param {Object} options.page - Browser page object
 * @param {string} options.engine - Engine type ('playwright' or 'puppeteer')
 * @param {Object} options.locatorOrElement - Element or locator
 * @returns {Promise<string>}
 */
export async function getInputValue(options = {}) {
  const { page, engine, locatorOrElement } = options;

  if (!locatorOrElement) {
    throw new Error('locatorOrElement is required in options');
  }

  try {
    if (engine === 'playwright') {
      return await locatorOrElement.inputValue();
    } else {
      return await page.evaluate(el => el.value, locatorOrElement);
    }
  } catch (error) {
    if (isNavigationError(error)) {
      console.log('⚠️  Navigation detected during getInputValue, returning empty string');
      return '';
    }
    throw error;
  }
}

/**
 * Log element information for verbose debugging
 * @param {Object} options - Configuration options
 * @param {Object} options.page - Browser page object
 * @param {string} options.engine - Engine type ('playwright' or 'puppeteer')
 * @param {Function} options.log - Logger instance
 * @param {Object} options.locatorOrElement - Element or locator to log
 * @returns {Promise<void>}
 */
export async function logElementInfo(options = {}) {
  const { page, engine, log, locatorOrElement } = options;

  if (!locatorOrElement) {
    return;
  }

  try {
    if (engine === 'playwright') {
      const tagName = await locatorOrElement.evaluate(el => el.tagName);
      const text = await locatorOrElement.textContent();
      log.debug(() => `🔍 [VERBOSE] Target element: ${tagName}: "${text?.trim().substring(0, 30)}..."`);
    } else {
      const tagName = await page.evaluate(el => el.tagName, locatorOrElement);
      const text = await page.evaluate(el => el.textContent?.trim().substring(0, 30), locatorOrElement);
      log.debug(() => `🔍 [VERBOSE] Target element: ${tagName}: "${text}..."`);
    }
  } catch (error) {
    if (isNavigationError(error)) {
      log.debug(() => '⚠️  Navigation detected during logElementInfo, skipping');
      return;
    }
    throw error;
  }
}
