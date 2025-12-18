#!/usr/bin/env bun

/**
 * Test production qa.lino round-trip to find differences
 */

import { createQADatabase } from '../src/qa-database.mjs';
import fs from 'fs/promises';
import path from 'path';

const PRODUCTION_QA_FILE = path.join(process.cwd(), 'data', 'qa.lino');

async function main() {
  // Read original production file
  const originalContent = await fs.readFile(PRODUCTION_QA_FILE, 'utf8');
  console.log('Original file lines:', originalContent.split('\n').length);

  // Create a copy for testing
  const TEST_FILE = path.join(process.cwd(), 'data', 'qa-test-roundtrip.lino');
  await fs.writeFile(TEST_FILE, originalContent);

  const prodDB = createQADatabase(TEST_FILE);

  try {
    // Read all Q&A pairs
    const qaMap = await prodDB.readQADatabase();
    console.log('Q&A pairs:', qaMap.size);

    // Write them back
    await prodDB.writeQADatabase(qaMap);

    // Read the file again
    const newContent = await fs.readFile(TEST_FILE, 'utf8');
    console.log('New file lines:', newContent.split('\n').length);

    // Compare
    if (newContent === originalContent) {
      console.log('✅ Files are identical!');
    } else {
      console.log('❌ Files differ!');

      // Find differences
      const origLines = originalContent.split('\n');
      const newLines = newContent.split('\n');

      let diffCount = 0;
      const maxDiffs = 10;
      for (let i = 0; i < Math.max(origLines.length, newLines.length); i++) {
        if (origLines[i] !== newLines[i]) {
          diffCount++;
          if (diffCount <= maxDiffs) {
            console.log(`\n--- Diff at line ${i + 1} ---`);
            console.log('Original:', JSON.stringify(origLines[i]));
            console.log('New:', JSON.stringify(newLines[i]));
          }
        }
      }
      console.log(`\nTotal differences: ${diffCount} lines`);
    }
  } finally {
    // Clean up
    await fs.unlink(TEST_FILE);
  }
}

main().catch(console.error);
