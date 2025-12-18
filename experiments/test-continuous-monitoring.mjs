#!/usr/bin/env bun

/**
 * Test to demonstrate the continuous monitoring behavior
 * when no buttons are found on the current page
 */

console.log('Testing continuous monitoring behavior:\n');

// Simulate the main automation loop
async function simulateAutomation() {
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  let currentUrl = 'https://hh.ru/search/vacancy?resume=123&from=resumelist';
  let hasButtons = true;
  let iteration = 0;

  console.log('🚀 Starting automation...');
  console.log(`📍 Current URL: ${currentUrl}\n`);

  while (true) {
    iteration++;
    console.log(`\n--- Iteration ${iteration} ---`);

    if (hasButtons) {
      console.log('✅ Found buttons on page');
      console.log('🔄 Processing button...');
      await sleep(1000);

      // Simulate that after processing all buttons, none are left
      if (iteration === 2) {
        hasButtons = false;
        console.log('✅ All buttons on this page processed');
      }
    } else {
      console.log('💡 No more "Откликнуться" buttons on this page.');
      console.log('💡 You can manually navigate to another page');
      console.log('💡 The automation will continue once buttons are detected\n');

      // Wait loop - checking for URL changes
      const startUrl = currentUrl;
      let checkCount = 0;

      while (true) {
        checkCount++;
        await sleep(500);

        // Simulate manual navigation after 3 checks
        if (checkCount === 3) {
          currentUrl = 'https://hh.ru/search/vacancy?resume=123&page=11';
          hasButtons = true;
          console.log(`🔗 [URL CHANGE] ${startUrl} → ${currentUrl}`);
        }

        if (currentUrl !== startUrl) {
          console.log('✅ Detected URL change!');
          if (hasButtons) {
            console.log('✅ New page has buttons! Continuing automation...');
            break; // Exit wait loop
          }
        }

        if (checkCount % 2 === 0) {
          console.log(`⏳ Still waiting... (checked ${checkCount} times)`);
        }
      }

      console.log('🔄 Resuming main loop with new page...');
    }

    // Stop after demonstrating the behavior
    if (iteration === 3) {
      console.log('\n✅ Test completed! Script would continue indefinitely in real usage.');
      break;
    }
  }
}

simulateAutomation().catch(console.error);
