/**
 * Tests for browser-commander-loader module
 * Verifies that the loader correctly switches between internal and external implementations
 *
 * Issue #144: Test smooth transition mechanism for browser-commander
 */
import { describe, test, assert } from 'test-anywhere';
import { loadBrowserCommander, getBrowserCommander } from '../src/browser-commander-loader.mjs';

describe('Browser Commander Loader', () => {
  test('loadBrowserCommander returns internal implementation by default', () => {
    const commander = loadBrowserCommander(false);

    assert.ok(commander, 'Should return commander module');
    assert.equal(commander._source, 'internal', 'Should be internal source');
    assert.ok(typeof commander.makeBrowserCommander === 'function', 'Should have makeBrowserCommander');
    assert.ok(typeof commander.launchBrowser === 'function', 'Should have launchBrowser');
    assert.ok(typeof commander.isNavigationError === 'function', 'Should have isNavigationError');
    assert.ok(typeof commander.isTimeoutError === 'function', 'Should have isTimeoutError');
  });

  test('loadBrowserCommander returns external implementation when requested', () => {
    const commander = loadBrowserCommander(true);

    assert.ok(commander, 'Should return commander module');
    assert.equal(commander._source, 'external', 'Should be external source');
    assert.ok(commander._externalVersion, 'Should have external version');
    assert.ok(typeof commander.makeBrowserCommander === 'function', 'Should have makeBrowserCommander');
    assert.ok(typeof commander.launchBrowser === 'function', 'Should have launchBrowser');
    assert.ok(typeof commander.isNavigationError === 'function', 'Should have isNavigationError');
    assert.ok(typeof commander.isTimeoutError === 'function', 'Should have isTimeoutError');
  });

  test('getBrowserCommander with useExternal: false returns internal', () => {
    const commander = getBrowserCommander({ useExternal: false });

    assert.equal(commander._source, 'internal', 'Should be internal source');
  });

  test('getBrowserCommander with useExternal: true returns external', () => {
    const commander = getBrowserCommander({ useExternal: true });

    assert.equal(commander._source, 'external', 'Should be external source');
  });

  test('Both implementations export compatible APIs', () => {
    const internal = loadBrowserCommander(false);
    const external = loadBrowserCommander(true);

    // Check that both have the core exports
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
        internal[exportName] !== undefined,
        `Internal should have ${exportName}`,
      );
      assert.ok(
        external[exportName] !== undefined,
        `External should have ${exportName}`,
      );
    });
  });

  test('isTimeoutError works correctly for external', () => {
    const external = loadBrowserCommander(true);
    const { isTimeoutError } = external;

    // Test timeout error detection (using native implementation from v0.3.0+)
    const timeoutError = new Error('Waiting for selector failed');
    timeoutError.name = 'TimeoutError';
    assert.equal(isTimeoutError(timeoutError), true, 'Should detect TimeoutError');

    const regularError = new Error('Something went wrong');
    assert.equal(isTimeoutError(regularError), false, 'Should not detect regular error');

    assert.equal(isTimeoutError(null), false, 'Should handle null');
    assert.equal(isTimeoutError(undefined), false, 'Should handle undefined');
  });
});

describe('Browser Commander Loader - Internal vs External Parity', () => {
  test('Internal isNavigationError matches external behavior', () => {
    const internal = loadBrowserCommander(false);
    const external = loadBrowserCommander(true);

    const testCases = [
      { error: new Error('Execution context was destroyed'), expected: true },
      { error: new Error('Frame was detached'), expected: true },
      { error: new Error('Target closed'), expected: true },
      { error: new Error('Regular error'), expected: false },
      { error: null, expected: false },
    ];

    testCases.forEach(({ error, expected }) => {
      const internalResult = internal.isNavigationError(error);
      const externalResult = external.isNavigationError(error);
      assert.equal(internalResult, externalResult,
        `isNavigationError should match for: ${error?.message || 'null'}`);
      assert.equal(internalResult, expected,
        `isNavigationError should return ${expected} for: ${error?.message || 'null'}`);
    });
  });

  test('Internal isTimeoutError matches external behavior', () => {
    const internal = loadBrowserCommander(false);
    const external = loadBrowserCommander(true);

    const testCases = [
      { error: (() => { const e = new Error('Timeout waiting for selector'); e.name = 'TimeoutError'; return e; })(), expected: true },
      { error: new Error('Waiting for selector failed: timeout'), expected: true },
      { error: new Error('Timeout exceeded'), expected: true },
      { error: new Error('Regular error'), expected: false },
      { error: null, expected: false },
    ];

    testCases.forEach(({ error, expected }) => {
      const internalResult = internal.isTimeoutError(error);
      const externalResult = external.isTimeoutError(error);
      assert.equal(internalResult, externalResult,
        `isTimeoutError should match for: ${error?.message || 'null'}`);
      assert.equal(internalResult, expected,
        `isTimeoutError should return ${expected} for: ${error?.message || 'null'}`);
    });
  });

  test('Internal TIMING constants match external', () => {
    const internal = loadBrowserCommander(false);
    const external = loadBrowserCommander(true);

    assert.equal(
      internal.TIMING.DEFAULT_TIMEOUT,
      external.TIMING.DEFAULT_TIMEOUT,
      'DEFAULT_TIMEOUT should match',
    );
    assert.equal(
      internal.TIMING.SCROLL_ANIMATION_WAIT,
      external.TIMING.SCROLL_ANIMATION_WAIT,
      'SCROLL_ANIMATION_WAIT should match',
    );
    assert.equal(
      internal.TIMING.VERIFICATION_TIMEOUT,
      external.TIMING.VERIFICATION_TIMEOUT,
      'VERIFICATION_TIMEOUT should match',
    );
  });
});
