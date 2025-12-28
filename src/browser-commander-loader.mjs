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

    return {
      ...externalBrowserCommander,
      _source: 'external',
      _externalVersion: '0.3.0', // Track which version we're using
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
