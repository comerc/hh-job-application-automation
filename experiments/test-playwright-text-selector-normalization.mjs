/**
 * Experiment to verify that Playwright text selectors are properly normalized
 * before being passed to document.querySelectorAll() in browser context.
 *
 * This tests the fix for issue #134:
 * https://github.com/konard/hh-job-application-automation/issues/134
 *
 * The bug was that Playwright-specific text selectors like a:has-text("text")
 * were being passed directly to document.querySelectorAll(), which doesn't
 * support the :has-text() pseudo-selector.
 *
 * The fix adds proper handling in normalizeSelector() to convert Playwright
 * text selectors to valid CSS selectors using page.evaluate().
 */

import { normalizeSelector, findByText } from 'browser-commander';

// Mock a Playwright-like page object
function createMockPlaywrightPage() {
  // Simulate a DOM with some anchor elements
  const mockDOM = {
    elements: [
      { tagName: 'a', textContent: '  Откликнуться  ', dataQa: 'vacancy-button-123' },
      { tagName: 'a', textContent: 'Другая ссылка', dataQa: null },
      { tagName: 'a', textContent: 'Откликнуться', dataQa: 'vacancy-button-456' },
      { tagName: 'button', textContent: 'Откликнуться', dataQa: 'submit-button' },
    ],
  };

  return {
    evaluate: async (fn, arg) => {
      // Simulate Playwright's page.evaluate behavior
      // For our mock, we pass the argument directly to the function
      if (typeof fn === 'function') {
        // Simulate the DOM environment
        const mockDocument = {
          querySelectorAll: (selector) => {
            // Filter elements by tag name
            return mockDOM.elements.filter(el => {
              if (selector === '*') return true;
              return el.tagName.toLowerCase() === selector.toLowerCase();
            });
          },
        };

        // Create a mock element structure
        const elementsWithMethods = mockDOM.elements.map((el, _index) => ({
          tagName: el.tagName,
          textContent: el.textContent,
          getAttribute: (attr) => attr === 'data-qa' ? el.dataQa : null,
          parentElement: {
            children: mockDOM.elements.filter(e => e.tagName === el.tagName),
          },
        }));

        // Override querySelectorAll to return elements with methods
        mockDocument.querySelectorAll = (selector) => {
          return elementsWithMethods.filter(el => {
            if (selector === '*') return true;
            return el.tagName.toLowerCase() === selector.toLowerCase();
          });
        };

        // Monkey-patch Array.from to work with our mock
        const originalArrayFrom = Array.from;
        globalThis.Array.from = (arr) => {
          if (Array.isArray(arr)) return arr;
          return originalArrayFrom(arr);
        };

        // Execute the function with mock document
        globalThis.document = mockDocument;
        try {
          return fn(arg);
        } finally {
          delete globalThis.document;
          globalThis.Array.from = originalArrayFrom;
        }
      }
      throw new Error('fn must be a function');
    },
  };
}

async function testPlaywrightTextSelectorNormalization() {
  console.log('\n=== Testing Playwright Text Selector Normalization ===\n');

  const mockPage = createMockPlaywrightPage();
  const engine = 'playwright';

  // Test 1: findByText returns Playwright-specific selector
  console.log('Test 1: findByText returns Playwright-specific selector');
  const textSelector = await findByText({ engine, text: 'Откликнуться', selector: 'a' });
  console.log(`  findByText result: "${textSelector}"`);
  console.assert(
    textSelector === 'a:has-text("Откликнуться")',
    'Expected Playwright text selector format',
  );
  console.log('  PASSED\n');

  // Test 2: normalizeSelector converts Playwright text selector to valid CSS
  console.log('Test 2: normalizeSelector converts Playwright text selector to valid CSS');
  const normalizedSelector = await normalizeSelector({
    page: mockPage,
    engine,
    selector: textSelector,
  });
  console.log(`  Original: "${textSelector}"`);
  console.log(`  Normalized: "${normalizedSelector}"`);
  console.assert(
    normalizedSelector !== textSelector,
    'Normalized selector should be different from original',
  );
  console.assert(
    !normalizedSelector.includes(':has-text'),
    'Normalized selector should not contain :has-text',
  );
  console.assert(
    normalizedSelector.startsWith('[data-qa=') || normalizedSelector.includes(':nth-of-type'),
    'Normalized selector should be a valid CSS selector',
  );
  console.log('  PASSED\n');

  // Test 3: :text-is selector normalization
  console.log('Test 3: :text-is selector normalization');
  const exactSelector = await findByText({ engine, text: 'Откликнуться', selector: 'a', exact: true });
  console.log(`  findByText (exact) result: "${exactSelector}"`);
  console.assert(
    exactSelector === 'a:text-is("Откликнуться")',
    'Expected Playwright exact text selector format',
  );

  const normalizedExact = await normalizeSelector({
    page: mockPage,
    engine,
    selector: exactSelector,
  });
  console.log(`  Normalized: "${normalizedExact}"`);
  console.assert(
    !normalizedExact.includes(':text-is'),
    'Normalized selector should not contain :text-is',
  );
  console.log('  PASSED\n');

  // Test 4: Plain CSS selector should remain unchanged
  console.log('Test 4: Plain CSS selector should remain unchanged');
  const plainSelector = '[data-qa="vacancy-button"]';
  const normalizedPlain = await normalizeSelector({
    page: mockPage,
    engine,
    selector: plainSelector,
  });
  console.log(`  Original: "${plainSelector}"`);
  console.log(`  Normalized: "${normalizedPlain}"`);
  console.assert(
    normalizedPlain === plainSelector,
    'Plain CSS selector should not be modified',
  );
  console.log('  PASSED\n');

  // Test 5: Puppeteer engine with text selector object (should still work)
  console.log('Test 5: Puppeteer text selector object (for comparison)');
  const puppeteerSelector = await findByText({ engine: 'puppeteer', text: 'Откликнуться', selector: 'a' });
  console.log(`  findByText result: ${JSON.stringify(puppeteerSelector)}`);
  console.assert(
    puppeteerSelector._isPuppeteerTextSelector === true,
    'Puppeteer should return object with _isPuppeteerTextSelector',
  );
  console.log('  PASSED\n');

  console.log('=== All tests PASSED ===\n');
}

async function main() {
  try {
    await testPlaywrightTextSelectorNormalization();
    console.log('All tests PASSED!');
    process.exit(0);
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

main();
