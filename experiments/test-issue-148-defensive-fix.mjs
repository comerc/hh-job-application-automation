/**
 * Test a defensive fix for Issue #148
 * The goal is to detect and handle cases where args might be passed incorrectly
 */

import playwright from 'playwright';

async function runTest() {
  console.log('Testing defensive fix for Issue #148...\n');

  const browser = await playwright.chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  await page.setContent(`
    <html>
      <body>
        <div id="123456789">
          <a data-qa="vacancy-serp__vacancy_response">Откликнуться</a>
        </div>
      </body>
    </html>
  `);

  const selector = '[data-qa="vacancy-serp__vacancy_response"]';
  const ids = [];

  // Current implementation - can fail with wrong args
  async function currentImplementation(fn, args = []) {
    if (args.length === 0) {
      return await page.evaluate(fn);
    } else if (args.length === 1) {
      return await page.evaluate(fn, args[0]);
    } else {
      const fnString = fn.toString();
      return await page.evaluate(
        ({ fnStr, argsArray }) => {
          const reconstructedFn = new Function(`return (${fnStr})`)();
          return reconstructedFn(...argsArray);
        },
        { fnStr: fnString, argsArray: args }
      );
    }
  }

  // Defensive implementation - always use function reconstruction for multi-param functions
  async function defensiveImplementation(fn, args = []) {
    // Always use the multi-arg branch to avoid the single-arg issue
    // This is safer because it always spreads the args correctly
    if (args.length === 0) {
      return await page.evaluate(fn);
    } else {
      // Always use function reconstruction to ensure args are spread correctly
      const fnString = fn.toString();
      return await page.evaluate(
        ({ fnStr, argsArray }) => {
          const reconstructedFn = new Function(`return (${fnStr})`)();
          return reconstructedFn(...argsArray);
        },
        { fnStr: fnString, argsArray: args }
      );
    }
  }

  const testFn = (baseSelector, processedIds) => {
    const elements = document.querySelectorAll(baseSelector);
    return { count: elements.length, selectorType: typeof baseSelector };
  };

  console.log('Test 1: Correct args [selector, ids]');
  console.log('=====================================');
  const correctArgs = [selector, ids];
  console.log(`args.length: ${correctArgs.length}`);

  try {
    const result = await currentImplementation(testFn, correctArgs);
    console.log(`✅ Current: ${JSON.stringify(result)}`);
  } catch (e) {
    console.log(`❌ Current: ${e.message}`);
  }

  try {
    const result = await defensiveImplementation(testFn, correctArgs);
    console.log(`✅ Defensive: ${JSON.stringify(result)}`);
  } catch (e) {
    console.log(`❌ Defensive: ${e.message}`);
  }

  console.log('\nTest 2: Wrong args [[selector, ids]] (double nested)');
  console.log('=====================================');
  const wrongArgs = [[selector, ids]];
  console.log(`args.length: ${wrongArgs.length}`);

  try {
    const result = await currentImplementation(testFn, wrongArgs);
    console.log(`✅ Current: ${JSON.stringify(result)}`);
  } catch (e) {
    console.log(`❌ Current: ${e.message.substring(0, 100)}...`);
  }

  try {
    const result = await defensiveImplementation(testFn, wrongArgs);
    console.log(`✅ Defensive: ${JSON.stringify(result)}`);
  } catch (e) {
    console.log(`❌ Defensive: ${e.message.substring(0, 100)}...`);
  }

  console.log('\nTest 3: Single arg [selector]');
  console.log('=====================================');
  const singleArg = [selector];
  const singleFn = (sel) => document.querySelectorAll(sel).length;

  try {
    const result = await currentImplementation(singleFn, singleArg);
    console.log(`✅ Current: ${result}`);
  } catch (e) {
    console.log(`❌ Current: ${e.message}`);
  }

  try {
    const result = await defensiveImplementation(singleFn, singleArg);
    console.log(`✅ Defensive: ${result}`);
  } catch (e) {
    console.log(`❌ Defensive: ${e.message}`);
  }

  await browser.close();
  console.log('\n✅ Test completed');
}

runTest().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
