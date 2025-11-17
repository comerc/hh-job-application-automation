/**
 * Q&A Database module using links-notation parser
 * Manages reading and writing Q&A pairs from qa.lino file
 */
import { Parser } from 'links-notation';
import fs from 'fs/promises';
import path from 'path';

const QA_FILE_PATH = path.join(process.cwd(), 'data', 'qa.lino');

// Lock management for preventing concurrent file access
const locks = new Map();

/**
 * Acquires a lock for a given key
 * @param {string} key - The lock key
 * @returns {Promise<void>}
 */
async function acquireLock(key) {
  while (locks.has(key)) {
    // Wait for the current lock to be released
    await locks.get(key);
  }

  // Create a new lock
  let releaseLock;
  const lockPromise = new Promise((resolve) => {
    releaseLock = resolve;
  });

  locks.set(key, lockPromise);

  // Return the release function
  return releaseLock;
}

/**
 * Releases a lock for a given key
 * @param {string} key - The lock key
 * @param {Function} releaseFn - The release function returned by acquireLock
 */
function releaseLock(key, releaseFn) {
  locks.delete(key);
  releaseFn();
}

/**
 * Reads Q&A pairs from qa.lino file
 * @returns {Promise<Map<string, string>>} Map of questions to answers
 */
export async function readQADatabase() {
  try {
    // Ensure data directory exists
    await fs.mkdir(path.dirname(QA_FILE_PATH), { recursive: true });

    // Try to read the file
    const content = await fs.readFile(QA_FILE_PATH, 'utf8');

    // Parse using links-notation
    const parser = new Parser();
    const links = parser.parse(content);

    // Extract Q&A pairs from parsed links
    // We look for links with _isFromPathCombination flag
    // which represent the parent-child relationship (question-answer)
    const qaMap = new Map();

    for (const link of links) {
      if (link._isFromPathCombination && link.values && link.values.length === 2) {
        // First value is the question, second is the answer
        const questionLink = link.values[0];
        const answerLink = link.values[1];

        // Reconstruct the question text
        const question = extractText(questionLink);
        const answer = extractText(answerLink);

        if (question && answer) {
          qaMap.set(question, answer);
        }
      }
    }

    return qaMap;
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist yet, return empty map
      return new Map();
    }
    console.error('Error reading Q&A database:', error);
    return new Map();
  }
}

/**
 * Writes Q&A pairs to qa.lino file
 * @param {Map<string, string>} qaMap - Map of questions to answers
 */
export async function writeQADatabase(qaMap) {
  try {
    // Ensure data directory exists
    await fs.mkdir(path.dirname(QA_FILE_PATH), { recursive: true });

    // Format as indented Q&A pairs
    const lines = [];
    for (const [question, answer] of qaMap.entries()) {
      lines.push(question);
      lines.push(`  ${answer}`);
    }

    const content = lines.join('\n') + '\n';
    await fs.writeFile(QA_FILE_PATH, content, 'utf8');
  } catch (error) {
    console.error('Error writing Q&A database:', error);
    throw error;
  }
}

/**
 * Adds or updates a Q&A pair in the database
 * Uses file locking to prevent race conditions and data loss
 * @param {string} question - The question
 * @param {string} answer - The answer
 */
export async function addOrUpdateQA(question, answer) {
  const lockKey = 'qa-database';
  const release = await acquireLock(lockKey);

  try {
    const qaMap = await readQADatabase();
    qaMap.set(question, answer);
    await writeQADatabase(qaMap);
  } finally {
    releaseLock(lockKey, release);
  }
}

/**
 * Gets the answer for a given question
 * @param {string} question - The question
 * @returns {Promise<string|null>} The answer, or null if not found
 */
export async function getAnswer(question) {
  const qaMap = await readQADatabase();
  return qaMap.get(question) || null;
}

/**
 * Extracts text from a Link object
 * Handles both simple links and compound links
 * @param {Link} link - The link to extract text from
 * @returns {string} The extracted text
 */
function extractText(link) {
  if (!link) return '';

  // If link has an id and no values, return the id
  if (link.id && (!link.values || link.values.length === 0)) {
    return link.id;
  }

  // If link has values but no id, reconstruct from values
  if (!link.id && link.values && link.values.length > 0) {
    return link.values.map(v => extractText(v)).join(' ');
  }

  // If link has both id and values, prefer id
  if (link.id) {
    return link.id;
  }

  return '';
}

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Edit distance
 */
function levenshteinDistance(a, b) {
  const matrix = [];

  // Initialize first column
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  // Initialize first row
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1,      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity score between two strings (0-1, where 1 is identical)
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Similarity score
 */
function stringSimilarity(a, b) {
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 1.0;

  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLength;
}

/**
 * Normalize a question string for comparison
 * @param {string} question - Question to normalize
 * @returns {string} Normalized question
 */
function normalizeQuestion(question) {
  return question
    .toLowerCase()
    .replace(/[.,!?;:]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ')     // Normalize whitespace
    .trim();
}

/**
 * Extract key words from a question
 * @param {string} question - Question string
 * @returns {Set<string>} Set of key words
 */
function extractKeywords(question) {
  // Common stopwords in Russian that don't carry much meaning
  const stopwords = new Set([
    'пожалуйста', 'свои', 'ваши', 'от', 'до', 'в', 'на', 'с', 'по',
    'о', 'об', 'и', 'а', 'но', 'или', 'то', 'как', 'что', 'это',
    'вы', 'ты', 'он', 'она', 'они', 'мы', 'я', 'к', 'для', 'при',
    'чуть', 'данный', 'момент',
  ]);

  const normalized = normalizeQuestion(question);
  const words = normalized.split(/\s+/);

  const keywords = new Set(
    words.filter(word => word.length > 2 && !stopwords.has(word)),
  );

  // Also extract word stems/roots for better matching
  // For example: "ожидания" -> "ожидан", "зарплатные" -> "зарплат"
  const stems = new Set();
  for (const word of keywords) {
    // Simple stemming: take first 5 chars for words longer than 6 chars
    if (word.length > 6) {
      stems.add(word.substring(0, 5));
    }
  }

  return new Set([...keywords, ...stems]);
}

/**
 * Calculate keyword overlap similarity
 * @param {string} a - First question
 * @param {string} b - Second question
 * @returns {number} Similarity score (0-1)
 */
function keywordSimilarity(a, b) {
  const keywordsA = extractKeywords(a);
  const keywordsB = extractKeywords(b);

  if (keywordsA.size === 0 && keywordsB.size === 0) return 1.0;
  if (keywordsA.size === 0 || keywordsB.size === 0) return 0.0;

  // Calculate Jaccard similarity
  const intersection = new Set([...keywordsA].filter(x => keywordsB.has(x)));
  const union = new Set([...keywordsA, ...keywordsB]);

  return intersection.size / union.size;
}

/**
 * Find the best matching question from a database using fuzzy matching
 * Issue #74: Questions may be phrased differently but mean the same thing
 * @param {string} question - Question to match
 * @param {Map<string, string>} qaDatabase - Q&A database
 * @param {number} threshold - Minimum similarity threshold (0-1), default 0.4
 * @returns {{question: string, answer: string, score: number} | null}
 */
export function findBestMatch(question, qaDatabase, threshold = 0.4) {
  // First try exact match for performance
  if (qaDatabase.has(question)) {
    return { question, answer: qaDatabase.get(question), score: 1.0 };
  }

  let bestMatch = null;
  let bestScore = threshold;

  for (const [dbQuestion, answer] of qaDatabase.entries()) {
    // Calculate combined similarity score
    const editSimilarity = stringSimilarity(
      normalizeQuestion(question),
      normalizeQuestion(dbQuestion),
    );
    const kwSimilarity = keywordSimilarity(question, dbQuestion);

    // Weight keyword similarity more heavily as it's more semantic
    // But also give some weight to edit distance for exact matches
    const combinedScore = (editSimilarity * 0.4) + (kwSimilarity * 0.6);

    if (combinedScore > bestScore) {
      bestScore = combinedScore;
      bestMatch = { question: dbQuestion, answer, score: combinedScore };
    }
  }

  return bestMatch;
}
