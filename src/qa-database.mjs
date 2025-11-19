/**
 * Q&A Database module using links-notation parser
 * Manages reading and writing Q&A pairs from qa.lino file
 *
 * IMPORTANT: This module REQUIRES explicit file path configuration!
 * Use createQADatabase(filePath) to create an instance.
 */
import { Parser } from 'links-notation';
import fs from 'fs/promises';
import path from 'path';

/**
 * Creates a Q&A database instance with the specified file path
 * @param {string} filePath - REQUIRED: Path to the qa.lino file
 * @returns {Object} Q&A database instance with methods
 * @throws {Error} If filePath is not provided
 */
export function createQADatabase(filePath) {
  if (!filePath) {
    throw new Error(
      'CRITICAL: QA Database file path is REQUIRED!\n' +
      'Usage: createQADatabase("/path/to/qa.lino")\n' +
      'This prevents accidental usage without explicit path configuration.',
    );
  }

  const QA_FILE_PATH = filePath;

  // Lock management for preventing concurrent file access
  const locks = new Map();

  /**
   * Acquires a lock for a given key
   * @param {string} key - The lock key
   * @returns {Promise<Function>}
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
   * Issue #78: Add better error handling and backup recovery to prevent data loss
   * @returns {Promise<Map<string, string>>} Map of questions to answers
   */
  async function readQADatabase() {
    try {
      // Ensure data directory exists
      await fs.mkdir(path.dirname(QA_FILE_PATH), { recursive: true });

      // Try to read the file
      const content = await fs.readFile(QA_FILE_PATH, 'utf8');

      // Parse using links-notation
      const parser = new Parser();
      const links = parser.parse(content);

      // Extract Q&A pairs from parsed links
      const qaMap = new Map();

      for (const link of links) {
        if (link._isFromPathCombination && link.values && link.values.length === 2) {
          const question = extractText(link.values[0]);
          const answer = extractText(link.values[1]);

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

      // Issue #78: If parse error occurs, try to recover from backup
      if (error.message && error.message.includes('Parse error')) {
        console.error('Error reading Q&A database:', error);
        console.error('⚠️  Parse error detected! Attempting to recover from backup...');

        try {
          const backupPath = `${QA_FILE_PATH}.backup`;
          const backupContent = await fs.readFile(backupPath, 'utf8');
          const parser = new Parser();
          const links = parser.parse(backupContent);

          const qaMap = new Map();
          for (const link of links) {
            if (link._isFromPathCombination && link.values && link.values.length === 2) {
              const question = extractText(link.values[0]);
              const answer = extractText(link.values[1]);
              if (question && answer) {
                qaMap.set(question, answer);
              }
            }
          }

          console.error('✅ Successfully recovered data from backup!');
          // Restore the corrupted file with the backup
          await fs.copyFile(backupPath, QA_FILE_PATH);
          return qaMap;
        } catch (backupError) {
          console.error('❌ Could not recover from backup:', backupError.message);
          console.error('⚠️  WARNING: Q&A database is corrupted and could not be recovered!');
          console.error(`⚠️  Please manually fix ${QA_FILE_PATH} or restore from backup.`);
          return new Map();
        }
      }

      console.error('Error reading Q&A database:', error);
      return new Map();
    }
  }

  /**
   * Escapes a string for safe use in links-notation format
   * Issue #78: Quote strings with `:` and `()` to preserve literal text
   * Multiline support: Escape newlines as `\n` for proper storage
   * @param {string} str - String to escape
   * @returns {string} Escaped and quoted string if needed
   */
  function escapeForLinksNotation(str) {
    const hasColon = str.includes(':');
    const hasQuotes = str.includes('"') || str.includes("'");
    const hasParens = str.includes('(') || str.includes(')');
    const hasNewline = str.includes('\n');

    const needsQuoting = hasColon || hasQuotes || hasParens || hasNewline;

    if (needsQuoting) {
      const hasDoubleQuotes = str.includes('"');
      const hasSingleQuotes = str.includes("'");

      // IMPORTANT: Escape in correct order: backslash first, then newlines, then quotes
      // This prevents double-escaping
      let escaped = str.replace(/\\/g, '\\\\'); // \ -> \\
      escaped = escaped.replace(/\n/g, '\\n');  // newline -> \n

      if (hasDoubleQuotes && hasSingleQuotes) {
        // Has both - use double quotes and escape inner double quotes
        escaped = escaped.replace(/"/g, '\\"');
        return `"${escaped}"`;
      } else if (hasDoubleQuotes) {
        // Has double quotes - use single quotes to wrap
        return `'${escaped}'`;
      } else if (hasSingleQuotes) {
        // Has single quotes - use double quotes to wrap
        return `"${escaped}"`;
      } else {
        // No quotes - use double quotes
        return `"${escaped}"`;
      }
    }

    return str;
  }

  /**
   * Writes Q&A pairs to qa.lino file
   * Issue #78: Properly escape special characters to prevent parse errors
   * Creates a backup before writing
   * @param {Map<string, string>} qaMap - Map of questions to answers
   */
  async function writeQADatabase(qaMap) {
    try {
      // Ensure data directory exists
      await fs.mkdir(path.dirname(QA_FILE_PATH), { recursive: true });

      // Create backup of existing file before writing
      try {
        await fs.access(QA_FILE_PATH);
        const backupPath = `${QA_FILE_PATH}.backup`;
        await fs.copyFile(QA_FILE_PATH, backupPath);
      } catch {
        // File doesn't exist yet, no backup needed
      }

      // Format as indented Q&A pairs with proper escaping
      const lines = [];
      for (const [question, answer] of qaMap.entries()) {
        lines.push(escapeForLinksNotation(question));
        lines.push(`  ${escapeForLinksNotation(answer)}`);
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
   * Uses file locking to prevent race conditions
   * @param {string} question - The question
   * @param {string} answer - The answer
   */
  async function addOrUpdateQA(question, answer) {
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
  async function getAnswer(question) {
    const qaMap = await readQADatabase();
    return qaMap.get(question) || null;
  }

  /**
   * Unescapes a string from links-notation format
   * Converts escaped sequences back to their original characters
   * @param {string} str - String to unescape
   * @returns {string} Unescaped string
   */
  function unescapeFromLinksNotation(str) {
    if (!str) return str;

    // Unescape in reverse order of escaping: quotes first, then newlines, then backslashes
    let unescaped = str.replace(/\\"/g, '"');   // \" -> "
    unescaped = unescaped.replace(/\\n/g, '\n'); // \n -> newline
    unescaped = unescaped.replace(/\\\\/g, '\\'); // \\ -> \

    return unescaped;
  }

  /**
   * Extracts text from a Link object
   * @param {Object} link - The link to extract text from
   * @returns {string} The extracted text (with escape sequences converted back)
   */
  function extractText(link) {
    if (!link) return '';

    let text = '';

    if (link.id && (!link.values || link.values.length === 0)) {
      text = link.id;
    } else if (!link.id && link.values && link.values.length > 0) {
      text = link.values.map(v => extractText(v)).join(' ');
    } else if (link.id) {
      text = link.id;
    }

    // Unescape the text before returning
    return unescapeFromLinksNotation(text);
  }

  // Return the public API
  return {
    readQADatabase,
    writeQADatabase,
    addOrUpdateQA,
    getAnswer,
    filePath: QA_FILE_PATH,
  };
}

// Export utility functions that don't require file path
/**
 * Calculate Levenshtein distance between two strings
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Edit distance
 */
export function levenshteinDistance(a, b) {
  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity score between two strings (0-1)
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Similarity score
 */
export function stringSimilarity(a, b) {
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
export function normalizeQuestion(question) {
  return question
    .toLowerCase()
    .replace(/[.,!?;:]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract key words from a question
 * @param {string} question - Question string
 * @returns {Set<string>} Set of key words
 */
export function extractKeywords(question) {
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

  const stems = new Set();
  for (const word of keywords) {
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
export function keywordSimilarity(a, b) {
  const keywordsA = extractKeywords(a);
  const keywordsB = extractKeywords(b);

  if (keywordsA.size === 0 && keywordsB.size === 0) return 1.0;
  if (keywordsA.size === 0 || keywordsB.size === 0) return 0.0;

  const intersection = new Set([...keywordsA].filter(x => keywordsB.has(x)));
  const union = new Set([...keywordsA, ...keywordsB]);

  return intersection.size / union.size;
}

/**
 * Find the best matching question from a database using fuzzy matching
 * @param {string} question - Question to match
 * @param {Map<string, string>} qaDatabase - Q&A database
 * @param {number} threshold - Minimum similarity threshold (0-1)
 * @returns {{question: string, answer: string, score: number} | null}
 */
export function findBestMatch(question, qaDatabase, threshold = 0.4) {
  if (qaDatabase.has(question)) {
    return { question, answer: qaDatabase.get(question), score: 1.0 };
  }

  let bestMatch = null;
  let bestScore = threshold;

  for (const [dbQuestion, answer] of qaDatabase.entries()) {
    const editSimilarity = stringSimilarity(
      normalizeQuestion(question),
      normalizeQuestion(dbQuestion),
    );
    const kwSimilarity = keywordSimilarity(question, dbQuestion);

    const combinedScore = (editSimilarity * 0.4) + (kwSimilarity * 0.6);

    if (combinedScore > bestScore) {
      bestScore = combinedScore;
      bestMatch = { question: dbQuestion, answer, score: combinedScore };
    }
  }

  return bestMatch;
}
