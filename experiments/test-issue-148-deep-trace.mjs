/**
 * Deep trace to understand exactly where the trailing comma comes from
 */

import playwright from 'playwright';

async function runTest() {
  console.log('Starting deep trace for Issue #148...\n');

  const browser = await playwright.chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  // Simulate an HH.ru vacancy list page
  await page.setContent(`
    <html>
      <body>
        <div class="vacancy-card--12345" id="123456789">
          <a data-qa="vacancy-serp__vacancy_response">Откликнуться</a>
        </div>
      </body>
    </html>
  `);

  const normalizedSelector = '[data-qa="vacancy-serp__vacancy_response"]';
  const processedIds = [];

  console.log('Test 1: Direct page.evaluate with two args');
  console.log('=======================================');
  console.log(`normalizedSelector: "${normalizedSelector}"`);
  console.log(`processedIds: ${JSON.stringify(processedIds)}`);
  console.log(`args: ${JSON.stringify([normalizedSelector, processedIds])}`);

  // What if we call page.evaluate directly the wrong way?
  console.log('\n1a. Correct: page.evaluate(fn, [selector, ids])');
  try {
    // This is what happens when args.length === 1 branch is taken
    // If we pass [normalizedSelector, processedIds] as a SINGLE arg
    const result = await page.evaluate((arg) => {
      console.log('Received arg:', arg, typeof arg);
      return { arg: arg, type: typeof arg };
    }, [normalizedSelector, processedIds]);
    console.log(`Result: ${JSON.stringify(result)}`);
  } catch (error) {
    console.log(`Error: ${error.message}`);
  }

  console.log('\n1b. What if the fn expects two args but only gets one?');
  try {
    // This simulates what could happen if args.length is wrong
    const result = await page.evaluate((baseSelector, ids) => {
      console.log('baseSelector:', baseSelector);
      console.log('ids:', ids);
      return {
        baseSelector: baseSelector,
        baseType: typeof baseSelector,
        isArray: Array.isArray(baseSelector),
        ids: ids
      };
    }, [normalizedSelector, processedIds]); // Single array arg!
    console.log(`Result: ${JSON.stringify(result)}`);
    console.log('>>> NOTICE: baseSelector received the entire array!');
  } catch (error) {
    console.log(`Error: ${error.message}`);
  }

  console.log('\n1c. What happens when that array is passed to querySelectorAll?');
  try {
    const result = await page.evaluate((baseSelector, ids) => {
      // baseSelector is now an array, not a string!
      // When we call querySelectorAll, it will convert to string
      console.log('baseSelector:', baseSelector);
      console.log('String(baseSelector):', String(baseSelector));
      const elements = document.querySelectorAll(baseSelector);
      return elements.length;
    }, [normalizedSelector, processedIds]); // Single array arg!
    console.log(`Result: ${result}`);
  } catch (error) {
    console.log(`Error: ${error.message}`);
    console.log('>>> This is the Issue #148 error!');
  }

  console.log('\n\nTest 2: Simulating PlaywrightAdapter.evaluateOnPage');
  console.log('=======================================');

  const fn = (baseSelector, alreadyProcessedIds) => {
    const allButtons = document.querySelectorAll(baseSelector);
    return { count: allButtons.length };
  };
  const args = [normalizedSelector, processedIds];

  console.log(`args.length: ${args.length}`);
  console.log(`Expecting to use multi-arg branch (args.length > 1)`);

  // Multi-arg branch code from browser-commander
  console.log('\n2a. Multi-arg branch (correct implementation from v0.5.3):');
  try {
    const fnString = fn.toString();
    const result = await page.evaluate(
      ({ fnStr, argsArray }) => {
        const reconstructedFn = new Function(`return (${fnStr})`)();
        return reconstructedFn(...argsArray);
      },
      { fnStr: fnString, argsArray: args }
    );
    console.log(`✅ Success: ${JSON.stringify(result)}`);
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }

  console.log('\n\nTest 3: What if args detection is wrong?');
  console.log('=======================================');

  // What if someone checks args.length before passing through createEngineAdapter?
  // And args is undefined or something weird?

  console.log('3a. What if adapter receives args as undefined?');
  const argsUndefined = undefined;
  try {
    // This mimics: if (args.length === 0) branch when args is undefined
    // Actually this would throw because undefined.length
    console.log(`argsUndefined?.length: ${argsUndefined?.length}`);
    // ... this wouldn't trigger the issue
  } catch (error) {
    console.log(`Error: ${error.message}`);
  }

  console.log('\n3b. Test browser-commander\'s actual evaluateOnPage logic');
  // Copy exact logic from browser-commander v0.5.3
  async function evaluateOnPageSimulation(fn, args = []) {
    if (args.length === 0) {
      console.log('  -> Branch: args.length === 0');
      return await page.evaluate(fn);
    } else if (args.length === 1) {
      console.log('  -> Branch: args.length === 1, passing args[0]');
      return await page.evaluate(fn, args[0]);
    } else {
      console.log('  -> Branch: multiple args, using Function reconstruction');
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

  console.log('With args = [selector, []]:');
  try {
    const result = await evaluateOnPageSimulation(fn, [normalizedSelector, processedIds]);
    console.log(`✅ Success: ${JSON.stringify(result)}`);
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }

  console.log('\n\nTest 4: What if args is accidentally a nested array?');
  console.log('=======================================');

  console.log('4a. If args = [[selector, ids]] (doubly nested):');
  const nestedArgs = [[normalizedSelector, processedIds]];
  console.log(`nestedArgs.length: ${nestedArgs.length}`);  // 1!
  try {
    const result = await evaluateOnPageSimulation(fn, nestedArgs);
    console.log(`Result: ${JSON.stringify(result)}`);
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    console.log('>>> This would cause Issue #148!');
  }

  await browser.close();
  console.log('\n✅ Deep trace completed');
}

runTest().catch((error) => {
  console.error('Deep trace failed:', error);
  process.exit(1);
});
