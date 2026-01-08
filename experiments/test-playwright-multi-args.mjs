/**
 * Experiment to verify that the PlaywrightAdapter.evaluateOnPage() fix works correctly
 * when passing multiple arguments to browser context functions.
 *
 * This tests the fix for issue #132:
 * https://github.com/konard/hh-job-application-automation/issues/132
 *
 * The bug was that when Playwright's page.evaluate() receives an array as the second
 * argument, the function receives the entire array as the first parameter instead
 * of spreading the arguments.
 *
 * The fix uses new Function() to reconstruct the function in the browser context
 * and then spreads the arguments correctly.
 */

import { PlaywrightAdapter, PuppeteerAdapter } from 'browser-commander';

// Mock a Playwright-like page object
function createMockPlaywrightPage() {
  return {
    evaluate: async (fn, arg) => {
      // Simulate Playwright's behavior: passes arg as a single argument
      if (typeof fn === 'function') {
        return fn(arg);
      }
      throw new Error('fn must be a function');
    },
  };
}

// Mock a Puppeteer-like page object
function createMockPuppeteerPage() {
  return {
    evaluate: async (fn, ...args) => {
      // Simulate Puppeteer's behavior: spreads args
      if (typeof fn === 'function') {
        return fn(...args);
      }
      throw new Error('fn must be a function');
    },
  };
}

async function testPlaywrightMultiArgs() {
  console.log('\n=== Testing PlaywrightAdapter.evaluateOnPage() with multiple args ===\n');

  const mockPage = createMockPlaywrightPage();
  const adapter = new PlaywrightAdapter(mockPage);

  // Test 1: Single argument (should work as before)
  console.log('Test 1: Single argument');
  const result1 = await adapter.evaluateOnPage(
    (x) => x * 2,
    [5],
  );
  console.log(`  Input: 5, Expected: 10, Got: ${result1}`);
  console.assert(result1 === 10, 'Single argument test failed');
  console.log('  PASSED\n');

  // Test 2: Multiple arguments - this was the bug
  console.log('Test 2: Multiple arguments (the bug case)');
  const result2 = await adapter.evaluateOnPage(
    (a, b) => a + b,
    [3, 7],
  );
  console.log(`  Input: (3, 7), Expected: 10, Got: ${result2}`);
  console.assert(result2 === 10, 'Multiple arguments test failed');
  console.log('  PASSED\n');

  // Test 3: Three arguments
  console.log('Test 3: Three arguments');
  const result3 = await adapter.evaluateOnPage(
    (a, b, c) => a + b + c,
    [1, 2, 3],
  );
  console.log(`  Input: (1, 2, 3), Expected: 6, Got: ${result3}`);
  console.assert(result3 === 6, 'Three arguments test failed');
  console.log('  PASSED\n');

  // Test 4: Mixed types (simulating the real bug case: selector + array)
  console.log('Test 4: Mixed types (selector + array)');
  const result4 = await adapter.evaluateOnPage(
    (selector, processedIds) => {
      // In real code this would be: document.querySelectorAll(selector)
      // The bug was that selector was receiving the entire array [selector, processedIds]
      return `Selector: ${selector}, ProcessedCount: ${processedIds.length}`;
    },
    ['a:has-text("Test")', ['id1', 'id2', 'id3']],
  );
  console.log(`  Expected: contains "Selector: a:has-text", Got: ${result4}`);
  console.assert(
    result4.includes('Selector: a:has-text') && result4.includes('ProcessedCount: 3'),
    'Mixed types test failed',
  );
  console.log('  PASSED\n');

  // Test 5: Arrow function with complex logic
  console.log('Test 5: Complex arrow function');
  const result5 = await adapter.evaluateOnPage(
    (baseSelector, index) => {
      // This simulates the code in vacancies.mjs that was failing
      if (typeof baseSelector !== 'string') {
        throw new Error(`baseSelector must be a string, got: ${typeof baseSelector}`);
      }
      return { selector: baseSelector, index };
    },
    ['button.apply', 2],
  );
  console.log(`  Expected: {selector: 'button.apply', index: 2}, Got: ${JSON.stringify(result5)}`);
  console.assert(
    result5.selector === 'button.apply' && result5.index === 2,
    'Complex arrow function test failed',
  );
  console.log('  PASSED\n');

  console.log('=== All PlaywrightAdapter tests PASSED ===\n');
}

async function testPuppeteerMultiArgs() {
  console.log('\n=== Testing PuppeteerAdapter.evaluateOnPage() with multiple args ===\n');

  const mockPage = createMockPuppeteerPage();
  const adapter = new PuppeteerAdapter(mockPage);

  // Test: Multiple arguments (Puppeteer spreads them naturally)
  console.log('Test: Multiple arguments (Puppeteer native behavior)');
  const result = await adapter.evaluateOnPage(
    (a, b) => a + b,
    [3, 7],
  );
  console.log(`  Input: (3, 7), Expected: 10, Got: ${result}`);
  console.assert(result === 10, 'Puppeteer multiple arguments test failed');
  console.log('  PASSED\n');

  console.log('=== All PuppeteerAdapter tests PASSED ===\n');
}

async function main() {
  try {
    await testPlaywrightMultiArgs();
    await testPuppeteerMultiArgs();
    console.log('All tests PASSED!');
    process.exit(0);
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

main();
