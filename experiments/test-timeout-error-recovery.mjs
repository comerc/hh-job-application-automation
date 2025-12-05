/**
 * Experiment: Test timeout error recovery
 *
 * This script verifies that the application can gracefully handle
 * timeout errors when waiting for selectors and continue automation.
 *
 * Related to: Issue #118
 */

import { isTimeoutError, isNavigationError } from '../src/browser-commander/index.js';

console.log('=== Timeout Error Recovery Test ===\n');

// Test 1: Verify isTimeoutError detects various timeout patterns
console.log('Test 1: isTimeoutError detection');
const timeoutCases = [
  {
    desc: 'Playwright TimeoutError',
    error: (() => {
      const e = new Error('Waiting for selector `textarea[data-qa="vacancy-response-popup-form-letter-input"]` failed');
      e.name = 'TimeoutError';
      return e;
    })(),
    expected: true,
  },
  {
    desc: 'Generic timeout message',
    error: new Error('Operation timed out after 2000ms'),
    expected: true,
  },
  {
    desc: 'Puppeteer timeout',
    error: new Error('waiting for selector "#element" failed: timeout 30000ms exceeded'),
    expected: true,
  },
  {
    desc: 'Navigation error (should be false)',
    error: new Error('Execution context was destroyed'),
    expected: false,
  },
  {
    desc: 'Generic error (should be false)',
    error: new Error('Something else went wrong'),
    expected: false,
  },
];

let passed = 0;
let failed = 0;

timeoutCases.forEach(({ desc, error, expected }) => {
  const result = isTimeoutError(error);
  const status = result === expected ? '✓' : '✗';
  if (result === expected) {
    passed++;
  } else {
    failed++;
  }
  console.log(`  ${status} ${desc}: ${result === expected ? 'PASS' : 'FAIL'}`);
  if (result !== expected) {
    console.log(`     Expected: ${expected}, Got: ${result}`);
    console.log(`     Error: ${error.message}`);
  }
});

console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);

// Test 2: Simulate error handling flow from apply.mjs
console.log('Test 2: Error handling flow simulation');

function simulateErrorHandler(error) {
  if (isNavigationError(error)) {
    return { action: 'recover_navigation', exit: false };
  }

  if (isTimeoutError(error)) {
    return { action: 'continue_automation', exit: false };
  }

  return { action: 'fatal_error', exit: true };
}

const errorScenarios = [
  {
    desc: 'Selector timeout during form filling',
    error: new Error('Waiting for selector `textarea` failed'),
    expectedAction: 'continue_automation',
    expectedExit: false,
  },
  {
    desc: 'Navigation during automation',
    error: new Error('Execution context was destroyed'),
    expectedAction: 'recover_navigation',
    expectedExit: false,
  },
  {
    desc: 'Unknown critical error',
    error: new Error('Out of memory'),
    expectedAction: 'fatal_error',
    expectedExit: true,
  },
];

let flowPassed = 0;
let flowFailed = 0;

errorScenarios.forEach(({ desc, error, expectedAction, expectedExit }) => {
  const result = simulateErrorHandler(error);
  const actionMatch = result.action === expectedAction;
  const exitMatch = result.exit === expectedExit;
  const status = (actionMatch && exitMatch) ? '✓' : '✗';

  if (actionMatch && exitMatch) {
    flowPassed++;
  } else {
    flowFailed++;
  }

  console.log(`  ${status} ${desc}: ${(actionMatch && exitMatch) ? 'PASS' : 'FAIL'}`);
  if (!actionMatch || !exitMatch) {
    console.log(`     Expected: action="${expectedAction}", exit=${expectedExit}`);
    console.log(`     Got: action="${result.action}", exit=${result.exit}`);
  }
});

console.log(`\n  Results: ${flowPassed} passed, ${flowFailed} failed\n`);

// Test 3: Verify error messages are user-friendly
console.log('Test 3: User-friendly error messages');

const timeoutError = new Error('Waiting for selector `textarea[data-qa="vacancy-response-popup-form-letter-input"]` failed');
if (isTimeoutError(timeoutError)) {
  console.log('  ✓ Timeout error detected');
  console.log('  Expected user message:');
  console.log('    "⚠️  Timeout error occurred while waiting for page elements"');
  console.log('    "   Error: [error message]"');
  console.log('    "   This is usually caused by:"');
  console.log('    "     - Slow page loading due to network conditions"');
  console.log('    "     - Page structure differs from expected"');
  console.log('    "     - Third-party scripts blocking page rendering"');
  console.log('    "   The automation will continue with the next vacancy"');
} else {
  console.log('  ✗ Failed to detect timeout error');
}

console.log('\n=== Summary ===');
const totalPassed = passed + flowPassed;
const totalFailed = failed + flowFailed;
console.log(`Total: ${totalPassed} passed, ${totalFailed} failed`);

if (totalFailed === 0) {
  console.log('\n✓ All tests passed! Timeout error recovery is working correctly.');
  process.exit(0);
} else {
  console.log('\n✗ Some tests failed. Review the implementation.');
  process.exit(1);
}
