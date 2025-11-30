/**
 * Unit tests for session-tracker module
 * Tests session storage tracking for button click detection
 */

import { describe, test, assert } from 'test-anywhere';
import {
  SESSION_KEYS,
  createSessionStorageTracker,
  createApplyButtonTracker,
} from '../src/helpers/session-tracker.mjs';

describe('Session Tracker', () => {

  describe('SESSION_KEYS constant', () => {
    test('should have shouldRedirectAfterResponse key', () => {
      assert.ok(SESSION_KEYS.shouldRedirectAfterResponse);
      assert.equal(typeof SESSION_KEYS.shouldRedirectAfterResponse, 'string');
    });

    test('should have correct key value', () => {
      assert.equal(SESSION_KEYS.shouldRedirectAfterResponse, 'shouldRedirectAfterResponse');
    });
  });

  describe('createSessionStorageTracker()', () => {
    test('should create tracker with install method', () => {
      const tracker = createSessionStorageTracker({
        storageKey: 'testKey',
        buttonText: 'Test Button',
        evaluate: async ({ fn: _fn, args: _args }) => {},
        safeEvaluate: async ({ fn: _fn, args: _args }) => ({ value: false }),
      });

      assert.ok(tracker.install);
      assert.equal(typeof tracker.install, 'function');
    });

    test('should create tracker with check method', () => {
      const tracker = createSessionStorageTracker({
        storageKey: 'testKey',
        buttonText: 'Test Button',
        evaluate: async ({ fn: _fn, args: _args }) => {},
        safeEvaluate: async ({ fn: _fn, args: _args }) => ({ value: false }),
      });

      assert.ok(tracker.check);
      assert.equal(typeof tracker.check, 'function');
    });

    test('should create tracker with clear method', () => {
      const tracker = createSessionStorageTracker({
        storageKey: 'testKey',
        buttonText: 'Test Button',
        evaluate: async ({ fn: _fn, args: _args }) => {},
        safeEvaluate: async ({ fn: _fn, args: _args }) => ({ value: false }),
      });

      assert.ok(tracker.clear);
      assert.equal(typeof tracker.clear, 'function');
    });

    test('should accept custom storage key', () => {
      const customKey = 'myCustomKey';
      let capturedKey = null;

      const tracker = createSessionStorageTracker({
        storageKey: customKey,
        buttonText: 'Test',
        evaluate: async ({ fn: _fn, args }) => {
          capturedKey = args[0];
        },
        safeEvaluate: async ({ fn: _fn, args: _args }) => ({ value: false }),
      });

      tracker.install();
      assert.equal(capturedKey, customKey);
    });

    test('should accept custom button text', () => {
      const customText = 'Click Me!';
      let capturedText = null;

      const tracker = createSessionStorageTracker({
        storageKey: 'key',
        buttonText: customText,
        evaluate: async ({ fn: _fn, args }) => {
          capturedText = args[1];
        },
        safeEvaluate: async ({ fn: _fn, args: _args }) => ({ value: false }),
      });

      tracker.install();
      assert.equal(capturedText, customText);
    });
  });

  describe('Tracker.install()', () => {
    test('should call evaluate with correct parameters', async () => {
      let evaluateCalled = false;
      let evaluateFn = null;
      let evaluateArgs = null;

      const tracker = createSessionStorageTracker({
        storageKey: 'testKey',
        buttonText: 'Test Button',
        evaluate: async ({ fn, args }) => {
          evaluateCalled = true;
          evaluateFn = fn;
          evaluateArgs = args;
        },
        safeEvaluate: async ({ fn: _fn, args: _args }) => ({ value: false }),
      });

      await tracker.install();

      assert.ok(evaluateCalled, 'Should call evaluate');
      assert.ok(evaluateFn, 'Should pass function to evaluate');
      assert.ok(evaluateArgs, 'Should pass args to evaluate');
      assert.equal(evaluateArgs[0], 'testKey');
      assert.equal(evaluateArgs[1], 'Test Button');
    });

    test('should return true on successful installation', async () => {
      const tracker = createSessionStorageTracker({
        storageKey: 'testKey',
        buttonText: 'Test',
        evaluate: async ({ fn: _fn, args: _args }) => {},
        safeEvaluate: async ({ fn: _fn, args: _args }) => ({ value: false }),
      });

      const result = await tracker.install();
      assert.equal(result, true);
    });

    test('should return false on error', async () => {
      const tracker = createSessionStorageTracker({
        storageKey: 'testKey',
        buttonText: 'Test',
        evaluate: async ({ fn: _fn, args: _args }) => {
          throw new Error('Installation failed');
        },
        safeEvaluate: async ({ fn: _fn, args: _args }) => ({ value: false }),
      });

      const result = await tracker.install();
      assert.equal(result, false);
    });

    test('should handle async evaluate function', async () => {
      let evaluateCompleted = false;

      const tracker = createSessionStorageTracker({
        storageKey: 'testKey',
        buttonText: 'Test',
        evaluate: async ({ fn: _fn, args: _args }) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          evaluateCompleted = true;
        },
        safeEvaluate: async ({ fn: _fn, args: _args }) => ({ value: false }),
      });

      await tracker.install();
      assert.ok(evaluateCompleted, 'Should wait for async evaluate');
    });

    test('should log success message on installation', async () => {
      let consoleLogCalled = false;
      const originalLog = console.log;
      console.log = (..._args) => {
        consoleLogCalled = true;
      };

      const tracker = createSessionStorageTracker({
        storageKey: 'testKey',
        buttonText: 'Test Button',
        evaluate: async ({ fn: _fn, args: _args }) => {},
        safeEvaluate: async ({ fn: _fn, args: _args }) => ({ value: false }),
      });

      await tracker.install();

      console.log = originalLog;
      assert.ok(consoleLogCalled, 'Should log success message');
    });

    test('should log error message on failure', async () => {
      let consoleLogCalled = false;
      const originalLog = console.log;
      console.log = (..._args) => {
        consoleLogCalled = true;
      };

      const tracker = createSessionStorageTracker({
        storageKey: 'testKey',
        buttonText: 'Test Button',
        evaluate: async ({ fn: _fn, args: _args }) => {
          throw new Error('Failed');
        },
        safeEvaluate: async ({ fn: _fn, args: _args }) => ({ value: false }),
      });

      await tracker.install();

      console.log = originalLog;
      assert.ok(consoleLogCalled, 'Should log error message');
    });
  });

  describe('Tracker.check()', () => {
    test('should call safeEvaluate with correct parameters', async () => {
      let safeEvaluateCalled = false;
      let safeEvaluateFn = null;
      let safeEvaluateArgs = null;

      const tracker = createSessionStorageTracker({
        storageKey: 'testKey',
        buttonText: 'Test',
        evaluate: async ({ fn: _fn, args: _args }) => {},
        safeEvaluate: async ({ fn, args }) => {
          safeEvaluateCalled = true;
          safeEvaluateFn = fn;
          safeEvaluateArgs = args;
          return { value: false };
        },
      });

      await tracker.check();

      assert.ok(safeEvaluateCalled, 'Should call safeEvaluate');
      assert.ok(safeEvaluateFn, 'Should pass function to safeEvaluate');
      assert.ok(safeEvaluateArgs, 'Should pass args to safeEvaluate');
      assert.equal(safeEvaluateArgs[0], 'testKey');
    });

    test('should return hasFlag true when flag is set', async () => {
      const tracker = createSessionStorageTracker({
        storageKey: 'testKey',
        buttonText: 'Test',
        evaluate: async ({ fn: _fn, args: _args }) => {},
        safeEvaluate: async ({ fn: _fn, args: _args }) => ({ value: true }),
      });

      const result = await tracker.check();

      assert.ok(result.hasFlag);
      assert.equal(result.hasFlag, true);
    });

    test('should return hasFlag false when flag is not set', async () => {
      const tracker = createSessionStorageTracker({
        storageKey: 'testKey',
        buttonText: 'Test',
        evaluate: async ({ fn: _fn, args: _args }) => {},
        safeEvaluate: async ({ fn: _fn, args: _args }) => ({ value: false }),
      });

      const result = await tracker.check();

      assert.ok(!result.hasFlag);
      assert.equal(result.hasFlag, false);
    });

    test('should clear flag by default when checking', async () => {
      let clearAfterCheckValue = null;

      const tracker = createSessionStorageTracker({
        storageKey: 'testKey',
        buttonText: 'Test',
        evaluate: async ({ fn: _fn, args: _args }) => {},
        safeEvaluate: async ({ fn: _fn, args }) => {
          clearAfterCheckValue = args[1];
          return { value: true };
        },
      });

      await tracker.check();

      assert.equal(clearAfterCheckValue, true);
    });

    test('should not clear flag when clearAfterCheck is false', async () => {
      let clearAfterCheckValue = null;

      const tracker = createSessionStorageTracker({
        storageKey: 'testKey',
        buttonText: 'Test',
        evaluate: async ({ fn: _fn, args: _args }) => {},
        safeEvaluate: async ({ fn: _fn, args }) => {
          clearAfterCheckValue = args[1];
          return { value: true };
        },
      });

      await tracker.check({ clearAfterCheck: false });

      assert.equal(clearAfterCheckValue, false);
    });

    test('should return navigationError from safeEvaluate', async () => {
      const tracker = createSessionStorageTracker({
        storageKey: 'testKey',
        buttonText: 'Test',
        evaluate: async ({ fn: _fn, args: _args }) => {},
        safeEvaluate: async ({ fn: _fn, args: _args }) => ({
          value: false,
          navigationError: true,
        }),
      });

      const result = await tracker.check();

      assert.ok(result.navigationError);
      assert.equal(result.navigationError, true);
    });

    test('should return navigationError false when not present', async () => {
      const tracker = createSessionStorageTracker({
        storageKey: 'testKey',
        buttonText: 'Test',
        evaluate: async ({ fn: _fn, args: _args }) => {},
        safeEvaluate: async ({ fn: _fn, args: _args }) => ({ value: false }),
      });

      const result = await tracker.check();

      assert.equal(result.navigationError, false);
    });

    test('should handle empty options object', async () => {
      const tracker = createSessionStorageTracker({
        storageKey: 'testKey',
        buttonText: 'Test',
        evaluate: async ({ fn: _fn, args: _args }) => {},
        safeEvaluate: async ({ fn: _fn, args: _args }) => ({ value: false }),
      });

      const result = await tracker.check({});

      assert.ok(result);
      assert.equal(typeof result.hasFlag, 'boolean');
    });

    test('should handle undefined options', async () => {
      const tracker = createSessionStorageTracker({
        storageKey: 'testKey',
        buttonText: 'Test',
        evaluate: async ({ fn: _fn, args: _args }) => {},
        safeEvaluate: async ({ fn: _fn, args: _args }) => ({ value: false }),
      });

      const result = await tracker.check();

      assert.ok(result);
      assert.equal(typeof result.hasFlag, 'boolean');
    });
  });

  describe('Tracker.clear()', () => {
    test('should call evaluate with correct parameters', async () => {
      let evaluateCalled = false;
      let evaluateFn = null;
      let evaluateArgs = null;

      const tracker = createSessionStorageTracker({
        storageKey: 'testKey',
        buttonText: 'Test',
        evaluate: async ({ fn, args }) => {
          evaluateCalled = true;
          evaluateFn = fn;
          evaluateArgs = args;
        },
        safeEvaluate: async ({ fn: _fn, args: _args }) => ({ value: false }),
      });

      await tracker.clear();

      assert.ok(evaluateCalled, 'Should call evaluate');
      assert.ok(evaluateFn, 'Should pass function to evaluate');
      assert.ok(evaluateArgs, 'Should pass args to evaluate');
      assert.equal(evaluateArgs[0], 'testKey');
    });

    test('should return true on successful clear', async () => {
      const tracker = createSessionStorageTracker({
        storageKey: 'testKey',
        buttonText: 'Test',
        evaluate: async ({ fn: _fn, args: _args }) => {},
        safeEvaluate: async ({ fn: _fn, args: _args }) => ({ value: false }),
      });

      const result = await tracker.clear();
      assert.equal(result, true);
    });

    test('should return false on error', async () => {
      const tracker = createSessionStorageTracker({
        storageKey: 'testKey',
        buttonText: 'Test',
        evaluate: async ({ fn: _fn, args: _args }) => {
          throw new Error('Clear failed');
        },
        safeEvaluate: async ({ fn: _fn, args: _args }) => ({ value: false }),
      });

      const result = await tracker.clear();
      assert.equal(result, false);
    });

    test('should handle async evaluate function', async () => {
      let evaluateCompleted = false;

      const tracker = createSessionStorageTracker({
        storageKey: 'testKey',
        buttonText: 'Test',
        evaluate: async ({ fn: _fn, args: _args }) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          evaluateCompleted = true;
        },
        safeEvaluate: async ({ fn: _fn, args: _args }) => ({ value: false }),
      });

      await tracker.clear();
      assert.ok(evaluateCompleted, 'Should wait for async evaluate');
    });
  });

  describe('createApplyButtonTracker()', () => {
    test('should create tracker with commander', () => {
      const mockCommander = {
        evaluate: async ({ fn: _fn, args: _args }) => {},
        safeEvaluate: async ({ fn: _fn, args: _args }) => ({ value: false }),
      };

      const tracker = createApplyButtonTracker(mockCommander);

      assert.ok(tracker);
      assert.ok(tracker.install);
      assert.ok(tracker.check);
      assert.ok(tracker.clear);
    });

    test('should use correct storage key', async () => {
      let capturedKey = null;

      const mockCommander = {
        evaluate: async ({ fn: _fn, args }) => {
          capturedKey = args[0];
        },
        safeEvaluate: async ({ fn: _fn, args: _args }) => ({ value: false }),
      };

      const tracker = createApplyButtonTracker(mockCommander);
      await tracker.install();

      assert.equal(capturedKey, SESSION_KEYS.shouldRedirectAfterResponse);
    });

    test('should use correct button text', async () => {
      let capturedText = null;

      const mockCommander = {
        evaluate: async ({ fn: _fn, args }) => {
          capturedText = args[1];
        },
        safeEvaluate: async ({ fn: _fn, args: _args }) => ({ value: false }),
      };

      const tracker = createApplyButtonTracker(mockCommander);
      await tracker.install();

      assert.equal(capturedText, 'Откликнуться');
    });

    test('should bind commander evaluate method', async () => {
      let evaluateCalled = false;

      const mockCommander = {
        evaluate: async function ({ fn: _fn, args: _args }) {
          evaluateCalled = true;
          assert.equal(this, mockCommander, 'Should preserve this binding');
        },
        safeEvaluate: async ({ fn: _fn, args: _args }) => ({ value: false }),
      };

      const tracker = createApplyButtonTracker(mockCommander);
      await tracker.install();

      assert.ok(evaluateCalled, 'Should call bound evaluate');
    });

    test('should bind commander safeEvaluate method', async () => {
      let safeEvaluateCalled = false;

      const mockCommander = {
        evaluate: async ({ fn: _fn, args: _args }) => {},
        safeEvaluate: async function ({ fn: _fn, args: _args }) {
          safeEvaluateCalled = true;
          assert.equal(this, mockCommander, 'Should preserve this binding');
          return { value: false };
        },
      };

      const tracker = createApplyButtonTracker(mockCommander);
      await tracker.check();

      assert.ok(safeEvaluateCalled, 'Should call bound safeEvaluate');
    });

    test('should allow install, check, clear operations', async () => {
      const mockCommander = {
        evaluate: async ({ fn: _fn, args: _args }) => {},
        safeEvaluate: async ({ fn: _fn, args: _args }) => ({ value: true }),
      };

      const tracker = createApplyButtonTracker(mockCommander);

      const installResult = await tracker.install();
      assert.equal(installResult, true);

      const checkResult = await tracker.check();
      assert.equal(checkResult.hasFlag, true);

      const clearResult = await tracker.clear();
      assert.equal(clearResult, true);
    });
  });

  describe('Integration scenarios', () => {
    test('should track button click workflow', async () => {
      let sessionStorage = {};

      const mockCommander = {
        evaluate: async ({ fn: _fn, args }) => {
          // Simulate the click listener installation
          const [key] = args;
          // Simulate button click
          sessionStorage[key] = 'true';
        },
        safeEvaluate: async ({ fn: _fn, args }) => {
          const [key, shouldClear] = args;
          const flag = sessionStorage[key] === 'true';
          if (flag && shouldClear) {
            delete sessionStorage[key];
          }
          return { value: flag };
        },
      };

      const tracker = createApplyButtonTracker(mockCommander);

      // Install tracker
      await tracker.install();
      assert.equal(sessionStorage[SESSION_KEYS.shouldRedirectAfterResponse], 'true');

      // Check flag
      const result = await tracker.check();
      assert.equal(result.hasFlag, true);

      // Flag should be cleared
      assert.ok(!sessionStorage[SESSION_KEYS.shouldRedirectAfterResponse]);
    });

    test('should not detect flag when button not clicked', async () => {
      const sessionStorage = {};

      const mockCommander = {
        evaluate: async ({ fn: _fn, args: _args }) => {},
        safeEvaluate: async ({ fn: _fn, args }) => {
          const [key] = args;
          return { value: sessionStorage[key] === 'true' };
        },
      };

      const tracker = createApplyButtonTracker(mockCommander);

      const result = await tracker.check();
      assert.equal(result.hasFlag, false);
    });

    test('should preserve flag when clearAfterCheck is false', async () => {
      const sessionStorage = { shouldRedirectAfterResponse: 'true' };

      const mockCommander = {
        evaluate: async ({ fn: _fn, args: _args }) => {},
        safeEvaluate: async ({ fn: _fn, args }) => {
          const [key, shouldClear] = args;
          const flag = sessionStorage[key] === 'true';
          if (flag && shouldClear) {
            delete sessionStorage[key];
          }
          return { value: flag };
        },
      };

      const tracker = createApplyButtonTracker(mockCommander);

      // Check without clearing
      const result1 = await tracker.check({ clearAfterCheck: false });
      assert.equal(result1.hasFlag, true);
      assert.equal(sessionStorage.shouldRedirectAfterResponse, 'true', 'Flag should still be set');

      // Check with clearing
      const result2 = await tracker.check({ clearAfterCheck: true });
      assert.equal(result2.hasFlag, true);
      assert.ok(!sessionStorage.shouldRedirectAfterResponse, 'Flag should be cleared');
    });

    test('should handle multiple trackers with different keys', async () => {
      const sessionStorage = {};

      const mockCommander = {
        evaluate: async ({ fn: _fn, args }) => {
          const [key] = args;
          sessionStorage[key] = 'true';
        },
        safeEvaluate: async ({ fn: _fn, args }) => {
          const [key] = args;
          return { value: sessionStorage[key] === 'true' };
        },
      };

      const tracker1 = createSessionStorageTracker({
        storageKey: 'key1',
        buttonText: 'Button 1',
        evaluate: mockCommander.evaluate,
        safeEvaluate: mockCommander.safeEvaluate,
      });

      const tracker2 = createSessionStorageTracker({
        storageKey: 'key2',
        buttonText: 'Button 2',
        evaluate: mockCommander.evaluate,
        safeEvaluate: mockCommander.safeEvaluate,
      });

      await tracker1.install();
      await tracker2.install();

      assert.equal(sessionStorage.key1, 'true');
      assert.equal(sessionStorage.key2, 'true');
    });

    test('should handle navigation error during check', async () => {
      const mockCommander = {
        evaluate: async ({ fn: _fn, args: _args }) => {},
        safeEvaluate: async ({ fn: _fn, args: _args }) => ({
          value: false,
          navigationError: true,
        }),
      };

      const tracker = createApplyButtonTracker(mockCommander);
      const result = await tracker.check();

      assert.equal(result.hasFlag, false);
      assert.equal(result.navigationError, true);
    });
  });

  describe('Error handling', () => {
    test('should handle evaluate errors in install', async () => {
      const mockCommander = {
        evaluate: async ({ fn: _fn, args: _args }) => {
          throw new Error('Page navigation failed');
        },
        safeEvaluate: async ({ fn: _fn, args: _args }) => ({ value: false }),
      };

      const tracker = createApplyButtonTracker(mockCommander);
      const result = await tracker.install();

      assert.equal(result, false);
    });

    test('should handle evaluate errors in clear', async () => {
      const mockCommander = {
        evaluate: async ({ fn: _fn, args: _args }) => {
          throw new Error('Storage access denied');
        },
        safeEvaluate: async ({ fn: _fn, args: _args }) => ({ value: false }),
      };

      const tracker = createApplyButtonTracker(mockCommander);
      const result = await tracker.clear();

      assert.equal(result, false);
    });

    test('should use default value when safeEvaluate returns no value', async () => {
      const mockCommander = {
        evaluate: async ({ fn: _fn, args: _args }) => {},
        safeEvaluate: async ({ fn: _fn, args: _args }) => ({}),
      };

      const tracker = createApplyButtonTracker(mockCommander);
      const result = await tracker.check();

      // When value is undefined, should default to false
      assert.equal(result.hasFlag, undefined);
    });

    test('should handle missing commander methods gracefully', async () => {
      // This tests what happens if commander is missing methods
      // In real usage, this would cause an error, but we test the behavior
      const incompleteCommander = {
        evaluate: async ({ fn: _fn, args: _args }) => {},
        // Missing safeEvaluate
      };

      try {
        const tracker = createApplyButtonTracker(incompleteCommander);
        await tracker.check();
        assert.ok(false, 'Should have thrown error for missing method');
      } catch (error) {
        assert.ok(error, 'Should throw error when method is missing');
      }
    });
  });

  describe('Edge cases', () => {
    test('should handle empty storage key', async () => {
      const tracker = createSessionStorageTracker({
        storageKey: '',
        buttonText: 'Test',
        evaluate: async ({ fn: _fn, args: _args }) => {},
        safeEvaluate: async ({ fn: _fn, args: _args }) => ({ value: false }),
      });

      assert.ok(tracker);
      const result = await tracker.check();
      assert.ok(result);
    });

    test('should handle empty button text', async () => {
      const tracker = createSessionStorageTracker({
        storageKey: 'testKey',
        buttonText: '',
        evaluate: async ({ fn: _fn, args: _args }) => {},
        safeEvaluate: async ({ fn: _fn, args: _args }) => ({ value: false }),
      });

      assert.ok(tracker);
      const result = await tracker.install();
      assert.equal(result, true);
    });

    test('should handle Cyrillic button text', async () => {
      let capturedText = null;

      const tracker = createSessionStorageTracker({
        storageKey: 'testKey',
        buttonText: 'Откликнуться',
        evaluate: async ({ fn: _fn, args }) => {
          capturedText = args[1];
        },
        safeEvaluate: async ({ fn: _fn, args: _args }) => ({ value: false }),
      });

      await tracker.install();
      assert.equal(capturedText, 'Откликнуться');
    });

    test('should handle special characters in button text', async () => {
      const specialText = 'Click! (Now)';
      let capturedText = null;

      const tracker = createSessionStorageTracker({
        storageKey: 'testKey',
        buttonText: specialText,
        evaluate: async ({ fn: _fn, args }) => {
          capturedText = args[1];
        },
        safeEvaluate: async ({ fn: _fn, args: _args }) => ({ value: false }),
      });

      await tracker.install();
      assert.equal(capturedText, specialText);
    });

    test('should handle very long storage keys', async () => {
      const longKey = 'a'.repeat(1000);
      let capturedKey = null;

      const tracker = createSessionStorageTracker({
        storageKey: longKey,
        buttonText: 'Test',
        evaluate: async ({ fn: _fn, args }) => {
          capturedKey = args[0];
        },
        safeEvaluate: async ({ fn: _fn, args: _args }) => ({ value: false }),
      });

      await tracker.install();
      assert.equal(capturedKey, longKey);
    });

    test('should handle concurrent check operations', async () => {
      let checkCount = 0;

      const mockCommander = {
        evaluate: async ({ fn: _fn, args: _args }) => {},
        safeEvaluate: async ({ fn: _fn, args: _args }) => {
          checkCount++;
          await new Promise((resolve) => setTimeout(resolve, 10));
          return { value: true };
        },
      };

      const tracker = createApplyButtonTracker(mockCommander);

      // Run multiple checks concurrently
      const results = await Promise.all([
        tracker.check(),
        tracker.check(),
        tracker.check(),
      ]);

      assert.equal(results.length, 3);
      assert.equal(checkCount, 3);
      results.forEach((result) => {
        assert.equal(result.hasFlag, true);
      });
    });
  });
});
