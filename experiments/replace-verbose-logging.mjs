#!/usr/bin/env node

/**
 * Script to replace verbose console.log patterns with log.debug() lazy evaluation
 */

import { readFile, writeFile } from 'fs/promises';

async function replaceVerboseLogging(filePath) {
  let content = await readFile(filePath, 'utf-8');

  // Pattern 1: if (verbose) { console.log('🔍 [VERBOSE] message'); }
  // Replace with: log.debug(() => '🔍 message');

  // Remove [VERBOSE] prefix from all console.log calls
  content = content.replace(/console\.log\(`🔍 \[VERBOSE\] /g, 'console.log(`🔍 ');
  content = content.replace(/console\.log\('🔍 \[VERBOSE\] /g, "console.log('🔍 ");

  // Replace simple if (verbose) { console.log(...); } patterns
  // Single line pattern
  content = content.replace(
    /if \(verbose\) \{\s*console\.log\(([^)]+)\);\s*\}/g,
    'log.debug(() => $1);',
  );

  // Multi-line pattern with one console.log
  content = content.replace(
    /if \(verbose\) \{\s*\n\s*console\.log\(([^)]+)\);\s*\n\s*\}/g,
    'log.debug(() => $1);',
  );

  await writeFile(filePath, content, 'utf-8');
  console.log(`✅ Replaced verbose logging in ${filePath}`);
}

const filePath = process.argv[2] || 'src/vacancy-response.mjs';
replaceVerboseLogging(filePath).catch(console.error);
