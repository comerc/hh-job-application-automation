#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';

const filePath = 'src/vacancy-response.mjs';
let content = readFileSync(filePath, 'utf-8');

// Count original occurrences
const originalCount = (content.match(/if \(verbose\)/g) || []).length;
console.log(`Found ${originalCount} verbose checks`);

// Replace all console.log with [VERBOSE] prefix to remove the prefix
content = content.replace(/console\.log\(`🔍 \[VERBOSE\] /g, 'console.log(`🔍 ');
content = content.replace(/console\.log\('🔍 \[VERBOSE\] /g, "console.log('🔍 ");
content = content.replace(/console\.log\(\`🔍 \[VERBOSE\] /g, 'console.log(`🔍 ');

// Replace simple single-line patterns
// Using template literals
content = content.replace(
  /if \(verbose\) \{\s*console\.log\((`[^`]+`)\);\s*\}/g,
  'log.debug(() => $1);',
);

// Using single quotes
content = content.replace(
  /if \(verbose\) \{\s*console\.log\(('[^']+')\);\s*\}/g,
  'log.debug(() => $1);',
);

// Multi-line patterns - template literals
content = content.replace(
  /if \(verbose\) \{\s*\n\s*console\.log\((`[^`]+`)\);\s*\n\s*\}/g,
  'log.debug(() => $1);',
);

// Multi-line patterns - single quotes
content = content.replace(
  /if \(verbose\) \{\s*\n\s*console\.log\(('[^']+')\);\s*\n\s*\}/g,
  'log.debug(() => $1);',
);

// Count remaining
const remainingCount = (content.match(/if \(verbose\)/g) || []).length;
console.log(`Replaced ${originalCount - remainingCount} simple patterns`);
console.log(`${remainingCount} complex patterns remaining (need manual replacement)`);

writeFileSync(filePath, content, 'utf-8');
console.log('✅ File updated');
