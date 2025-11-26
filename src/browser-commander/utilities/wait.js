/**
 * Wait/sleep for a specified time with optional verbose logging
 * @param {Object} options - Configuration options
 * @param {Function} options.log - Logger instance
 * @param {number} options.ms - Milliseconds to wait
 * @param {string} options.reason - Reason for waiting (for verbose logging)
 * @returns {Promise<void>}
 */
export async function wait(options = {}) {
  const { log, ms, reason } = options;

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
 * @param {Object} options.page - Browser page object
 * @param {string} options.engine - Engine type ('playwright' or 'puppeteer')
 * @param {Function} options.fn - Function to evaluate
 * @param {Array} options.args - Arguments to pass to function (default: [])
 * @returns {Promise<any>} - Result of evaluation
 */
export async function evaluate(options = {}) {
  const { page, engine, fn, args = [] } = options;

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
