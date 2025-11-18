// Experiment to test the fix for issue #82: cover letter section expansion with verbose logging
// This tests the updated handleVacancyResponsePage function with alternative textarea selectors

import puppeteer from 'puppeteer';
import path from 'path';
import os from 'os';

async function testIssue82Fix() {
  console.log('🔍 Testing fix for issue #82: cover letter section expansion with verbose logging...\n');

  // Launch browser
  const browser = await puppeteer.launch({
    headless: true,  // Use headless for testing
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    userDataDir: path.join(os.homedir(), '.hh-automation-test'),
  });

  const page = await browser.newPage();

  try {
    // Mock vacancy_response page HTML (based on real structure)
    const mockHtml = `
    <!DOCTYPE html>
    <html>
    <head><title>Vacancy Response</title></head>
    <body>
      <div>
        <button data-qa="vacancy-response-letter-toggle">Добавить сопроводительное</button>
        <div style="display: none;" id="letter-section">
          <textarea data-qa="vacancy-response-form-letter-input" placeholder="Cover letter"></textarea>
        </div>
      </div>
      <script>
        // Simulate toggle behavior
        document.querySelector('[data-qa="vacancy-response-letter-toggle"]').addEventListener('click', () => {
          const section = document.getElementById('letter-section');
          section.style.display = section.style.display === 'none' ? 'block' : 'none';
        });
      </script>
    </body>
    </html>
    `;

    await page.setContent(mockHtml);

    console.log('📝 Simulating handleVacancyResponsePage with verbose logging...\n');

    // Simulate the toggle click logic
    const nodes = await page.$$('button, a, span, div');
    let toggleClicked = false;
    for (const el of nodes) {
      const txt = (await page.evaluate(el => el.textContent.trim(), el)) || '';
      const dataQa = (await page.evaluate(el => el.getAttribute('data-qa'), el)) || '';
      if (txt === 'Добавить сопроводительное' || dataQa === 'add-cover-letter' || dataQa === 'vacancy-response-letter-toggle') {
        console.log(`🔍 [VERBOSE] Found toggle element: text="${txt}", data-qa="${dataQa}"`);
        const isVisible = await page.evaluate(el => el.offsetWidth > 0 && el.offsetHeight > 0, el);
        const isEnabled = await page.evaluate(el => !el.disabled && el.style.display !== 'none', el);
        console.log(`🔍 [VERBOSE] Element visible: ${isVisible}, enabled: ${isEnabled}`);

        console.log('🔘 Cover letter section is collapsed, clicking toggle to expand...');
        await page.evaluate(el => el.scrollIntoView(), el);
        await el.click();
        console.log('🔍 [VERBOSE] Toggle click completed');

        // Wait a moment for the expand animation to complete
        await new Promise(r => setTimeout(r, 500));
        console.log('🔍 [VERBOSE] Waited 500ms after click');

        console.log('✅ Cover letter section expanded');
        toggleClicked = true;
        break;
      }
    }

    if (!toggleClicked) {
      console.log('💡 Toggle button not found, cover letter section may already be expanded');
    }

    // Test textarea detection with fallback
    let textareaSelector = 'textarea[data-qa="vacancy-response-popup-form-letter-input"]';
    let textareaFound = false;
    try {
      console.log(`🔍 [VERBOSE] Waiting for textarea selector: ${textareaSelector}`);
      await page.waitForSelector(textareaSelector, {
        visible: true,
        timeout: 5000,
      });
      console.log('🔍 [VERBOSE] Textarea found and visible');
      textareaFound = true;
    } catch {
      // Try alternative selector without "popup" for vacancy_response page
      textareaSelector = 'textarea[data-qa="vacancy-response-form-letter-input"]';
      try {
        console.log(`🔍 [VERBOSE] Trying alternative textarea selector: ${textareaSelector}`);
        await page.waitForSelector(textareaSelector, {
          visible: true,
          timeout: 2000,
        });
        console.log('🔍 [VERBOSE] Alternative textarea found and visible');
        textareaFound = true;
      } catch {
        console.log('⚠️  Cover letter textarea not found on vacancy_response page');
        // Try to find any textareas on the page for debugging
        const textareas = await page.$$('textarea');
        console.log(`🔍 [VERBOSE] Found ${textareas.length} textarea(s) on page:`);
        for (let i = 0; i < textareas.length; i++) {
          const dataQa = await page.evaluate(el => el.getAttribute('data-qa'), textareas[i]);
          const isVisible = await page.evaluate(el => el.offsetWidth > 0 && el.offsetHeight > 0, textareas[i]);
          console.log(`🔍 [VERBOSE] Textarea ${i}: data-qa="${dataQa}", visible=${isVisible}`);
        }
      }
    }

    if (textareaFound) {
      console.log('✅ Fix successful: Textarea found after toggle click');
    } else {
      console.log('❌ Fix failed: Textarea not found');
    }

  } catch (error) {
    console.error('❌ Error during testing:', error.message);
  } finally {
    await browser.close();
  }
}

testIssue82Fix().catch(console.error);
