/**
 * Test normalizeSelector behavior in edge cases
 */

import playwright from 'playwright';
import { normalizeSelector, findByText } from 'browser-commander';

async function runTest() {
  console.log('Testing normalizeSelector for Issue #148...\n');

  const browser = await playwright.chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  // Test 1: Element exists
  console.log('Test 1: Element with data-qa exists');
  console.log('=====================================');
  await page.setContent(`
    <html>
      <body>
        <a data-qa="vacancy-serp__vacancy_response">Откликнуться</a>
      </body>
    </html>
  `);

  const selector1 = await findByText({ engine: 'playwright', text: 'Откликнуться', selector: 'a' });
  console.log(`findByText result: "${selector1}"`);
  console.log(`findByText type: ${typeof selector1}`);

  const normalized1 = await normalizeSelector({ page, engine: 'playwright', selector: selector1 });
  console.log(`normalizeSelector result: "${normalized1}"`);
  console.log(`normalizeSelector type: ${typeof normalized1}`);
  console.log(`Is array: ${Array.isArray(normalized1)}`);

  // Test 2: Element doesn't exist (navigation scenario)
  console.log('\nTest 2: Element does not exist');
  console.log('=====================================');
  await page.setContent(`
    <html>
      <body>
        <p>No buttons here</p>
      </body>
    </html>
  `);

  try {
    const selector2 = await findByText({ engine: 'playwright', text: 'Откликнуться', selector: 'a' });
    console.log(`findByText result: "${selector2}"`);

    const normalized2 = await normalizeSelector({ page, engine: 'playwright', selector: selector2 });
    console.log(`normalizeSelector result: ${JSON.stringify(normalized2)}`);
    console.log(`normalizeSelector type: ${typeof normalized2}`);
    console.log(`Is null: ${normalized2 === null}`);
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }

  // Test 3: What if normalizeSelector is called with an array?
  console.log('\nTest 3: normalizeSelector with array input');
  console.log('=====================================');
  try {
    const normalized3 = await normalizeSelector({
      page,
      engine: 'playwright',
      selector: ['[data-qa="test"]', []],  // This would be wrong
    });
    console.log(`normalizeSelector result: ${JSON.stringify(normalized3)}`);
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }

  // Test 4: What if page context changes during normalizeSelector?
  console.log('\nTest 4: Page content change during operation');
  console.log('=====================================');
  await page.setContent(`
    <html>
      <body>
        <a data-qa="vacancy-serp__vacancy_response">Откликнуться</a>
      </body>
    </html>
  `);

  // Start normalize but change page in between
  const selector4 = await findByText({ engine: 'playwright', text: 'Откликнуться', selector: 'a' });
  console.log(`findByText result: "${selector4}"`);

  // Simulate navigation by changing page content
  await page.setContent('<html><body><p>Page changed!</p></body></html>');

  try {
    const normalized4 = await normalizeSelector({ page, engine: 'playwright', selector: selector4 });
    console.log(`normalizeSelector result: ${JSON.stringify(normalized4)}`);
    console.log(`normalizeSelector type: ${typeof normalized4}`);
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }

  await browser.close();
  console.log('\n✅ Test completed');
}

runTest().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
