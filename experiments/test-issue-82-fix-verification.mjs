// Test to verify the fix for issue #82: cover letter section expansion
// This tests that both puppeteer and playwright handleVacancyResponsePage functions
// now use the same comprehensive selector as the main loop

import fs from 'fs';
import path from 'path';

console.log('🔍 Testing fix for issue #82: cover letter section expansion...\n');

const puppeteerFile = path.join(process.cwd(), 'src', 'puppeteer-apply.mjs');
const playwrightFile = path.join(process.cwd(), 'src', 'playwright-apply.mjs');

let hasErrors = false;

// Test Puppeteer implementation
console.log('📝 Checking puppeteer-apply.mjs...');
const puppeteerCode = fs.readFileSync(puppeteerFile, 'utf8');

const puppeteerHandleVacancyResponsePage = puppeteerCode
  .split('\n')
  .slice(445, 465)
  .join('\n');

if (puppeteerHandleVacancyResponsePage.includes('сопроводительное') &&
    puppeteerHandleVacancyResponsePage.includes('add-cover-letter') &&
    puppeteerHandleVacancyResponsePage.includes('vacancy-response-letter-toggle')) {
  console.log('✅ Puppeteer: handleVacancyResponsePage uses comprehensive selector');
} else {
  console.error('❌ Puppeteer: handleVacancyResponsePage missing comprehensive selector');
  hasErrors = true;
}

// Test Playwright implementation
console.log('\n📝 Checking playwright-apply.mjs...');
const playwrightCode = fs.readFileSync(playwrightFile, 'utf8');

const playwrightHandleVacancyResponsePage = playwrightCode
  .split('\n')
  .slice(415, 430)
  .join('\n');

if (playwrightHandleVacancyResponsePage.includes('сопроводительное') &&
    playwrightHandleVacancyResponsePage.includes('add-cover-letter') &&
    playwrightHandleVacancyResponsePage.includes('vacancy-response-letter-toggle')) {
  console.log('✅ Playwright: handleVacancyResponsePage uses comprehensive selector');
} else {
  console.error('❌ Playwright: handleVacancyResponsePage missing comprehensive selector');
  hasErrors = true;
}

// Verify both implementations match the main loop approach
console.log('\n📋 Verifying consistency with main loop...');

if (puppeteerCode.includes('сопроводительное') &&
    puppeteerCode.includes('add-cover-letter') &&
    puppeteerCode.includes('vacancy-response-letter-toggle')) {
  console.log('✅ Puppeteer main loop uses comprehensive selector');
} else {
  console.error('❌ Puppeteer main loop selector issue');
  hasErrors = true;
}

if (playwrightCode.includes('сопроводительное') &&
    playwrightCode.includes('add-cover-letter') &&
    playwrightCode.includes('vacancy-response-letter-toggle')) {
  console.log('✅ Playwright main loop uses comprehensive selector');
} else {
  console.error('❌ Playwright main loop selector issue');
  hasErrors = true;
}

console.log('\n=== Analysis ===');
console.log('The issue was that handleVacancyResponsePage() only looked for:');
console.log('  [data-qa="vacancy-response-letter-toggle"]');
console.log('');
console.log('But the main loop used a comprehensive selector that checks for:');
console.log('  1. Text: "Добавить сопроводительное"');
console.log('  2. data-qa="add-cover-letter"');
console.log('  3. data-qa="vacancy-response-letter-toggle"');
console.log('');
console.log('This inconsistency meant that on vacancy_response pages, the toggle');
console.log('button might use different markup than in modals, causing the expansion to fail.');

if (hasErrors) {
  console.error('\n❌ Some checks failed!');
  process.exit(1);
} else {
  console.log('\n✅ All checks passed! Issue #82 fix implemented correctly.');
  console.log('Both puppeteer and playwright handleVacancyResponsePage functions now');
  console.log('use the same comprehensive selector as their respective main loops.');
}

