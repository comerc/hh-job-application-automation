/**
 * Test experiment for direct application modal detection and skip
 *
 * This experiment tests the logic for detecting and skipping vacancies
 * that use direct applications (external employer sites).
 *
 * Run with: node experiments/test-direct-application-skip.js
 */

// Mock commander object with the necessary methods
const createMockCommander = ({ hasDirectApplicationModal = false }) => {
  return {
    count: async ({ selector }) => {
      console.log(`[Mock] count called with selector: ${selector}`);
      if (selector === '[data-qa="vacancy-response-link-advertising-cancel"]') {
        return hasDirectApplicationModal ? 1 : 0;
      }
      return 0;
    },
    clickButton: async ({ selector, scrollIntoView }) => {
      console.log(`[Mock] clickButton called with selector: ${selector}, scrollIntoView: ${scrollIntoView}`);
    },
    wait: async ({ ms, reason }) => {
      console.log(`[Mock] wait called: ${ms}ms for ${reason}`);
    },
  };
};

// Mock SELECTORS
const SELECTORS = {
  directApplicationCancelButton: '[data-qa="vacancy-response-link-advertising-cancel"]',
};

// Mock log
const log = {
  debug: (_fn) => {
    // Only log if verbose
    // console.log('[DEBUG]', _fn());
  },
};

// The function under test
async function checkAndSkipDirectApplicationModal({ commander }) {
  try {
    // Check if the direct application modal is present
    // This modal appears for vacancies that redirect to external employer sites
    const cancelButtonCount = await commander.count({ selector: SELECTORS.directApplicationCancelButton });

    if (cancelButtonCount > 0) {
      console.log('⚠️  Detected direct application modal (external site application)');
      console.log('   This vacancy requires application on the employer\'s website');
      console.log('   Clicking cancel button to skip this vacancy...');

      // Click the cancel button to close the modal and skip this vacancy
      await commander.clickButton({
        selector: SELECTORS.directApplicationCancelButton,
        scrollIntoView: true,
      });

      console.log('✅ Direct application modal closed, vacancy skipped');

      // Small wait to ensure the modal is closed and page is ready
      await commander.wait({ ms: 1000, reason: 'direct application modal to close' });

      return true;
    }

    return false;
  } catch (error) {
    log.debug(() => `Error checking for direct application modal: ${error.message}`);
    return false;
  }
}

// Test cases
async function runTests() {
  console.log('=== Test 1: Direct application modal is present ===');
  const commander1 = createMockCommander({ hasDirectApplicationModal: true });
  const result1 = await checkAndSkipDirectApplicationModal({ commander: commander1 });
  console.log(`Result: ${result1} (expected: true)`);
  console.log(result1 === true ? '✅ PASS' : '❌ FAIL');
  console.log();

  console.log('=== Test 2: Direct application modal is NOT present ===');
  const commander2 = createMockCommander({ hasDirectApplicationModal: false });
  const result2 = await checkAndSkipDirectApplicationModal({ commander: commander2 });
  console.log(`Result: ${result2} (expected: false)`);
  console.log(result2 === false ? '✅ PASS' : '❌ FAIL');
  console.log();

  console.log('=== All tests completed ===');
}

runTests().catch(console.error);
