import { TIMING } from '../core/constants.js';
import { isNavigationError } from '../core/navigation-safety.js';
import { waitForLocatorOrElement } from '../elements/locators.js';
import { scrollIntoViewIfNeeded } from './scroll.js';
import { clickElement } from './click.js';
import { getInputValue } from '../elements/content.js';

/**
 * Check if an input element is empty
 * @param {Object} options - Configuration options
 * @param {Object} options.page - Browser page object
 * @param {string} options.engine - Engine type ('playwright' or 'puppeteer')
 * @param {Object} options.locatorOrElement - Element or locator to check
 * @returns {Promise<boolean>} - True if empty, false if has content (returns true on navigation)
 */
export async function checkIfElementEmpty(options = {}) {
  const { page, engine, locatorOrElement } = options;

  if (!locatorOrElement) {
    throw new Error('locatorOrElement is required in options');
  }

  try {
    if (engine === 'playwright') {
      const currentValue = await locatorOrElement.inputValue();
      return !currentValue || currentValue.trim() === '';
    } else {
      const currentValue = await page.evaluate(el => el.value, locatorOrElement);
      return !currentValue || currentValue.trim() === '';
    }
  } catch (error) {
    if (isNavigationError(error)) {
      console.log('⚠️  Navigation detected during checkIfElementEmpty, returning true');
      return true;
    }
    throw error;
  }
}

/**
 * Perform fill/type operation on an element (low-level)
 * @param {Object} options - Configuration options
 * @param {Object} options.page - Browser page object
 * @param {string} options.engine - Engine type ('playwright' or 'puppeteer')
 * @param {Object} options.locatorOrElement - Element or locator to fill
 * @param {string} options.text - Text to fill
 * @param {boolean} options.simulateTyping - Whether to simulate typing (default: true)
 * @returns {Promise<boolean>} - True if filled, false on navigation
 */
export async function performFill(options = {}) {
  const { page, engine, locatorOrElement, text, simulateTyping = true } = options;

  if (!text) {
    throw new Error('text is required in options');
  }

  if (!locatorOrElement) {
    throw new Error('locatorOrElement is required in options');
  }

  try {
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
    return true;
  } catch (error) {
    if (isNavigationError(error)) {
      console.log('⚠️  Navigation detected during performFill, recovering gracefully');
      return false;
    }
    throw error;
  }
}

/**
 * Fill a textarea with text (high-level with checks and scrolling)
 * @param {Object} options - Configuration options
 * @param {Object} options.page - Browser page object
 * @param {string} options.engine - Engine type ('playwright' or 'puppeteer')
 * @param {Function} options.wait - Wait function
 * @param {Function} options.log - Logger instance
 * @param {string|Object} options.selector - CSS selector or Playwright Locator
 * @param {string} options.text - Text to fill
 * @param {boolean} options.checkEmpty - Only fill if empty (default: true)
 * @param {boolean} options.scrollIntoView - Scroll into view (default: true)
 * @param {boolean} options.simulateTyping - Simulate typing vs direct fill (default: true)
 * @param {number} options.timeout - Timeout in ms (default: TIMING.DEFAULT_TIMEOUT)
 * @returns {Promise<boolean>} - True if filled, false if skipped (element already has content) or navigation occurred
 * @throws {Error} - If selector or text is missing, or if operation fails (except navigation)
 */
export async function fillTextArea(options = {}) {
  const {
    page,
    engine,
    wait,
    log,
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

  try {
    // Get locator/element and wait for it to be visible (unified for both engines)
    const locatorOrElement = await waitForLocatorOrElement({ page, engine, selector, timeout });

    // Check if empty (if requested)
    if (checkEmpty) {
      const isEmpty = await checkIfElementEmpty({ page, engine, locatorOrElement });
      if (!isEmpty) {
        const currentValue = await getInputValue({ page, engine, locatorOrElement });
        log.debug(() => `🔍 [VERBOSE] Textarea already has content, skipping: "${currentValue.substring(0, 30)}..."`);
        return false;
      }
    }

    // Scroll into view (if requested and needed)
    if (shouldScroll) {
      await scrollIntoViewIfNeeded({ page, engine, wait, log, locatorOrElement, behavior: 'smooth' });
    }

    // Click the element (prevent auto-scroll if scrollIntoView is disabled)
    const clicked = await clickElement({ engine, log, locatorOrElement, noAutoScroll: !shouldScroll });
    if (!clicked) {
      return false; // Navigation occurred
    }

    // Fill the text
    const filled = await performFill({ page, engine, locatorOrElement, text, simulateTyping });
    if (!filled) {
      return false; // Navigation occurred
    }
    log.debug(() => `🔍 [VERBOSE] Filled textarea with text: "${text.substring(0, 50)}..."`);

    return true;
  } catch (error) {
    if (isNavigationError(error)) {
      console.log('⚠️  Navigation detected during fillTextArea, recovering gracefully');
      return false;
    }
    throw error;
  }
}
