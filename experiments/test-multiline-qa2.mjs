#!/usr/bin/env node

/**
 * Experiment to understand multiline answer behavior with colons
 */

import { createQADatabase } from '../src/qa-database.mjs';
import fs from 'fs/promises';
import path from 'path';

const TEST_FILE = path.join(process.cwd(), 'data', 'test-qa-multiline2.lino');

async function main() {
  // Clean up test file
  try {
    await fs.unlink(TEST_FILE);
  } catch {
    // File doesn't exist, that's fine
  }

  const { addOrUpdateQA, getAnswer, filePath } = createQADatabase(TEST_FILE);

  console.log('Test file:', filePath);

  // Test 1: Multiline answer with colons (from passing test)
  const question1 = `How do I use
the system?`;
  const multilineAnswer = `Step 1: Read docs
Step 2: Try examples
Step 3: Experiment`;

  console.log('\n--- Test 1: Multiline answer with colons ---');
  console.log('Question:', JSON.stringify(question1));
  console.log('Answer:', JSON.stringify(multilineAnswer));

  await addOrUpdateQA(question1, multilineAnswer);

  // Check raw file content
  const rawContent = await fs.readFile(TEST_FILE, 'utf8');
  console.log('\n--- Raw file content ---');
  console.log(rawContent);

  // Get the answer back
  const retrieved = await getAnswer(question1);
  console.log('\n--- Retrieved answer ---');
  console.log('Type:', typeof retrieved);
  console.log('Is Array:', Array.isArray(retrieved));
  console.log('Value:', JSON.stringify(retrieved));
  console.log('Expected:', JSON.stringify(multilineAnswer));
  console.log('Match:', retrieved === multilineAnswer);
}

main().catch(console.error);
