/**
 * Tests for timeout error handling
 * Verifies that timeout errors are properly detected and handled
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { isTimeoutError } from 'browser-commander';

test('isTimeoutError: detects TimeoutError by name', () => {
  const error = new Error('Some timeout message');
  error.name = 'TimeoutError';
  assert.strictEqual(isTimeoutError(error), true);
});

test('isTimeoutError: detects "Waiting for selector" message', () => {
  const error = new Error('Waiting for selector `textarea[data-qa="vacancy-response-popup-form-letter-input"]` failed');
  assert.strictEqual(isTimeoutError(error), true);
});

test('isTimeoutError: detects "timeout" in message', () => {
  const error = new Error('Operation timed out after 5000ms');
  assert.strictEqual(isTimeoutError(error), true);
});

test('isTimeoutError: detects "Timeout exceeded" message', () => {
  const error = new Error('Timeout exceeded while waiting for element');
  assert.strictEqual(isTimeoutError(error), true);
});

test('isTimeoutError: detects "waiting for selector" (lowercase)', () => {
  const error = new Error('Error: waiting for selector div.test failed');
  assert.strictEqual(isTimeoutError(error), true);
});

test('isTimeoutError: detects "timed out" message', () => {
  const error = new Error('Element lookup timed out');
  assert.strictEqual(isTimeoutError(error), true);
});

test('isTimeoutError: returns false for null', () => {
  assert.strictEqual(isTimeoutError(null), false);
});

test('isTimeoutError: returns false for undefined', () => {
  assert.strictEqual(isTimeoutError(undefined), false);
});

test('isTimeoutError: returns false for non-timeout errors', () => {
  const error = new Error('Network connection failed');
  assert.strictEqual(isTimeoutError(error), false);
});

test('isTimeoutError: returns false for navigation errors', () => {
  const error = new Error('Execution context was destroyed');
  assert.strictEqual(isTimeoutError(error), false);
});

test('isTimeoutError: handles error without message property', () => {
  const error = { name: 'SomeError' };
  assert.strictEqual(isTimeoutError(error), false);
});

test('isTimeoutError: case-insensitive check for timeout patterns', () => {
  const error1 = new Error('Request TIMEOUT occurred');
  const error2 = new Error('WAITING FOR SELECTOR failed');
  assert.strictEqual(isTimeoutError(error1), true);
  assert.strictEqual(isTimeoutError(error2), true);
});

test('isTimeoutError: real Playwright timeout error format', () => {
  // Simulate actual Playwright error format
  const error = new Error('page.waitForSelector: Timeout 2000ms exceeded.\nCall log:\nwaiting for selector "textarea[data-qa=\\"vacancy-response-popup-form-letter-input\\"]"');
  error.name = 'TimeoutError';
  assert.strictEqual(isTimeoutError(error), true);
});
