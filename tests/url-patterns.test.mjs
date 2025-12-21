/**
 * Tests for URL patterns used in page detection
 * Issue #142: Support custom search URLs
 */
import { describe, test, assert } from 'test-anywhere';
import { URL_PATTERNS, extractVacancyId, extractVacancyIdFromResponseUrl } from '../src/hh-selectors.mjs';

describe('URL_PATTERNS.searchVacancy', () => {
  test('should match URL with resume parameter', () => {
    const url = 'https://hh.ru/search/vacancy?from=resumelist&resume=abc123';
    assert.equal(URL_PATTERNS.searchVacancy.test(url), true);
  });

  test('should match URL without resume parameter (custom search)', () => {
    const url = 'https://hh.ru/search/vacancy?from=resumelist&order_by=salary_desc&work_format=REMOTE';
    assert.equal(URL_PATTERNS.searchVacancy.test(url), true);
  });

  test('should match URL with complex query parameters', () => {
    const url = 'https://hh.ru/search/vacancy?from=resumelist&order_by=salary_desc&work_format=REMOTE&enable_snippets=false&salary=250000&professional_role=96&professional_role=104&professional_role=125';
    assert.equal(URL_PATTERNS.searchVacancy.test(url), true);
  });

  test('should match bare search vacancy URL', () => {
    const url = 'https://hh.ru/search/vacancy';
    assert.equal(URL_PATTERNS.searchVacancy.test(url), true);
  });

  test('should match search vacancy URL with trailing query string', () => {
    const url = 'https://hh.ru/search/vacancy?text=javascript';
    assert.equal(URL_PATTERNS.searchVacancy.test(url), true);
  });

  test('should NOT match vacancy detail page', () => {
    const url = 'https://hh.ru/vacancy/123456';
    assert.equal(URL_PATTERNS.searchVacancy.test(url), false);
  });

  test('should NOT match login page', () => {
    const url = 'https://hh.ru/account/login';
    assert.equal(URL_PATTERNS.searchVacancy.test(url), false);
  });

  test('should NOT match vacancy response page', () => {
    const url = 'https://hh.ru/applicant/vacancy_response?vacancyId=123456';
    assert.equal(URL_PATTERNS.searchVacancy.test(url), false);
  });

  test('should NOT match URL with similar but different path', () => {
    const url = 'https://hh.ru/search/vacancy_other?param=value';
    assert.equal(URL_PATTERNS.searchVacancy.test(url), false);
  });
});

describe('URL_PATTERNS.vacancyResponse', () => {
  test('should match vacancy response URL', () => {
    const url = 'https://hh.ru/applicant/vacancy_response?vacancyId=123456';
    assert.equal(URL_PATTERNS.vacancyResponse.test(url), true);
  });

  test('should NOT match search vacancy URL', () => {
    const url = 'https://hh.ru/search/vacancy?text=javascript';
    assert.equal(URL_PATTERNS.vacancyResponse.test(url), false);
  });
});

describe('URL_PATTERNS.vacancyPage', () => {
  test('should match vacancy detail page', () => {
    const url = 'https://hh.ru/vacancy/123456';
    assert.equal(URL_PATTERNS.vacancyPage.test(url), true);
  });

  test('should match vacancy detail page with query params', () => {
    const url = 'https://hh.ru/vacancy/123456?from=resumelist';
    assert.equal(URL_PATTERNS.vacancyPage.test(url), true);
  });

  test('should NOT match search vacancy URL', () => {
    const url = 'https://hh.ru/search/vacancy?text=javascript';
    assert.equal(URL_PATTERNS.vacancyPage.test(url), false);
  });
});

describe('URL_PATTERNS.loginPage', () => {
  test('should match login page', () => {
    const url = 'https://hh.ru/account/login';
    assert.equal(URL_PATTERNS.loginPage.test(url), true);
  });

  test('should match login page with backurl', () => {
    const url = 'https://hh.ru/account/login?backurl=https%3A%2F%2Fhh.ru%2Fsearch%2Fvacancy';
    assert.equal(URL_PATTERNS.loginPage.test(url), true);
  });

  test('should NOT match search vacancy URL', () => {
    const url = 'https://hh.ru/search/vacancy?text=javascript';
    assert.equal(URL_PATTERNS.loginPage.test(url), false);
  });
});

describe('extractVacancyId', () => {
  test('should extract vacancy ID from vacancy page URL', () => {
    const url = 'https://hh.ru/vacancy/123456';
    assert.equal(extractVacancyId(url), '123456');
  });

  test('should extract vacancy ID from vacancy page URL with query params', () => {
    const url = 'https://hh.ru/vacancy/789012?from=resumelist';
    assert.equal(extractVacancyId(url), '789012');
  });

  test('should return null for non-vacancy URLs', () => {
    const url = 'https://hh.ru/search/vacancy?text=javascript';
    assert.equal(extractVacancyId(url), null);
  });
});

describe('extractVacancyIdFromResponseUrl', () => {
  test('should extract vacancy ID from vacancy response URL', () => {
    const url = 'https://hh.ru/applicant/vacancy_response?vacancyId=123456';
    assert.equal(extractVacancyIdFromResponseUrl(url), '123456');
  });

  test('should extract vacancy ID from URL with additional params', () => {
    const url = 'https://hh.ru/applicant/vacancy_response?vacancyId=789012&source=search';
    assert.equal(extractVacancyIdFromResponseUrl(url), '789012');
  });

  test('should return null for URLs without vacancyId', () => {
    const url = 'https://hh.ru/search/vacancy?text=javascript';
    assert.equal(extractVacancyIdFromResponseUrl(url), null);
  });
});
