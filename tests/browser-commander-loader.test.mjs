/**
 * Tests for browser-commander-loader module
 * Verifies that the loader correctly returns the external browser-commander package
 *
 * Issue #146: Removed internal browser-commander, now exclusively using external package
 */
import { describe, test, assert } from 'test-anywhere';
import { loadBrowserCommander, getBrowserCommander } from '../src/browser-commander-loader.mjs';

describe('Browser Commander Loader', () => {
  test('loadBrowserCommander returns external implementation', () => {
    const commander = loadBrowserCommander();

    assert.ok(commander, 'Should return commander module');
    assert.equal(commander._source, 'external', 'Should be external source');
    assert.ok(typeof commander.makeBrowserCommander === 'function', 'Should have makeBrowserCommander');
    assert.ok(typeof commander.launchBrowser === 'function', 'Should have launchBrowser');
    assert.ok(typeof commander.isNavigationError === 'function', 'Should have isNavigationError');
    assert.ok(typeof commander.isTimeoutError === 'function', 'Should have isTimeoutError');
  });

  test('getBrowserCommander returns external implementation', () => {
    const commander = getBrowserCommander();

    assert.ok(commander, 'Should return commander module');
    assert.equal(commander._source, 'external', 'Should be external source');
    assert.ok(typeof commander.makeBrowserCommander === 'function', 'Should have makeBrowserCommander');
    assert.ok(typeof commander.launchBrowser === 'function', 'Should have launchBrowser');
    assert.ok(typeof commander.isNavigationError === 'function', 'Should have isNavigationError');
    assert.ok(typeof commander.isTimeoutError === 'function', 'Should have isTimeoutError');
  });

  test('Browser commander has all required exports', () => {
    const commander = loadBrowserCommander();

    // Check that it has all the core exports
    const coreExports = [
      'makeBrowserCommander',
      'launchBrowser',
      'isNavigationError',
      'isTimeoutError',
      'makeUrlCondition',
      'allConditions',
      'anyCondition',
      'notCondition',
      'detectEngine',
      'CHROME_ARGS',
      'TIMING',
    ];

    coreExports.forEach(exportName => {
      assert.ok(
        commander[exportName] !== undefined,
        `Should have ${exportName}`,
      );
    });
  });

  test('isTimeoutError works correctly', () => {
    const { isTimeoutError } = loadBrowserCommander();

    // Test timeout error detection
    const timeoutError = new Error('Waiting for selector failed');
    timeoutError.name = 'TimeoutError';
    assert.equal(isTimeoutError(timeoutError), true, 'Should detect TimeoutError');

    const regularError = new Error('Something went wrong');
    assert.equal(isTimeoutError(regularError), false, 'Should not detect regular error');

    assert.equal(isTimeoutError(null), false, 'Should handle null');
    assert.equal(isTimeoutError(undefined), false, 'Should handle undefined');
  });

  test('isNavigationError works correctly', () => {
    const { isNavigationError } = loadBrowserCommander();

    const testCases = [
      { error: new Error('Execution context was destroyed'), expected: true },
      { error: new Error('Frame was detached'), expected: true },
      { error: new Error('Target closed'), expected: true },
      { error: new Error('Regular error'), expected: false },
      { error: null, expected: false },
    ];

    testCases.forEach(({ error, expected }) => {
      const result = isNavigationError(error);
      assert.equal(result, expected,
        `isNavigationError should return ${expected} for: ${error?.message || 'null'}`);
    });
  });

  test('TIMING constants are available', () => {
    const { TIMING } = loadBrowserCommander();

    assert.ok(typeof TIMING.DEFAULT_TIMEOUT === 'number', 'Should have DEFAULT_TIMEOUT');
    assert.ok(typeof TIMING.SCROLL_ANIMATION_WAIT === 'number', 'Should have SCROLL_ANIMATION_WAIT');
    assert.ok(typeof TIMING.VERIFICATION_TIMEOUT === 'number', 'Should have VERIFICATION_TIMEOUT');
  });
});
