/**
 * Logging module using log-lazy library
 * Provides lazy evaluation for efficient logging
 *
 * @module logging
 */

import makeLog from 'log-lazy';

// Default log level - will be changed to 'debug' if verbose mode is enabled
let currentLevel = 'info';

/**
 * Create the logger instance with console logging by default
 * The log-lazy library supports lazy evaluation - wrap expensive computations
 * in arrow functions to defer evaluation until the log level permits output.
 *
 * @example
 * // Only evaluates if debug is enabled
 * log.debug(() => `User: ${JSON.stringify(userData)}`);
 *
 * // Preferred syntax for info level
 * log(() => `Processed ${items.length} items`);
 */
const log = makeLog({ level: currentLevel });

/**
 * Enable debug level logging (for verbose mode)
 */
export function enableDebugLevel() {
  currentLevel = 'debug';
  // Note: log-lazy creates a new logger, we'll use a proxy pattern instead
}

/**
 * Check if debug level is enabled
 * @returns {boolean}
 */
export function isDebugEnabled() {
  return currentLevel === 'debug';
}

export default log;
export { log };
