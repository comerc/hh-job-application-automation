#!/usr/bin/env bun

/**
 * Test the flexible URL matching pattern that only requires the resume parameter
 */

// Updated pattern that matches hh.ru/search/vacancy with resume parameter
const targetPagePattern = /^https:\/\/hh\.ru\/search\/vacancy.*[?&]resume=/;

// Test URLs from the logs
const testUrls = [
  // Base URL with resume parameter
  'https://hh.ru/search/vacancy?resume=80d55a81ff0171bfa80039ed1f743266675357&from=resumelist',

  // URL with multiple parameters
  'https://hh.ru/search/vacancy?order_by=salary_desc&ored_clusters=true&resume=80d55a81ff0171bfa80039ed1f743266675357&salary=350000&search_field=name&search_field=company_name&work_format=REMOTE&search_period=30&forceFiltersSaving=true',

  // URL with different parameter order
  'https://hh.ru/search/vacancy?resume=80d55a81ff0171bfa80039ed1f743266675357&order_by=salary_desc&salary=350000',

  // URL with page parameter
  'https://hh.ru/search/vacancy?order_by=salary_desc&ored_clusters=true&resume=80d55a81ff0171bfa80039ed1f743266675357&salary=350000&search_field=name&search_field=company_name&work_format=REMOTE&search_period=0&forceFiltersSaving=true&page=11&searchSessionId=f07ac222-d03c-44a2-ba76-f39167782d3e',

  // URLs that should NOT match (missing resume parameter)
  'https://hh.ru/search/vacancy',
  'https://hh.ru/search/vacancy?from=resumelist',
  'https://hh.ru/vacancy/127272635',
  'https://hh.ru/applicant/vacancy_response?vacancyId=127272635',
];

console.log('Testing flexible URL matching pattern:\n');
console.log('Pattern:', targetPagePattern.toString(), '\n');

testUrls.forEach((url) => {
  const matches = targetPagePattern.test(url);
  const icon = matches ? '✅' : '❌';
  console.log(`${icon} ${matches ? 'MATCH' : 'NO MATCH'}: ${url}`);
});

console.log('\n✅ Test completed!');
