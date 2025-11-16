#!/usr/bin/env node
import { addOrUpdateQA, readQADatabase } from '../src/qa-database.mjs';
import fs from 'fs/promises';

// Clean up
await fs.rm('./data', { recursive: true, force: true });

// Test empty string
await addOrUpdateQA('Empty answer?', '');

const result = await readQADatabase();
const answer = result.get('Empty answer?');

console.log('Answer type:', typeof answer);
console.log('Answer value:', JSON.stringify(answer));
console.log('Answer is null:', answer === null);
console.log('Answer is empty string:', answer === '');
console.log('Answer is undefined:', answer === undefined);

// Clean up
await fs.rm('./data', { recursive: true, force: true });
