/**
 * Test script for issue #138 fix
 * Verifies that error handling in textarea logging loop prevents crashes
 */

import { test } from 'node:test';
import assert from 'node:assert';

/**
 * Simulates the fixed textarea logging loop behavior
 */
async function logTextareasWithErrorHandling(commander, initialCount) {
  const logs = [];
  const errors = [];

  // Simulate the fixed loop
  for (let i = 0; i < initialCount; i++) {
    try {
      const selector = `textarea:nth-of-type(${i + 1})`;
      const dataQa = await commander.getAttribute({ selector, attribute: 'data-qa' });
      const visible = await commander.isVisible({ selector });
      const dataQaDisplay = dataQa || '(none)';
      logs.push(`Initial textarea ${i}: data-qa="${dataQaDisplay}", visible=${visible}`);
    } catch (error) {
      // Handle errors gracefully to prevent crashes
      logs.push(`Initial textarea ${i}: error getting details (${error.message})`);
      errors.push({ index: i, error: error.message });
    }
  }

  return { logs, errors };
}

test('Issue #138: textarea logging loop handles errors gracefully', async () => {
  // Mock commander that throws error on second textarea
  const mockCommander = {
    getAttribute: async ({ selector }) => {
      if (selector === 'textarea:nth-of-type(2)') {
        throw new Error('Element detached from DOM');
      }
      return selector === 'textarea:nth-of-type(1)' ? 'test-qa' : null;
    },
    isVisible: async ({ selector }) => {
      if (selector === 'textarea:nth-of-type(2)') {
        throw new Error('Element detached from DOM');
      }
      return true;
    },
  };

  const result = await logTextareasWithErrorHandling(mockCommander, 3);

  // Should have logged all 3 textareas, even with error on second one
  assert.strictEqual(result.logs.length, 3, 'Should log all textareas');

  // First textarea should succeed
  assert.match(result.logs[0], /data-qa="test-qa"/, 'First textarea should have data-qa');

  // Second textarea should have error message
  assert.match(result.logs[1], /error getting details/, 'Second textarea should log error');

  // Third textarea should succeed (loop continues after error)
  assert.match(result.logs[2], /data-qa="\(none\)"/, 'Third textarea should be processed');

  // Should have recorded the error
  assert.strictEqual(result.errors.length, 1, 'Should have one error');
  assert.strictEqual(result.errors[0].index, 1, 'Error should be for index 1');
  assert.match(result.errors[0].error, /detached/, 'Error should mention detached');
});

test('Issue #138: textarea logging completes even with multiple errors', async () => {
  // Mock commander that throws errors on all calls
  const mockCommander = {
    getAttribute: async () => {
      throw new Error('Navigation in progress');
    },
    isVisible: async () => {
      throw new Error('Navigation in progress');
    },
  };

  const result = await logTextareasWithErrorHandling(mockCommander, 2);

  // Should have logged all textareas with error messages
  assert.strictEqual(result.logs.length, 2, 'Should log all textareas');
  assert.strictEqual(result.errors.length, 2, 'Should have recorded all errors');

  // All logs should mention errors
  assert.match(result.logs[0], /error getting details/, 'First textarea should log error');
  assert.match(result.logs[1], /error getting details/, 'Second textarea should log error');
});

test('Issue #138: textarea logging works normally when no errors', async () => {
  // Mock commander that works correctly
  const mockCommander = {
    getAttribute: async ({ selector }) => {
      if (selector === 'textarea:nth-of-type(1)') return 'cover-letter';
      if (selector === 'textarea:nth-of-type(2)') return 'test-question';
      return null;
    },
    isVisible: async () => true,
  };

  const result = await logTextareasWithErrorHandling(mockCommander, 2);

  // Should have logged all textareas successfully
  assert.strictEqual(result.logs.length, 2, 'Should log all textareas');
  assert.strictEqual(result.errors.length, 0, 'Should have no errors');

  // Logs should contain the correct data
  assert.match(result.logs[0], /data-qa="cover-letter"/, 'First textarea should have correct data-qa');
  assert.match(result.logs[1], /data-qa="test-question"/, 'Second textarea should have correct data-qa');
});

console.log('Running tests for issue #138 fix...');
