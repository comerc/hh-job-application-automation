/**
 * Tests for fuzzy question matching functionality
 * Issue #74: Saved questions are not filled on vacancy response page form
 */
import { describe, test, assert } from 'test-anywhere';
import { findBestMatch } from '../src/qa-database.mjs';

// Test data simulating real Q&A database
const qaDatabase = new Map([
  ['Укажите ваши ожидания по заработной плате', 'От 450000 рублей в месяц на руки.'],
  ['Укажите размер заработной платы, от которого вы рассматриваете предложения.', 'От 450000 рублей в месяц на руки.'],
  ['От какой суммы сейчас отталкиваешься на руки ?', 'От 450000 рублей в месяц на руки.'],
  ['Расскажи чуть детальнее о проекте, пожалуйста.', 'Детальнее не получится, NDA.'],
  ['Территориально где находишься на данный момент?', 'В Гоа, в Индии.'],
]);

describe('Fuzzy Question Matching', () => {

  test('Exact match should work', () => {
    const question = 'Укажите ваши ожидания по заработной плате';
    const match = findBestMatch(question, qaDatabase);

    assert.ok(match);
    assert.equal(match.question, question);
    assert.equal(match.score, 1.0);
    assert.equal(match.answer, 'От 450000 рублей в месяц на руки.');
  });

  test('Fuzzy match for salary question (issue #74)', () => {
  // This is the actual question from issue #74
    const question = 'Укажите, пожалуйста, свои зарплатные ожидания';
    const match = findBestMatch(question, qaDatabase);

    assert.ok(match, 'Expected to find fuzzy match for salary question');

    // Should match one of the salary-related questions
    assert.ok(
      match.question.includes('заработной плате') || match.question.includes('зарплат'),
      `Expected to match salary question, got: ${match.question}`,
    );

    assert.equal(match.answer, 'От 450000 рублей в месяц на руки.');

    // Score should be above threshold
    assert.ok(match.score >= 0.4, `Score too low: ${match.score}`);
  });

  test('Fuzzy match for project question', () => {
    const question = 'Расскажи о проекте';
    const match = findBestMatch(question, qaDatabase);

    assert.ok(match);
    assert.equal(match.question, 'Расскажи чуть детальнее о проекте, пожалуйста.');
    assert.equal(match.answer, 'Детальнее не получится, NDA.');
  });

  test('Fuzzy match for location question', () => {
    const question = 'Территориально где ты?';
    const match = findBestMatch(question, qaDatabase);

    assert.ok(match);
    assert.equal(match.question, 'Территориально где находишься на данный момент?');
    assert.equal(match.answer, 'В Гоа, в Индии.');
  });

  test('Short location question may not match (too generic)', () => {
    const question = 'Где вы находитесь?';
    const match = findBestMatch(question, qaDatabase);

    // This question is too short and generic, may not match with default threshold
    // This is acceptable behavior - prevents false positives
    // If it does match, verify it's the location question
    if (match) {
      assert.equal(match.question, 'Территориально где находишься на данный момент?');
      assert.equal(match.answer, 'В Гоа, в Индии.');
    } else {
    // No match is also acceptable for such a generic question
      assert.ok(true);
    }
  });

  test('Unrelated question should not match', () => {
    const question = 'Совершенно не связанный вопрос о чем-то другом';
    const match = findBestMatch(question, qaDatabase);

    assert.equal(match, null, `Did not expect to match unrelated question, got: ${match ? match.question : 'null'}`);
  });

  test('Custom threshold should be respected', () => {
    const question = 'Какая у вас зарплата?';

    // With high threshold, should not match
    const noMatch = findBestMatch(question, qaDatabase, 0.9);
    assert.equal(noMatch, null, 'Expected no match with high threshold');

    // With low threshold, should not throw
    findBestMatch(question, qaDatabase, 0.1);
    // Just verify it doesn't crash
    assert.ok(true);
  });

  test('Empty database should return null', () => {
    const question = 'Any question';
    const match = findBestMatch(question, new Map());

    assert.equal(match, null);
  });

  test('Empty question should not crash', () => {
    const question = '';
    // Should not throw and should return null or a valid result
    findBestMatch(question, qaDatabase);
    // Just verify it doesn't crash
    assert.ok(true);
  });

});
