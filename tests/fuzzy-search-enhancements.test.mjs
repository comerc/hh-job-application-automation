/**
 * Tests for fuzzy search enhancements (issue #122)
 * - Sorted results (returnAll option)
 * - Configurable case sensitivity
 * - Normalized similarity scoring (0-1 range)
 */
import { describe, test, assert } from 'test-anywhere';
import {
  findBestMatch,
  extractKeywordsCaseSensitive,
  keywordSimilarityCaseSensitive,
} from '../src/qa-database.mjs';

// Test data
const qaDatabase = new Map([
  ['Укажите ваши ожидания по заработной плате', 'От 450000 рублей в месяц на руки.'],
  ['Укажите размер заработной платы, от которого вы рассматриваете предложения.', 'От 450000 рублей в месяц на руки.'],
  ['От какой суммы сейчас отталкиваешься на руки ?', 'От 450000 рублей в месяц на руки.'],
  ['Расскажи чуть детальнее о проекте, пожалуйста.', 'Детальнее не получится, NDA.'],
  ['Территориально где находишься на данный момент?', 'В Гоа, в Индии.'],
]);

describe('Fuzzy Search Enhancements - Sorted Results', () => {

  test('returnAll: false should return single best match (default behavior)', () => {
    const question = 'Укажите, пожалуйста, свои зарплатные ожидания';
    const match = findBestMatch(question, qaDatabase, { returnAll: false });

    assert.ok(match);
    assert.ok(typeof match === 'object');
    assert.ok(!Array.isArray(match));
    assert.ok(match.question);
    assert.ok(match.answer);
    assert.ok(match.score >= 0 && match.score <= 1);
  });

  test('returnAll: true should return array of all matches sorted by score', () => {
    const question = 'Укажите, пожалуйста, свои зарплатные ожидания';
    const matches = findBestMatch(question, qaDatabase, { returnAll: true });

    assert.ok(Array.isArray(matches));
    assert.ok(matches.length > 0);

    // All matches should have valid structure
    for (const match of matches) {
      assert.ok(match.question);
      assert.ok(match.answer);
      assert.ok(match.score >= 0 && match.score <= 1);
    }

    // Should be sorted by score descending (highest first)
    for (let i = 1; i < matches.length; i++) {
      assert.ok(matches[i - 1].score >= matches[i].score,
        `Expected match ${i - 1} (${matches[i - 1].score}) >= match ${i} (${matches[i].score})`);
    }
  });

  test('returnAll: true with threshold should only return matches above threshold', () => {
    const question = 'Укажите зарплату';
    const matches = findBestMatch(question, qaDatabase, { returnAll: true, threshold: 0.5 });

    assert.ok(Array.isArray(matches));

    // All matches should be above threshold
    for (const match of matches) {
      assert.ok(match.score >= 0.5,
        `Expected score >= 0.5, got ${match.score} for "${match.question}"`);
    }
  });

  test('returnAll: true with no matches should return empty array', () => {
    const question = 'Completely unrelated English question about something else';
    const matches = findBestMatch(question, qaDatabase, { returnAll: true });

    assert.ok(Array.isArray(matches));
    assert.equal(matches.length, 0);
  });

  test('returnAll: true with exact match should return array with single item', () => {
    const question = 'Укажите ваши ожидания по заработной плате';
    const matches = findBestMatch(question, qaDatabase, { returnAll: true });

    assert.ok(Array.isArray(matches));
    assert.equal(matches.length, 1);
    assert.equal(matches[0].question, question);
    assert.equal(matches[0].score, 1.0);
  });

  test('Backward compatibility: number as second argument should work', () => {
    const question = 'Укажите зарплату';
    const match = findBestMatch(question, qaDatabase, 0.3);

    assert.ok(match === null || (typeof match === 'object' && !Array.isArray(match)));
  });

  test('returnAll: true should return more results than default (single match)', () => {
    const question = 'зарплата';
    const singleMatch = findBestMatch(question, qaDatabase, { threshold: 0.3 });
    const allMatches = findBestMatch(question, qaDatabase, { returnAll: true, threshold: 0.3 });

    if (singleMatch) {
      assert.ok(Array.isArray(allMatches));
      assert.ok(allMatches.length >= 1);

      // First item in allMatches should equal singleMatch
      assert.equal(allMatches[0].question, singleMatch.question);
      assert.equal(allMatches[0].answer, singleMatch.answer);
      assert.equal(allMatches[0].score, singleMatch.score);
    }
  });

  test('Similarity scores should be normalized (0-1 range)', () => {
    const question = 'Какая зарплата?';
    const matches = findBestMatch(question, qaDatabase, { returnAll: true, threshold: 0 });

    assert.ok(Array.isArray(matches));
    assert.ok(matches.length > 0);

    for (const match of matches) {
      assert.ok(match.score >= 0, `Score should be >= 0, got ${match.score}`);
      assert.ok(match.score <= 1, `Score should be <= 1, got ${match.score}`);
    }
  });

  test('Exact match should have score of 1.0 (100%)', () => {
    const question = 'Укажите ваши ожидания по заработной плате';
    const match = findBestMatch(question, qaDatabase);

    assert.ok(match);
    assert.equal(match.score, 1.0);
  });

});

describe('Fuzzy Search Enhancements - Case Sensitivity', () => {

  test('caseSensitive: false should match case-insensitively (default)', () => {
    const question = 'УКАЖИТЕ ВАШИ ОЖИДАНИЯ ПО ЗАРАБОТНОЙ ПЛАТЕ';
    const match = findBestMatch(question, qaDatabase, { caseSensitive: false });

    assert.ok(match);
    assert.equal(match.score, 1.0);
  });

  test('caseSensitive: true should require case match', () => {
    const db = new Map([
      ['Hello World', 'Answer 1'],
      ['hello world', 'Answer 2'],
    ]);

    const upperMatch = findBestMatch('Hello World', db, { caseSensitive: true });
    assert.ok(upperMatch);
    assert.equal(upperMatch.question, 'Hello World');
    assert.equal(upperMatch.score, 1.0);

    const lowerMatch = findBestMatch('hello world', db, { caseSensitive: true });
    assert.ok(lowerMatch);
    assert.equal(lowerMatch.question, 'hello world');
    assert.equal(lowerMatch.score, 1.0);
  });

  test('caseSensitive: true should have different scores for different cases', () => {
    const db = new Map([
      ['Hello World', 'Answer'],
    ]);

    const exactMatch = findBestMatch('Hello World', db, { caseSensitive: true });
    const wrongCaseMatch = findBestMatch('hello world', db, { caseSensitive: true, threshold: 0 });

    assert.ok(exactMatch);
    assert.equal(exactMatch.score, 1.0);

    // Wrong case should have lower score
    if (wrongCaseMatch) {
      assert.ok(wrongCaseMatch.score < 1.0,
        `Expected score < 1.0 for wrong case, got ${wrongCaseMatch.score}`);
    }
  });

  test('caseSensitive: false with Cyrillic should work', () => {
    const question = 'укажите ваши ожидания по заработной плате';
    const match = findBestMatch(question, qaDatabase, { caseSensitive: false });

    assert.ok(match);
    // Case-insensitive should still find a good match
    assert.ok(match.score > 0.9, `Expected high score, got ${match.score}`);
  });

  test('Backward compatibility: default is case-insensitive', () => {
    const question = 'УКАЖИТЕ ВАШИ ОЖИДАНИЯ ПО ЗАРАБОТНОЙ ПЛАТЕ';
    const match = findBestMatch(question, qaDatabase);

    assert.ok(match);
    assert.equal(match.score, 1.0);
  });

});

describe('Case-Sensitive Keyword Functions', () => {

  test('extractKeywordsCaseSensitive should preserve case', () => {
    const keywords = extractKeywordsCaseSensitive('Hello World Test');

    assert.ok(keywords.has('Hello'));
    assert.ok(keywords.has('World'));
    assert.ok(keywords.has('Test'));
    assert.ok(!keywords.has('hello'));
  });

  test('extractKeywordsCaseSensitive should filter stopwords case-insensitively', () => {
    const keywords = extractKeywordsCaseSensitive('Укажите Ваши ожидания');

    assert.ok(keywords.has('Укажите'));
    assert.ok(keywords.has('ожидания') || keywords.has('ожида'));
    assert.ok(!keywords.has('Ваши'), 'Should filter out "Ваши" (stopword)');
  });

  test('keywordSimilarityCaseSensitive should respect case', () => {
    const sim1 = keywordSimilarityCaseSensitive('Hello World', 'Hello World');
    const sim2 = keywordSimilarityCaseSensitive('Hello World', 'hello world');

    assert.equal(sim1, 1.0);
    assert.ok(sim2 < 1.0, `Expected similarity < 1.0 for different case, got ${sim2}`);
  });

});

describe('Combined Options', () => {

  test('returnAll: true + caseSensitive: true should work together', () => {
    const db = new Map([
      ['Hello World', 'Answer 1'],
      ['hello world', 'Answer 2'],
      ['HELLO WORLD', 'Answer 3'],
    ]);

    const matches = findBestMatch('Hello World', db, {
      returnAll: true,
      caseSensitive: true,
      threshold: 0,
    });

    assert.ok(Array.isArray(matches));
    assert.ok(matches.length > 0);

    // First match should be exact
    assert.equal(matches[0].question, 'Hello World');
    assert.equal(matches[0].score, 1.0);

    // Should be sorted by score
    for (let i = 1; i < matches.length; i++) {
      assert.ok(matches[i - 1].score >= matches[i].score);
    }
  });

  test('returnAll: true + custom threshold + caseSensitive: false', () => {
    const question = 'ЗАРПЛАТА';
    const matches = findBestMatch(question, qaDatabase, {
      returnAll: true,
      threshold: 0.3,
      caseSensitive: false,
    });

    assert.ok(Array.isArray(matches));

    for (const match of matches) {
      assert.ok(match.score >= 0.3);
      assert.ok(match.score <= 1.0);
    }
  });

});

describe('Threshold Behavior with New API', () => {

  test('threshold: 0 should return all questions', () => {
    const matches = findBestMatch('anything', qaDatabase, {
      returnAll: true,
      threshold: 0,
    });

    assert.ok(Array.isArray(matches));
    assert.equal(matches.length, qaDatabase.size);
  });

  test('threshold: 1 should only return exact matches', () => {
    const exactQuestion = 'Укажите ваши ожидания по заработной плате';
    const match = findBestMatch(exactQuestion, qaDatabase, { threshold: 1.0 });

    assert.ok(match);
    assert.equal(match.score, 1.0);

    const nonExactMatch = findBestMatch('Similar but not exact', qaDatabase, { threshold: 1.0 });
    assert.equal(nonExactMatch, null);
  });

  test('Different thresholds should return different numbers of results', () => {
    const question = 'зарплата';

    const lowThreshold = findBestMatch(question, qaDatabase, {
      returnAll: true,
      threshold: 0.2,
    });

    const highThreshold = findBestMatch(question, qaDatabase, {
      returnAll: true,
      threshold: 0.6,
    });

    assert.ok(Array.isArray(lowThreshold));
    assert.ok(Array.isArray(highThreshold));

    // Lower threshold should have more or equal results
    assert.ok(lowThreshold.length >= highThreshold.length);
  });

});
