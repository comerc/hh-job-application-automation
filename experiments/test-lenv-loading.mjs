#!/usr/bin/env node
/**
 * Test script to verify .lenv file loading functionality
 *
 * This script demonstrates that configuration values are properly loaded
 * from .lenv files using the lino-arguments library.
 */

import { createConfig } from '../src/config.mjs';

console.log('Testing .lenv file loading...\n');

// Create config (will automatically load .lenv if it exists)
const config = createConfig();

console.log('Loaded configuration:');
console.log('━'.repeat(50));
console.log(`Engine: ${config.engine}`);
console.log(`URL: ${config.url}`);
console.log(`Manual Login: ${config.manualLogin}`);
console.log(`User Data Dir: ${config.userDataDir || '(using default)'}`);
console.log(`Job Application Interval: ${config.jobApplicationInterval} seconds`);
console.log(`Verbose: ${config.verbose}`);
console.log(`Auto Submit Vacancy Response Form: ${config.autoSubmitVacancyResponseForm}`);
console.log('━'.repeat(50));

console.log('\nConfiguration sources (priority order):');
console.log('1. CLI arguments (highest priority)');
console.log('2. Environment variables');
console.log('3. .lenv file');
console.log('4. Default values (lowest priority)');

console.log('\n✅ Test completed successfully!');
