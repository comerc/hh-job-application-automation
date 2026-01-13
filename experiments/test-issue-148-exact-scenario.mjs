/**
 * Experiment to reproduce exact scenario from Issue #148
 * This mimics the exact code path in vacancies.mjs findVacancyButton
 */

import playwright from 'playwright';
import { createEngineAdapter, safeEvaluate, normalizeSelector, findByText } from 'browser-commander';

async function runTest() {
  console.log('Starting exact scenario reproduction for Issue #148...\n');

  const browser = await playwright.chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  const engine = 'playwright';

  // Simulate an HH.ru vacancy list page
  await page.setContent(`
    <html>
      <body>
        <div class="vacancy-card--12345" id="123456789">
          <a data-qa="vacancy-serp__vacancy_response">Откликнуться</a>
        </div>
        <div class="vacancy-card--67890" id="987654321">
          <a data-qa="vacancy-serp__vacancy_response">Откликнуться</a>
        </div>
      </body>
    </html>
  `);

  console.log('Step 1: findByText to get the selector');
  console.log('=======================================');

  // This is what findVacancyButton does first
  const baseButtonSelector = await findByText({
    engine,
    text: 'Откликнуться',
    selector: 'a',
  });

  console.log(`baseButtonSelector: ${baseButtonSelector}`);
  console.log(`Type: ${typeof baseButtonSelector}`);

  console.log('\nStep 2: normalizeSelector to convert Playwright text selector');
  console.log('=======================================');

  const normalizedSelector = await normalizeSelector({
    page,
    engine,
    selector: baseButtonSelector,
  });

  console.log(`normalizedSelector: ${normalizedSelector}`);
  console.log(`Type: ${typeof normalizedSelector}`);

  console.log('\nStep 3: safeEvaluate with normalizedSelector + empty processedIds');
  console.log('=======================================');

  const processedIds = [];

  try {
    const result = await safeEvaluate({
      page,
      engine,
      fn: (baseSelector, alreadyProcessedIds) => {
        console.log('[Browser] baseSelector:', baseSelector);
        console.log('[Browser] typeof baseSelector:', typeof baseSelector);
        console.log('[Browser] alreadyProcessedIds:', alreadyProcessedIds);

        // This is the exact code from vacancies.mjs line 389
        const allButtons = document.querySelectorAll(baseSelector);
        return {
          totalButtons: allButtons.length,
          baseSelector: baseSelector,
          typeof: typeof baseSelector,
        };
      },
      args: [normalizedSelector, processedIds],
      defaultValue: null,
      operationName: 'find unprocessed vacancy button',
    });

    console.log(`✅ Success! Result: ${JSON.stringify(result.value)}`);
  } catch (error) {
    console.log(`❌ Failed with error: ${error.message}`);
  }

  console.log('\nStep 4: Test with filled processedIds');
  console.log('=======================================');

  const processedIdsWithValues = ['111111', '222222'];

  try {
    const result = await safeEvaluate({
      page,
      engine,
      fn: (baseSelector, alreadyProcessedIds) => {
        console.log('[Browser] baseSelector:', baseSelector);
        console.log('[Browser] alreadyProcessedIds:', alreadyProcessedIds);

        const allButtons = document.querySelectorAll(baseSelector);
        return {
          totalButtons: allButtons.length,
          processedCount: alreadyProcessedIds.length,
        };
      },
      args: [normalizedSelector, processedIdsWithValues],
      defaultValue: null,
      operationName: 'find unprocessed vacancy button with filled ids',
    });

    console.log(`✅ Success! Result: ${JSON.stringify(result.value)}`);
  } catch (error) {
    console.log(`❌ Failed with error: ${error.message}`);
  }

  console.log('\nStep 5: Manual test - what if args gets wrapped in another array?');
  console.log('=======================================');

  // This could happen if somewhere in the code there's a bug where args are wrapped
  const adapter = createEngineAdapter(page, engine);

  // Correct call
  console.log('Correct call: evaluateOnPage(fn, [selector, ids])');
  try {
    const result = await adapter.evaluateOnPage(
      (sel, ids) => {
        return { sel, ids: ids.length };
      },
      [normalizedSelector, processedIds],
    );
    console.log(`✅ Correct call succeeded: ${JSON.stringify(result)}`);
  } catch (error) {
    console.log(`❌ Correct call failed: ${error.message}`);
  }

  // Buggy call - args wrapped in extra array
  console.log('\nBuggy call: evaluateOnPage(fn, [[selector, ids]]) - returned value');
  try {
    const result = await adapter.evaluateOnPage(
      (sel, ids) => {
        return { sel, ids };
      },
      [[normalizedSelector, processedIds]],  // BUG: extra wrapping
    );
    console.log(`✅ Buggy call succeeded: ${JSON.stringify(result)}`);
    console.log('   Notice: sel is now an array, not a string!');
  } catch (error) {
    console.log(`❌ Buggy call failed: ${error.message}`);
    console.log('   This is the Issue #148 pattern!');
  }

  // Buggy call that uses querySelectorAll
  console.log('\nBuggy call with querySelectorAll:');
  try {
    const result = await adapter.evaluateOnPage(
      (sel, _ids) => {
        // sel is now an array because of the extra wrapping
        // When passed to querySelectorAll, array.toString() converts it
        console.log('In browser - sel:', sel, 'type:', typeof sel, 'isArray:', Array.isArray(sel));
        const elements = document.querySelectorAll(sel);
        return elements.length;
      },
      [[normalizedSelector, processedIds]],  // BUG: extra wrapping
    );
    console.log(`✅ Buggy querySelectorAll succeeded: ${result}`);
  } catch (error) {
    console.log(`❌ Buggy querySelectorAll failed: ${error.message}`);
    console.log('   ⭐ This is the exact Issue #148 error pattern!');
  }

  await browser.close();
  console.log('\n✅ Experiment completed');
}

runTest().catch((error) => {
  console.error('Experiment failed:', error);
  process.exit(1);
});
