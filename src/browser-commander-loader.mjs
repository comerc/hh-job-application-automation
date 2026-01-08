/**
 * Browser Commander Loader
 *
 * This module provides a unified interface for loading browser-commander.
 * Since issue #146, it exclusively uses the external browser-commander npm package.
 *
 * @module browser-commander-loader
 */

// Import from external package
import * as externalBrowserCommander from 'browser-commander';

/**
 * Get browser-commander exports
 *
 * @returns {Object} - The browser-commander exports
 */
export function getBrowserCommander() {
  console.log('📦 Using external browser-commander package (npm)');

  return {
    ...externalBrowserCommander,
    _source: 'external',
  };
}

/**
 * Load browser-commander.
 * This is the recommended way to import browser-commander.
 *
 * @returns {Object} - The browser-commander module exports
 */
export function loadBrowserCommander() {
  return getBrowserCommander();
}

// Re-export external implementation for direct imports
export * from 'browser-commander';
