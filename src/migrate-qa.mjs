#!/usr/bin/env node

/**
 * Migration script to normalize qa.lino format
 *
 * Rules:
 * 1. Single-line answers: Just one indented line
 * 2. Multi-line text: Use quotes "...", '...', or (...)
 * 3. Multiple options (checkboxes): Each on separate line, no quotes
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const QA_FILE = path.join(__dirname, '..', 'data', 'qa.lino');

function parseQAFile(content) {
  const lines = content.split('\n');
  const entries = [];
  let currentQuestion = null;
  let currentAnswers = [];
  let inQuotedQuestion = false;
  let inQuotedAnswer = false;
  let quoteChar = null;
  let multilineBuffer = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isIndented = line.startsWith('  ');

    // Handle multi-line quoted answers - preserve all content inside quotes
    if (inQuotedAnswer) {
      // Preserve the ENTIRE line as-is, don't remove indentation!
      // Content inside quotes should be preserved exactly
      multilineBuffer += '\n' + line;
      if (line.trimEnd().endsWith(quoteChar)) {
        inQuotedAnswer = false;
        currentAnswers.push(multilineBuffer);
        multilineBuffer = '';
        quoteChar = null;
      }
      continue;
    }

    // Handle multi-line quoted questions - preserve all content inside quotes
    if (inQuotedQuestion) {
      multilineBuffer += '\n' + line;
      if (line.trimEnd().endsWith(quoteChar)) {
        inQuotedQuestion = false;
        currentQuestion = multilineBuffer;
        multilineBuffer = '';
        quoteChar = null;
        currentAnswers = [];
      }
      continue;
    }

    // New question (not indented, not empty)
    if (!isIndented && line.trim()) {
      // Save previous question if exists
      if (currentQuestion) {
        entries.push({
          question: currentQuestion,
          answers: currentAnswers,
        });
      }

      // Check if question starts a quote
      const trimmed = line.trim();
      const firstChar = trimmed[0];
      if ((firstChar === '"' || firstChar === "'") && !trimmed.trimEnd().endsWith(firstChar)) {
        // Multi-line quoted question
        inQuotedQuestion = true;
        quoteChar = firstChar;
        multilineBuffer = line;
        currentQuestion = null;
      } else {
        // Regular question
        currentQuestion = line;
        currentAnswers = [];
      }
    }
    // Answer line (indented)
    else if (isIndented && line.trim()) {
      const answer = line.slice(2); // Remove only 2-space indentation, preserve rest

      // Check if this starts a multi-line quote
      const firstChar = answer[0];
      const trimmedAnswer = answer.trimEnd();
      if ((firstChar === '"' || firstChar === "'" || firstChar === '(') &&
          !trimmedAnswer.endsWith(firstChar === '(' ? ')' : firstChar)) {
        inQuotedAnswer = true;
        quoteChar = firstChar === '(' ? ')' : firstChar;
        multilineBuffer = answer;
      } else {
        currentAnswers.push(answer);
      }
    }
  }

  // Save last question
  if (currentQuestion) {
    entries.push({
      question: currentQuestion,
      answers: currentAnswers,
    });
  }

  return entries;
}

function normalizeEntries(entries) {
  return entries.map(entry => {
    // If only one answer and it's not a quoted string, keep as-is
    if (entry.answers.length === 1) {
      return entry;
    }

    // Multiple answers - these are checkbox options, keep separate
    return entry;
  });
}

function entriesToString(entries) {
  let result = '';

  for (const entry of entries) {
    result += entry.question + '\n';
    for (const answer of entry.answers) {
      result += '  ' + answer + '\n';
    }
  }

  return result;
}

async function migrate() {
  console.log('📖 Reading qa.lino file...');
  const content = fs.readFileSync(QA_FILE, 'utf-8');

  console.log('🔄 Parsing entries...');
  const entries = parseQAFile(content);
  console.log(`📊 Found ${entries.length} Q&A entries`);

  console.log('✨ Normalizing format...');
  const normalized = normalizeEntries(entries);

  console.log('💾 Writing normalized file...');
  const newContent = entriesToString(normalized);
  fs.writeFileSync(QA_FILE, newContent, 'utf-8');

  console.log('✅ Migration complete!');
  console.log(`   Normalized ${entries.length} entries`);
}

migrate().catch(error => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
