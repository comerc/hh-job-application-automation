// Experiment to test different selectors for cover letter toggle button on vacancy_response page
// This will help identify why the toggle button is not being found

import puppeteer from 'puppeteer';
import path from 'path';
import os from 'os';

async function testSelectors() {
  console.log('🔍 Testing different selectors for cover letter toggle button on vacancy_response page...\n');

  // Launch browser
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized'],
    userDataDir: path.join(os.homedir(), '.hh-automation-test'),
  });

  const page = await browser.newPage();

  try {
    // Navigate to a vacancy_response page (you'll need to replace this with an actual URL)
    // For testing, we'll use a mock HTML page
    const mockHtml = `
    <!DOCTYPE html>
    <html>
    <head><title>Test Vacancy Response</title></head>
    <body>
      <div>
        <button data-qa="vacancy-response-letter-toggle">Toggle Cover Letter</button>
        <button data-qa="add-cover-letter">Add Cover Letter</button>
        <span data-qa="vacancy-response-letter-toggle">Span Toggle</span>
        <div data-qa="vacancy-response-letter-toggle">Div Toggle</div>
        <a href="#" data-qa="vacancy-response-letter-toggle">Link Toggle</a>
        <button>Добавить сопроводительное</button>
      </div>
      <textarea data-qa="vacancy-response-popup-form-letter-input" style="display: none;">Test textarea</textarea>
    </body>
    </html>
    `;

    await page.setContent(mockHtml);

    console.log('📋 Testing current handleVacancyResponsePage selector: [data-qa="vacancy-response-letter-toggle"]');
    const toggleButton = await page.$('[data-qa="vacancy-response-letter-toggle"]');
    if (toggleButton) {
      console.log('✅ Found toggle button with current selector');
    } else {
      console.log('❌ Toggle button NOT found with current selector');
    }

    console.log('\n📋 Testing main loop selector approach...');
    const nodes = await page.$$('button, a, span, div');
    let foundAlternative = false;
    for (const el of nodes) {
      const txt = (await page.evaluate(el => el.textContent.trim(), el)) || '';
      const dataQa = (await page.evaluate(el => el.getAttribute('data-qa'), el)) || '';
      if (txt === 'Добавить сопроводительное' || dataQa === 'add-cover-letter' || dataQa === 'vacancy-response-letter-toggle') {
        console.log(`✅ Found element with text: "${txt}", data-qa: "${dataQa}"`);
        foundAlternative = true;
        break;
      }
    }

    if (!foundAlternative) {
      console.log('❌ No alternative elements found with main loop approach');
    }

    console.log('\n📋 Testing textarea visibility...');
    const textarea = await page.$('textarea[data-qa="vacancy-response-popup-form-letter-input"]');
    if (textarea) {
      const isVisible = await page.evaluate(el => el.offsetWidth > 0 && el.offsetHeight > 0, textarea);
      console.log(`Textarea visibility: ${isVisible ? 'visible' : 'hidden'}`);
    } else {
      console.log('❌ Textarea not found');
    }

  } catch (error) {
    console.error('❌ Error during testing:', error.message);
  } finally {
    await browser.close();
  }
}

testSelectors().catch(console.error);
