/**
 * Tests for vacancy ID tracking functionality
 * Issue #124: Fix infinite loop when skipping direct application modals
 *
 * The fix uses in-memory vacancy ID tracking (Set) instead of HTML attributes
 * to ensure vacancies are not processed twice, even across page navigation.
 */
import { describe, test, assert } from 'test-anywhere';
import {
  getProcessedVacancyCount,
  clearProcessedVacancies,
  isVacancyProcessed,
  markVacancyAsProcessed,
} from '../src/vacancies.mjs';

describe('Vacancy ID Tracking', () => {
  test('Should start with empty processed vacancies', () => {
    clearProcessedVacancies();
    assert.equal(getProcessedVacancyCount(), 0, 'Should have 0 processed vacancies after clear');
  });

  test('Should mark vacancy as processed', () => {
    clearProcessedVacancies();

    markVacancyAsProcessed('123456789');
    assert.equal(getProcessedVacancyCount(), 1, 'Should have 1 processed vacancy');
    assert.equal(isVacancyProcessed('123456789'), true, 'Vacancy 123456789 should be processed');
  });

  test('Should correctly identify unprocessed vacancies', () => {
    clearProcessedVacancies();

    markVacancyAsProcessed('111111111');
    assert.equal(isVacancyProcessed('111111111'), true, 'Vacancy 111111111 should be processed');
    assert.equal(isVacancyProcessed('222222222'), false, 'Vacancy 222222222 should not be processed');
  });

  test('Should handle multiple vacancies', () => {
    clearProcessedVacancies();

    markVacancyAsProcessed('100000001');
    markVacancyAsProcessed('100000002');
    markVacancyAsProcessed('100000003');

    assert.equal(getProcessedVacancyCount(), 3, 'Should have 3 processed vacancies');
    assert.equal(isVacancyProcessed('100000001'), true);
    assert.equal(isVacancyProcessed('100000002'), true);
    assert.equal(isVacancyProcessed('100000003'), true);
    assert.equal(isVacancyProcessed('100000004'), false);
  });

  test('Should not duplicate when marking same vacancy twice', () => {
    clearProcessedVacancies();

    markVacancyAsProcessed('128579290');
    markVacancyAsProcessed('128579290'); // Same ID again

    assert.equal(getProcessedVacancyCount(), 1, 'Should still have only 1 processed vacancy');
  });

  test('Should clear all processed vacancies', () => {
    clearProcessedVacancies();

    markVacancyAsProcessed('111');
    markVacancyAsProcessed('222');
    markVacancyAsProcessed('333');

    assert.equal(getProcessedVacancyCount(), 3, 'Should have 3 processed vacancies before clear');

    clearProcessedVacancies();
    assert.equal(getProcessedVacancyCount(), 0, 'Should have 0 processed vacancies after clear');
    assert.equal(isVacancyProcessed('111'), false, 'Vacancy 111 should not be processed after clear');
  });
});

describe('Cross-page Vacancy Tracking', () => {
  test('Should persist processed IDs across simulated page changes', () => {
    clearProcessedVacancies();

    // Simulate page 1: Mark some vacancies as processed
    markVacancyAsProcessed('page1_vacancy_001');
    markVacancyAsProcessed('page1_vacancy_002');

    assert.equal(getProcessedVacancyCount(), 2, 'After page 1, should have 2 processed');

    // Simulate navigation to page 2 (in-memory Set persists)
    // On page 2, the same vacancies might appear
    assert.equal(isVacancyProcessed('page1_vacancy_001'), true, 'Vacancy from page 1 should still be marked as processed on page 2');

    // Process new vacancies from page 2
    markVacancyAsProcessed('page2_vacancy_001');
    markVacancyAsProcessed('page2_vacancy_002');

    assert.equal(getProcessedVacancyCount(), 4, 'After page 2, should have 4 total processed');

    // Navigate to page 3
    // This vacancy appeared on page 1, should be skipped
    assert.equal(isVacancyProcessed('page1_vacancy_001'), true, 'Original vacancy should still be processed on page 3');
    assert.equal(isVacancyProcessed('page2_vacancy_002'), true, 'Page 2 vacancy should still be processed on page 3');
  });

  test('Should handle realistic vacancy IDs from hh.ru', () => {
    clearProcessedVacancies();

    // Real-world vacancy ID format from hh.ru (e.g., from id="128579290")
    const realVacancyIds = [
      '128579290',
      '115234567',
      '98765432',
      '200000001',
    ];

    realVacancyIds.forEach(id => markVacancyAsProcessed(id));

    assert.equal(getProcessedVacancyCount(), 4, 'Should have 4 processed vacancies');

    realVacancyIds.forEach(id => {
      assert.equal(isVacancyProcessed(id), true, `Vacancy ${id} should be processed`);
    });

    // A new vacancy should not be processed
    assert.equal(isVacancyProcessed('999999999'), false, 'New vacancy should not be processed');
  });
});
