/**
 * Browser Commander Loader
 *
 * This module provides a unified interface for loading browser-commander,
 * supporting both the internal ./browser-commander implementation and the
 * external browser-commander npm package.
 *
 * The choice is determined by the --use-external-browser-commander flag.
 *
 * Issue #144: Smooth transition to external browser-commander package
 *
 * @module browser-commander-loader
 */

// Import from internal implementation
import * as internalBrowserCommander from './browser-commander/index.js';

// Import from external package
import * as externalBrowserCommander from 'browser-commander';

/**
 * Check if an error is a timeout error from selector waiting.
 * This function is provided as a fallback since it's not yet in the external package.
 * See: https://github.com/link-foundation/browser-commander/issues/9
 *
 * @param {Error} error - The error to check
 * @returns {boolean} - True if this is a timeout error
 */
function isTimeoutErrorFallback(error) {
  if (!error) return false;

  // Check error name first (most reliable)
  if (error.name === 'TimeoutError') return true;

  // Check error message patterns (case-insensitive)
  const message = (error.message || '').toLowerCase();
  const timeoutErrorPatterns = [
    'waiting for selector',
    'timeout',
    'timeouterror',
    'timeout exceeded',
    'timed out',
  ];

  return timeoutErrorPatterns.some(pattern =>
    message.includes(pattern),
  );
}

/**
 * Get browser-commander exports based on configuration
 *
 * @param {Object} options - Configuration options
 * @param {boolean} options.useExternal - If true, use external package; otherwise use internal
 * @returns {Object} - The browser-commander exports
 */
export function getBrowserCommander(options = {}) {
  const { useExternal = false } = options;

  if (useExternal) {
    console.log('📦 Using external browser-commander package (npm)');

    // Check if isTimeoutError is available in external package
    const hasIsTimeoutError = typeof externalBrowserCommander.isTimeoutError === 'function';

    return {
      ...externalBrowserCommander,
      // Provide fallback for isTimeoutError if not in external package
      // This will be removed once https://github.com/link-foundation/browser-commander/issues/9 is resolved
      isTimeoutError: hasIsTimeoutError
        ? externalBrowserCommander.isTimeoutError
        : isTimeoutErrorFallback,
      _source: 'external',
      _externalVersion: '0.2.1', // Track which version we're using
    };
  }

  console.log('📦 Using internal browser-commander (./src/browser-commander)');
  return {
    ...internalBrowserCommander,
    _source: 'internal',
  };
}

/**
 * Load browser-commander dynamically based on runtime configuration.
 * This is the recommended way to import browser-commander when the choice
 * needs to be made at runtime based on CLI arguments.
 *
 * @param {boolean} useExternal - If true, use external package
 * @returns {Object} - The browser-commander module exports
 */
export function loadBrowserCommander(useExternal) {
  return getBrowserCommander({ useExternal });
}

// Re-export internal implementation for direct imports (default behavior)
export * from './browser-commander/index.js';
