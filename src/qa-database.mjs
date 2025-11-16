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
