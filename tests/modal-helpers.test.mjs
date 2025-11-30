/**
 * Unit tests for modal-helpers module
 * Tests modal detection, closing, and waiting functionality
 */

import { describe, test, assert } from 'test-anywhere';
import {
  closeModalIfPresent,
  isModalVisible,
  waitForModalToClose,
} from '../src/helpers/modal-helpers.mjs';

describe('Modal Helpers', () => {

  describe('closeModalIfPresent()', () => {
    test('should return false when no modal is present', async () => {
      const mockCommander = {
        count: async ({ selector: _selector }) => 0,
        clickButton: async ({ selector: _selector }) => {},
        wait: async ({ ms: _ms, reason: _reason }) => {},
      };

      const result = await closeModalIfPresent({
        commander: mockCommander,
      });

      assert.equal(result, false);
    });

    test('should return true and close modal when modal is present', async () => {
      let clickedSelector = null;
      let waitCalled = false;

      const mockCommander = {
        count: async ({ selector: _selector }) => 1,
        clickButton: async ({ selector }) => {
          clickedSelector = selector;
        },
        wait: async ({ ms: _ms, reason: _reason }) => {
          waitCalled = true;
        },
      };

      const result = await closeModalIfPresent({
        commander: mockCommander,
      });

      assert.equal(result, true);
      assert.ok(clickedSelector !== null, 'Should have clicked close button');
      assert.ok(waitCalled, 'Should have waited after closing');
    });

    test('should use custom close button selector when provided', async () => {
      let clickedSelector = null;
      const customSelector = '[data-qa="custom-close"]';

      const mockCommander = {
        count: async ({ selector: _selector }) => 1,
        clickButton: async ({ selector }) => {
          clickedSelector = selector;
        },
        wait: async ({ ms: _ms, reason: _reason }) => {},
      };

      await closeModalIfPresent({
        commander: mockCommander,
        closeButtonSelector: customSelector,
      });

      assert.equal(clickedSelector, customSelector);
    });

    test('should wait specified time after closing', async () => {
      let waitTime = null;

      const mockCommander = {
        count: async ({ selector: _selector }) => 1,
        clickButton: async ({ selector: _selector }) => {},
        wait: async ({ ms, reason: _reason }) => {
          waitTime = ms;
        },
      };

      await closeModalIfPresent({
        commander: mockCommander,
        waitAfterClose: 2000,
      });

      assert.equal(waitTime, 2000);
    });

    test('should use default wait time when not specified', async () => {
      let waitTime = null;

      const mockCommander = {
        count: async ({ selector: _selector }) => 1,
        clickButton: async ({ selector: _selector }) => {},
        wait: async ({ ms, reason: _reason }) => {
          waitTime = ms;
        },
      };

      await closeModalIfPresent({
        commander: mockCommander,
      });

      assert.equal(waitTime, 1000);
    });

    test('should return false on error', async () => {
      const mockCommander = {
        count: async ({ selector: _selector }) => {
          throw new Error('Network error');
        },
        clickButton: async ({ selector: _selector }) => {},
        wait: async ({ ms: _ms, reason: _reason }) => {},
      };

      const result = await closeModalIfPresent({
        commander: mockCommander,
      });

      assert.equal(result, false);
    });

    test('should handle click errors gracefully', async () => {
      const mockCommander = {
        count: async ({ selector: _selector }) => 1,
        clickButton: async ({ selector: _selector }) => {
          throw new Error('Click failed');
        },
        wait: async ({ ms: _ms, reason: _reason }) => {},
      };

      const result = await closeModalIfPresent({
        commander: mockCommander,
      });

      assert.equal(result, false);
    });

    test('should not log when verbose is false', async () => {
      let consoleLogCalled = false;
      const originalLog = console.log;
      console.log = (..._args) => {
        consoleLogCalled = true;
      };

      const mockCommander = {
        count: async ({ selector: _selector }) => 0,
        clickButton: async ({ selector: _selector }) => {},
        wait: async ({ ms: _ms, reason: _reason }) => {},
      };

      await closeModalIfPresent({
        commander: mockCommander,
        verbose: false,
      });

      console.log = originalLog;
      assert.equal(consoleLogCalled, false);
    });

    test('should log when verbose is true', async () => {
      let consoleLogCalled = false;
      const originalLog = console.log;
      console.log = (..._args) => {
        consoleLogCalled = true;
      };

      const mockCommander = {
        count: async ({ selector: _selector }) => 0,
        clickButton: async ({ selector: _selector }) => {},
        wait: async ({ ms: _ms, reason: _reason }) => {},
      };

      await closeModalIfPresent({
        commander: mockCommander,
        verbose: true,
      });

      console.log = originalLog;
      assert.ok(consoleLogCalled, 'Should have logged when verbose is true');
    });

    test('should handle multiple modals present', async () => {
      let clickedCount = 0;

      const mockCommander = {
        count: async ({ selector: _selector }) => 3,
        clickButton: async ({ selector: _selector }) => {
          clickedCount++;
        },
        wait: async ({ ms: _ms, reason: _reason }) => {},
      };

      const result = await closeModalIfPresent({
        commander: mockCommander,
      });

      assert.equal(result, true);
      assert.equal(clickedCount, 1, 'Should only click once even with multiple modals');
    });
  });

  describe('isModalVisible()', () => {
    test('should return true when modal overlay is present', async () => {
      const mockCommander = {
        count: async ({ selector: _selector }) => 1,
      };

      const result = await isModalVisible({
        commander: mockCommander,
      });

      assert.equal(result, true);
    });

    test('should return false when modal overlay is not present', async () => {
      const mockCommander = {
        count: async ({ selector: _selector }) => 0,
      };

      const result = await isModalVisible({
        commander: mockCommander,
      });

      assert.equal(result, false);
    });

    test('should return true when multiple modal overlays present', async () => {
      const mockCommander = {
        count: async ({ selector: _selector }) => 2,
      };

      const result = await isModalVisible({
        commander: mockCommander,
      });

      assert.equal(result, true);
    });

    test('should return false on error', async () => {
      const mockCommander = {
        count: async ({ selector: _selector }) => {
          throw new Error('Count failed');
        },
      };

      const result = await isModalVisible({
        commander: mockCommander,
      });

      assert.equal(result, false);
    });

    test('should not log when verbose is false', async () => {
      let consoleLogCalled = false;
      const originalLog = console.log;
      console.log = (..._args) => {
        consoleLogCalled = true;
      };

      const mockCommander = {
        count: async ({ selector: _selector }) => 0,
      };

      await isModalVisible({
        commander: mockCommander,
        verbose: false,
      });

      console.log = originalLog;
      assert.equal(consoleLogCalled, false);
    });

    test('should log when verbose is true', async () => {
      let consoleLogCalled = false;
      const originalLog = console.log;
      console.log = (..._args) => {
        consoleLogCalled = true;
      };

      const mockCommander = {
        count: async ({ selector: _selector }) => 1,
      };

      await isModalVisible({
        commander: mockCommander,
        verbose: true,
      });

      console.log = originalLog;
      assert.ok(consoleLogCalled, 'Should have logged when verbose is true');
    });
  });

  describe('waitForModalToClose()', () => {
    test('should return true immediately if modal is not visible', async () => {
      const mockCommander = {
        count: async ({ selector: _selector }) => 0,
        wait: async ({ ms: _ms, reason: _reason }) => {},
      };

      const startTime = Date.now();
      const result = await waitForModalToClose({
        commander: mockCommander,
      });
      const elapsed = Date.now() - startTime;

      assert.equal(result, true);
      assert.ok(elapsed < 100, 'Should return quickly when modal not visible');
    });

    test('should return false when timeout is reached', async () => {
      const mockCommander = {
        count: async ({ selector: _selector }) => 1, // Always visible
        wait: async ({ ms: _ms, reason: _reason }) => {},
      };

      const result = await waitForModalToClose({
        commander: mockCommander,
        timeout: 1000,
        pollInterval: 100,
      });

      assert.equal(result, false);
    });

    test('should return true when modal closes within timeout', async () => {
      let callCount = 0;

      const mockCommander = {
        count: async ({ selector: _selector }) => {
          callCount++;
          // Modal closes on third check
          return callCount < 3 ? 1 : 0;
        },
        wait: async ({ ms: _ms, reason: _reason }) => {},
      };

      const result = await waitForModalToClose({
        commander: mockCommander,
        timeout: 5000,
        pollInterval: 100,
      });

      assert.equal(result, true);
      assert.ok(callCount >= 3, 'Should have polled multiple times');
    });

    test('should use default timeout when not specified', async () => {
      const mockCommander = {
        count: async ({ selector: _selector }) => 1,
        wait: async ({ ms: _ms, reason: _reason }) => {},
      };

      const startTime = Date.now();
      await waitForModalToClose({
        commander: mockCommander,
      });
      const elapsed = Date.now() - startTime;

      // Default timeout is 5000ms, should take close to that
      assert.ok(elapsed >= 4500, 'Should wait close to default timeout (5000ms)');
    });

    test('should use default poll interval when not specified', async () => {
      let waitCallCount = 0;

      const mockCommander = {
        count: async ({ selector: _selector }) => 1, // Always visible
        wait: async ({ ms, reason: _reason }) => {
          waitCallCount++;
          // Actually wait to allow time to advance
          await new Promise((resolve) => setTimeout(resolve, ms));
        },
      };

      await waitForModalToClose({
        commander: mockCommander,
        timeout: 1500,
      });

      // Default poll interval is 500ms, so in 1500ms we should wait ~3 times
      assert.ok(waitCallCount >= 2 && waitCallCount <= 4, `Expected 2-4 waits with 500ms interval, got ${waitCallCount}`);
    });

    test('should respect custom poll interval', async () => {
      let waitTimes = [];

      const mockCommander = {
        count: async ({ selector: _selector }) => 1,
        wait: async ({ ms, reason: _reason }) => {
          waitTimes.push(ms);
        },
      };

      await waitForModalToClose({
        commander: mockCommander,
        timeout: 1000,
        pollInterval: 200,
      });

      // All wait times should be 200ms
      for (const waitTime of waitTimes) {
        assert.equal(waitTime, 200);
      }
    });

    test('should not log when verbose is false', async () => {
      let consoleLogCalled = false;
      const originalLog = console.log;
      console.log = (..._args) => {
        consoleLogCalled = true;
      };

      const mockCommander = {
        count: async ({ selector: _selector }) => 0,
        wait: async ({ ms: _ms, reason: _reason }) => {},
      };

      await waitForModalToClose({
        commander: mockCommander,
        verbose: false,
      });

      console.log = originalLog;
      assert.equal(consoleLogCalled, false);
    });

    test('should log when verbose is true', async () => {
      let consoleLogCalled = false;
      const originalLog = console.log;
      console.log = (..._args) => {
        consoleLogCalled = true;
      };

      const mockCommander = {
        count: async ({ selector: _selector }) => 0,
        wait: async ({ ms: _ms, reason: _reason }) => {},
      };

      await waitForModalToClose({
        commander: mockCommander,
        verbose: true,
      });

      console.log = originalLog;
      assert.ok(consoleLogCalled, 'Should have logged when verbose is true');
    });

    test('should handle errors gracefully', async () => {
      const mockCommander = {
        count: async ({ selector: _selector }) => {
          throw new Error('Network error');
        },
        wait: async ({ ms: _ms, reason: _reason }) => {},
      };

      // isModalVisible returns false on error, so waitForModalToClose should return true
      const result = await waitForModalToClose({
        commander: mockCommander,
      });

      assert.equal(result, true);
    });
  });

  describe('Integration scenarios', () => {
    test('should close modal and wait for it to disappear', async () => {
      let modalVisible = true;
      let closed = false;

      const mockCommander = {
        count: async ({ selector: _selector }) => {
          // Modal becomes invisible after close is called
          return (modalVisible && !closed) ? 1 : 0;
        },
        clickButton: async ({ selector: _selector }) => {
          closed = true;
        },
        wait: async ({ ms: _ms, reason: _reason }) => {
          if (closed) {
            modalVisible = false;
          }
        },
      };

      // Close modal
      const closeResult = await closeModalIfPresent({
        commander: mockCommander,
      });
      assert.equal(closeResult, true);

      // Wait for it to disappear
      const waitResult = await waitForModalToClose({
        commander: mockCommander,
      });
      assert.equal(waitResult, true);
    });

    test('should handle case where modal was already closed', async () => {
      const mockCommander = {
        count: async ({ selector: _selector }) => 0,
        clickButton: async ({ selector: _selector }) => {},
        wait: async ({ ms: _ms, reason: _reason }) => {},
      };

      const closeResult = await closeModalIfPresent({
        commander: mockCommander,
      });
      assert.equal(closeResult, false);

      const isVisible = await isModalVisible({
        commander: mockCommander,
      });
      assert.equal(isVisible, false);
    });

    test('should handle modal that appears and disappears', async () => {
      let callCount = 0;

      const mockCommander = {
        count: async ({ selector: _selector }) => {
          callCount++;
          // Modal appears briefly then disappears
          return callCount === 1 ? 1 : 0;
        },
        clickButton: async ({ selector: _selector }) => {},
        wait: async ({ ms: _ms, reason: _reason }) => {},
      };

      const firstCheck = await isModalVisible({
        commander: mockCommander,
      });
      assert.equal(firstCheck, true);

      const secondCheck = await isModalVisible({
        commander: mockCommander,
      });
      assert.equal(secondCheck, false);
    });
  });

  describe('Edge cases', () => {
    test('should handle empty options object', async () => {
      const mockCommander = {
        count: async ({ selector: _selector }) => 0,
        clickButton: async ({ selector: _selector }) => {},
        wait: async ({ ms: _ms, reason: _reason }) => {},
      };

      const result = await closeModalIfPresent({
        commander: mockCommander,
      });

      assert.equal(result, false);
    });

    test('should handle very short timeout', async () => {
      const mockCommander = {
        count: async ({ selector: _selector }) => 1,
        wait: async ({ ms: _ms, reason: _reason }) => {},
      };

      const result = await waitForModalToClose({
        commander: mockCommander,
        timeout: 10,
        pollInterval: 5,
      });

      assert.equal(result, false);
    });

    test('should handle zero timeout', async () => {
      const mockCommander = {
        count: async ({ selector: _selector }) => 1,
        wait: async ({ ms: _ms, reason: _reason }) => {},
      };

      const result = await waitForModalToClose({
        commander: mockCommander,
        timeout: 0,
      });

      assert.equal(result, false);
    });

    test('should handle async wait function', async () => {
      let waited = false;

      const mockCommander = {
        count: async ({ selector: _selector }) => 1,
        clickButton: async ({ selector: _selector }) => {},
        wait: async ({ ms: _ms, reason: _reason }) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          waited = true;
        },
      };

      await closeModalIfPresent({
        commander: mockCommander,
      });

      assert.ok(waited, 'Should have called async wait function');
    });
  });
});
