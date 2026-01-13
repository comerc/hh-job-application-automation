/**
 * Experiment to investigate trailing comma issue in Issue #148
 * Error: 'querySelectorAll': '[data-qa="vacancy-serp__vacancy_response"],' is not a valid selector
 *
 * Hypothesis: The args array is being converted to string somewhere, causing trailing comma
 */

import playwright from 'playwright';
import { createEngineAdapter, evaluate, safeEvaluate } from 'browser-commander';

async function runTest() {
  console.log('Starting experiment for Issue #148...\n');

  const browser = await playwright.chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  // Navigate to a simple page
  await page.setContent(`
    <html>
      <body>
        <div data-qa="vacancy-serp__vacancy_response">Test Button</div>
        <div data-qa="another-button">Another</div>
      </body>
    </html>
  `);

  console.log('Test 1: Direct page.evaluate with multiple args');
  console.log('=========================================');

  const testSelector = '[data-qa="vacancy-serp__vacancy_response"]';
  const testIds = [];

  try {
    // Test with direct page.evaluate (like normalizeSelector uses)
    const result1 = await page.evaluate(
      ({ baseSelector, processedIds }) => {
        console.log('[Browser] baseSelector:', baseSelector);
        console.log('[Browser] processedIds:', processedIds);
        console.log('[Browser] typeof baseSelector:', typeof baseSelector);
        const elements = document.querySelectorAll(baseSelector);
        return elements.length;
      },
      { baseSelector: testSelector, processedIds: testIds }
    );
    console.log(`✅ Direct evaluate with object arg succeeded: ${result1} elements found\n`);
  } catch (error) {
    console.log(`❌ Direct evaluate with object arg failed: ${error.message}\n`);
  }

  console.log('Test 2: Engine Adapter evaluateOnPage with two args');
  console.log('=========================================');

  const adapter = createEngineAdapter(page, 'playwright');

  try {
    const result2 = await adapter.evaluateOnPage(
      (baseSelector, processedIds) => {
        console.log('[Browser] baseSelector:', baseSelector);
        console.log('[Browser] processedIds:', processedIds);
        console.log('[Browser] typeof baseSelector:', typeof baseSelector);
        const elements = document.querySelectorAll(baseSelector);
        return elements.length;
      },
      [testSelector, testIds]
    );
    console.log(`✅ Adapter evaluateOnPage succeeded: ${result2} elements found\n`);
  } catch (error) {
    console.log(`❌ Adapter evaluateOnPage failed: ${error.message}\n`);
  }

  console.log('Test 3: safeEvaluate with two args');
  console.log('=========================================');

  try {
    const result3 = await safeEvaluate({
      page,
      engine: 'playwright',
      fn: (baseSelector, processedIds) => {
        console.log('[Browser] baseSelector:', baseSelector);
        console.log('[Browser] typeof baseSelector:', typeof baseSelector);
        const elements = document.querySelectorAll(baseSelector);
        return elements.length;
      },
      args: [testSelector, testIds],
      defaultValue: null,
      operationName: 'test selector query',
    });
    console.log(`✅ safeEvaluate succeeded: ${result3.value} elements found\n`);
  } catch (error) {
    console.log(`❌ safeEvaluate failed: ${error.message}\n`);
  }

  console.log('Test 4: What happens if selector is accidentally an array?');
  console.log('=========================================');

  const selectorAsArray = [testSelector];
  console.log(`Selector as array: ${JSON.stringify(selectorAsArray)}`);
  console.log(`Array.toString(): "${selectorAsArray.toString()}"`);

  try {
    await page.evaluate(
      (sel) => {
        console.log('[Browser] sel:', sel);
        console.log('[Browser] typeof sel:', typeof sel);
        const elements = document.querySelectorAll(sel);
        return elements.length;
      },
      selectorAsArray.toString()
    );
    console.log('✅ Array.toString() selector succeeded (single element)\n');
  } catch (error) {
    console.log(`❌ Array.toString() selector failed: ${error.message}\n`);
  }

  console.log('Test 5: What if the args is [[selector, ids]] instead of [selector, ids]?');
  console.log('=========================================');

  // This is the key test - if args were accidentally nested
  const nestedArgs = [[testSelector, testIds]];
  console.log(`nestedArgs: ${JSON.stringify(nestedArgs)}`);

  try {
    // If the outer code called evaluateOnPage with [[selector, ids]] instead of [selector, ids]
    // Then inside browser: fn(...[[selector, ids]]) would give fn([selector, ids])
    // And [selector, ids].toString() = "selector,"
    const result5 = await adapter.evaluateOnPage(
      (arg) => {
        console.log('[Browser] arg:', arg);
        console.log('[Browser] typeof arg:', typeof arg);
        console.log('[Browser] Array.isArray(arg):', Array.isArray(arg));
        // If arg is the array [selector, ids], then document.querySelectorAll(arg) would fail
        // because arrays get converted to strings: [selector, ids].toString() = "selector,"
        const elements = document.querySelectorAll(arg);
        return elements.length;
      },
      nestedArgs  // This is [[selector, ids]] - notice it's double-nested
    );
    console.log(`✅ Nested args succeeded: ${result5} elements found\n`);
  } catch (error) {
    console.log(`❌ Nested args failed: ${error.message}`);
    console.log(`   This error pattern matches Issue #148!\n`);
  }

  console.log('Test 6: Simulate exact error scenario');
  console.log('=========================================');

  // The error shows selector ending with comma: '[data-qa="vacancy-serp__vacancy_response"],'
  // Let's create that exact string and see what happens
  const brokenSelector = testSelector + ',';
  console.log(`Broken selector: "${brokenSelector}"`);

  try {
    await page.evaluate(
      (sel) => {
        const elements = document.querySelectorAll(sel);
        return elements.length;
      },
      brokenSelector
    );
    console.log('✅ Surprisingly, comma-ending selector worked?\n');
  } catch (error) {
    console.log(`❌ Comma-ending selector failed as expected: ${error.message}\n`);
  }

  console.log('Test 7: What produces "selector," string?');
  console.log('=========================================');

  // Array with one element converted to string gives "element"
  console.log(`[testSelector].toString() = "${[testSelector].toString()}"`);
  // Array with two elements where second is empty array gives "element,"
  console.log(`[testSelector, []].toString() = "${[testSelector, []].toString()}"`);
  // That's it! If args [selector, []] is passed as a single arg and gets .toString()
  console.log(`\n⭐ FOUND IT: [selector, []].toString() produces "selector,"`);
  console.log(`   This happens if the args array is coerced to string!`);

  await browser.close();
  console.log('\n✅ Experiment completed');
}

runTest().catch((error) => {
  console.error('Experiment failed:', error);
  process.exit(1);
});
