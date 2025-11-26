/**
 * Navigation safety utilities
 * Provides wrappers to handle "Execution context was destroyed" errors gracefully
 */

/**
 * Check if an error is a navigation-related error
 * @param {Error} error - The error to check
 * @returns {boolean} - True if this is a navigation error
 */
export function isNavigationError(error) {
  if (!error || !error.message) return false;

  const navigationErrorPatterns = [
    'Execution context was destroyed',
    'detached Frame',
    'Target closed',
    'Session closed',
    'Protocol error',
    'Target page, context or browser has been closed',
    'frame was detached',
    'Navigating frame was detached',
    'Cannot find context with specified id',
    'Attempted to use detached Frame',
    'Frame was detached',
    'context was destroyed',
    'Page crashed',
  ];

  return navigationErrorPatterns.some(pattern =>
    error.message.includes(pattern)
  );
}

/**
 * Safe wrapper for async operations that may fail during navigation
 * @param {Function} asyncFn - Async function to execute
 * @param {Object} options - Configuration options
 * @param {any} options.defaultValue - Value to return on navigation error (default: null)
 * @param {string} options.operationName - Name of operation for logging (default: 'operation')
 * @param {boolean} options.silent - Don't log warnings (default: false)
 * @param {Function} options.log - Logger function (optional)
 * @returns {Promise<{success: boolean, value: any, navigationError: boolean}>}
 */
export async function safeOperation(asyncFn, options = {}) {
  const {
    defaultValue = null,
    operationName = 'operation',
    silent = false,
    log = null,
  } = options;

  try {
    const value = await asyncFn();
    return { success: true, value, navigationError: false };
  } catch (error) {
    if (isNavigationError(error)) {
      if (!silent) {
        const message = `⚠️  Navigation detected during ${operationName}, recovering gracefully`;
        if (log && typeof log.debug === 'function') {
          log.debug(() => message);
        } else {
          console.log(message);
        }
      }
      return { success: false, value: defaultValue, navigationError: true };
    }
    // Re-throw non-navigation errors
    throw error;
  }
}

/**
 * Create a navigation-safe version of an async function
 * Returns the default value instead of throwing on navigation errors
 * @param {Function} asyncFn - Async function to wrap
 * @param {any} defaultValue - Value to return on navigation error
 * @param {string} operationName - Name for logging
 * @returns {Function} - Wrapped function
 */
export function makeNavigationSafe(asyncFn, defaultValue = null, operationName = 'operation') {
  return async (...args) => {
    const result = await safeOperation(() => asyncFn(...args), {
      defaultValue,
      operationName,
      silent: false,
    });
    return result.value;
  };
}

/**
 * Execute an async function with navigation safety, returning result directly
 * Logs warning on navigation error and returns default value
 * @param {Function} asyncFn - Async function to execute
 * @param {any} defaultValue - Value to return on navigation error
 * @param {string} operationName - Name for logging
 * @returns {Promise<any>} - Result or default value
 */
export async function withNavigationSafety(asyncFn, defaultValue = null, operationName = 'operation') {
  const result = await safeOperation(asyncFn, {
    defaultValue,
    operationName,
    silent: false,
  });
  return result.value;
}
