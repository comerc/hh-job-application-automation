/**
 * Vacancy list processing module
 * Handles finding and clicking "Откликнуться" buttons in vacancy lists
 */

import { isNavigationError } from './browser-commander/index.js';
import { countUnansweredQuestions } from './qa.mjs';

/**
 * Handle limit error when detected
 * Closes modal, waits 1 hour, and refreshes the page
 */
export async function handleLimitError({ commander, START_URL }) {
  console.log('⚠️  Limit reached: 200 applications in 24 hours');
  console.log('💤 Waiting 1 hour before retrying...');

  const closeButtonCount = await commander.count({ selector: '[data-qa="response-popup-close"]' });
  if (closeButtonCount > 0) {
    await commander.clickButton({ selector: '[data-qa="response-popup-close"]' });
    console.log('✅ Closed the application modal');
  }

  const oneHourInMs = 60 * 60 * 1000;
  await commander.wait({ ms: oneHourInMs, reason: '200 application limit cooldown (1 hour)' });

  console.log('🔄 Refreshing the page after wait period...');
  // goto() will automatically stabilize before and after navigation
  await commander.goto({ url: START_URL });
}

/**
 * Process modal application form
 * Fills cover letter and handles test questions in modal
 */
export async function processModalApplication({
  commander,
  MESSAGE,
  verbose,
}) {
  // Check if textarea is already visible (cover letter might be mandatory)
  const modalTextareaSelector = 'textarea[data-qa="vacancy-response-popup-form-letter-input"]';
  let textareaVisible = false;
  try {
    const count = await commander.count({ selector: modalTextareaSelector });
    if (count > 0) {
      textareaVisible = await commander.isVisible({ selector: modalTextareaSelector });
    }
  } catch (error) {
    if (verbose) {
      console.log(`🔍 [VERBOSE] Error checking textarea visibility: ${error.message}`);
    }
  }

  // Only click toggle if textarea is not visible
  if (!textareaVisible) {
    // Click cover letter toggle
    let coverToggleSelector = null;
    let coverToggleCount = 0;

    // Try data-qa selectors first
    const coverDataQaSelectors = [
      '[data-qa="add-cover-letter"]',
      '[data-qa="vacancy-response-letter-toggle"]',
    ];

    for (const sel of coverDataQaSelectors) {
      const count = await commander.count({ selector: sel });
      if (count > 0) {
        coverToggleSelector = sel;
        coverToggleCount = count;
        break;
      }
    }

    // Fallback to text search
    if (coverToggleCount === 0) {
      const elementTypes = ['button', 'a'];
      for (const elementType of elementTypes) {
        coverToggleSelector = await commander.findByText({
          text: 'сопроводительное',
          selector: elementType,
        });
        coverToggleCount = await commander.count({ selector: coverToggleSelector });
        if (coverToggleCount > 0) {
          break;
        }
      }
    }

    if (coverToggleCount > 0) {
      if (verbose) {
        const text = await commander.textContent({ selector: coverToggleSelector });
        const dataQa = await commander.getAttribute({ selector: coverToggleSelector, attribute: 'data-qa' });
        console.log(`🔍 [VERBOSE] Clicking cover letter toggle: text="${text?.trim()}", data-qa="${dataQa}"`);
      }
      try {
        await commander.clickButton({ selector: coverToggleSelector, scrollIntoView: false });
        console.log('✅ Clicked cover letter toggle');
      } catch (error) {
        console.log(`⚠️  Could not click toggle: ${error.message}`);
        console.log('💡 Cover letter section may already be expanded');
      }
    } else {
      console.log('💡 Cover letter toggle not found, section may already be expanded');
    }
  } else {
    console.log('💡 Cover letter textarea already visible, skipping toggle click');
  }

  // Fill cover letter in modal
  const filled = await commander.fillTextArea({
    selector: 'textarea[data-qa="vacancy-response-popup-form-letter-input"]',
    text: MESSAGE,
    checkEmpty: true,
    scrollIntoView: false,
    simulateTyping: true,
  });
  if (filled) {
    console.log(`✅ ${commander.engine}: typed message successfully`);
  } else {
    console.log(`⏭️  ${commander.engine}: textarea already contains text, skipping typing to prevent double entry`);
  }

  // Verify textarea value
  const textareaValue = await commander.inputValue({
    selector: 'textarea[data-qa="vacancy-response-popup-form-letter-input"]',
  });
  if (textareaValue === MESSAGE) {
    console.log(`✅ ${commander.engine}: verified textarea contains target message`);
  } else {
    console.error(`❌ ${commander.engine}: textarea value does not match expected message`);
    console.error('Expected:', MESSAGE);
    console.error('Actual:', textareaValue);
  }

  // Check for UNANSWERED test questions in modal (after potential auto-fill)
  // Count unanswered questions in modal using qa.mjs
  const modalStats = await countUnansweredQuestions({
    evaluate: commander.evaluate,
    containerSelector: 'form#RESPONSE_MODAL_FORM_ID[name="vacancy_response"]',
  });
  const modalUnansweredTestQuestionCount = modalStats.unansweredCount;

  if (modalUnansweredTestQuestionCount > 0) {
    console.log(`⚠️  Found ${modalUnansweredTestQuestionCount} UNANSWERED test question(s) in modal`);
    console.log('💡 Skipping this vacancy - cannot auto-submit when test questions remain unanswered');

    // Close the modal
    const closeButtonCount = await commander.count({ selector: '[data-qa="response-popup-close"]' });
    if (closeButtonCount > 0) {
      await commander.clickButton({ selector: '[data-qa="response-popup-close"]' });
      console.log('✅ Closed the application modal');
    }

    await commander.wait({ ms: 1000, reason: 'modal to close' });
    return { success: false, reason: 'unanswered_questions' };
  }

  // Check if submit button exists and its state
  const submitButtonSelector = '[data-qa="vacancy-response-submit-popup"]';
  let buttonState = { found: false };
  try {
    const evalResult = await commander.safeEvaluate({
      fn: (sel) => {
        const el = document.querySelector(sel);
        if (!el) return { found: false };
        return {
          found: true,
          disabled: el.hasAttribute('disabled') || el.classList.contains('disabled'),
          visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
          text: el.textContent?.trim(),
        };
      },
      args: [submitButtonSelector],
      defaultValue: { found: false },
      operationName: 'submit button state check',
    });
    if (evalResult.navigationError) {
      console.log('⚠️  Navigation detected while checking submit button, continuing...');
      return { success: false, reason: 'navigation_detected' };
    }
    buttonState = evalResult.value;
  } catch (error) {
    if (isNavigationError(error)) {
      console.log('⚠️  Navigation detected while checking submit button, continuing...');
      return { success: false, reason: 'navigation_detected' };
    }
    throw error;
  }

  if (verbose) {
    console.log('🔍 [VERBOSE] Submit button state:', JSON.stringify(buttonState, null, 2));
  }

  if (!buttonState.found) {
    console.error('❌ Submit button not found in modal!');
    console.error(`   Tried selector: ${submitButtonSelector}`);

    try {
      const modalText = await commander.evaluate({
        fn: () => {
          const form = document.querySelector('form#RESPONSE_MODAL_FORM_ID[name="vacancy_response"]');
          return form ? form.innerText : 'Could not find modal';
        },
      });
      console.error('📋 Modal content:');
      console.error(modalText);
    } catch {
      console.error('⚠️  Could not extract modal content');
    }

    console.error('💡 Closing modal and skipping this vacancy...');

    // Close the modal
    const closeButtonCount = await commander.count({ selector: '[data-qa="response-popup-close"]' });
    if (closeButtonCount > 0) {
      await commander.clickButton({ selector: '[data-qa="response-popup-close"]' });
      console.log('✅ Closed the application modal');
    }

    await commander.wait({ ms: 1000, reason: 'modal to close' });
    return { success: false, reason: 'button_not_found' };
  }

  if (buttonState.disabled) {
    console.error('❌ Application button is still disabled after entering the message!');
    console.error(`   Button text: "${buttonState.text}"`);

    try {
      const modalText = await commander.evaluate({
        fn: () => {
          const form = document.querySelector('form#RESPONSE_MODAL_FORM_ID[name="vacancy_response"]');
          return form ? form.innerText : 'Could not find modal';
        },
      });

      console.error('📋 Reason from modal:');
      console.error(modalText);
    } catch {
      console.error('⚠️  Could not extract detailed error message from modal');
    }

    console.error('');
    console.error('💡 Closing modal and skipping this vacancy...');

    // Close the modal
    const closeButtonCount = await commander.count({ selector: '[data-qa="response-popup-close"]' });
    if (closeButtonCount > 0) {
      await commander.clickButton({ selector: '[data-qa="response-popup-close"]' });
      console.log('✅ Closed the application modal');
    }

    await commander.wait({ ms: 1000, reason: 'modal to close' });
    return { success: false, reason: 'button_disabled' };
  }

  // Click submit button with timeout handling
  try {
    await commander.clickButton({
      selector: submitButtonSelector,
      scrollIntoView: false,
      timeout: 10000,
    });
    console.log(`✅ ${commander.engine}: clicked submit button`);
  } catch (error) {
    console.error(`❌ Failed to click submit button: ${error.message}`);
    console.error('💡 Closing modal and skipping this vacancy...');

    // Close the modal
    const closeButtonCount = await commander.count({ selector: '[data-qa="response-popup-close"]' });
    if (closeButtonCount > 0) {
      await commander.clickButton({ selector: '[data-qa="response-popup-close"]' });
      console.log('✅ Closed the application modal');
    }

    await commander.wait({ ms: 1000, reason: 'modal to close' });
    return { success: false, reason: 'click_failed' };
  }

  await commander.wait({ ms: 2000, reason: 'modal to close after submission' });

  return { success: true };
}

/**
 * Find and process vacancy buttons on the search page
 * Returns status about what was found and processed
 */
export async function findAndProcessVacancyButton({
  commander,
  MESSAGE,
  targetPagePattern,
  vacancyResponsePattern,
  handleVacancyResponsePage,
  waitForUrlCondition,
  START_URL,
  verbose,
  pageClosedByUser,
}) {
  // Check if we're still on a valid target page
  let currentPageUrl = commander.getUrl();
  if (!targetPagePattern.test(currentPageUrl)) {
    if (verbose) {
      console.log(`🔍 [VERBOSE] Not on target page, waiting for navigation: ${currentPageUrl}`);
    }
    return { status: 'not_on_target_page' };
  }

  // Find "Откликнуться" button using text selector
  const buttonSelector = await commander.findByText({ text: 'Откликнуться', selector: 'a' });
  const buttonCount = await commander.count({ selector: buttonSelector });

  if (buttonCount === 0) {
    // Double-check: maybe page is still loading
    if (verbose) {
      console.log('🔍 [VERBOSE] No buttons found, waiting for page to fully load...');
    }
    await commander.wait({ ms: 2000, reason: 'page to fully load' });

    // Try one more time
    const buttonSelector2 = await commander.findByText({ text: 'Откликнуться', selector: 'a' });
    const buttonCount2 = await commander.count({ selector: buttonSelector2 });

    if (buttonCount2 === 0) {
      return { status: 'no_buttons_found' };
    }

    if (verbose) {
      console.log(`🔍 [VERBOSE] Found ${buttonCount2} button(s) after waiting`);
    }
    return { status: 'retry_needed' };
  }

  console.log(`📋 Found ${buttonCount} "Откликнуться" button(s). Processing next button...`);

  // Check if first button is enabled before clicking
  const isEnabled = await commander.isEnabled({ selector: buttonSelector });

  if (!isEnabled) {
    console.log('⚠️  First button is disabled or loading, waiting 2 seconds...');
    await commander.wait({ ms: 2000, reason: 'button to become enabled' });
    return { status: 'button_disabled' };
  }

  // Log scroll position before any interaction
  if (verbose) {
    try {
      const scrollBefore = await commander.evaluate({
        fn: () => ({ x: window.scrollX, y: window.scrollY }),
      });
      console.log(`🔍 [VERBOSE] 1. Scroll BEFORE button click: x=${scrollBefore.x}, y=${scrollBefore.y}`);
    } catch (e) {
      if (isNavigationError(e)) {
        console.log('🔍 [VERBOSE] 1. Navigation detected during scroll check, continuing...');
        return { status: 'navigation_detected' };
      }
    }
  }

  // Click first button with smooth scrolling animation
  try {
    if (verbose) {
      console.log('🔍 [VERBOSE] 2. About to click button in list (scrollIntoView: true, smoothScroll: true)');
    }
    await commander.clickButton({
      selector: buttonSelector,
      scrollIntoView: true,
      smoothScroll: true,
      // waitAfterClick defaults to 1000ms in browser-commander
    });

    if (verbose) {
      console.log('🔍 [VERBOSE] 3. Button click completed + 1s wait after click (via waitAfterClick)');

      // Check state immediately after click
      const stateAfterClick = await commander.evaluate({
        fn: () => ({
          scrollX: window.scrollX,
          scrollY: window.scrollY,
          bodyPosition: document.body ? window.getComputedStyle(document.body).position : 'unknown',
          bodyTop: document.body ? document.body.style.top : 'unknown',
          bodyOverflow: document.body ? window.getComputedStyle(document.body).overflow : 'unknown',
          htmlOverflow: document.documentElement ? window.getComputedStyle(document.documentElement).overflow : 'unknown',
          hasModal: !!document.querySelector('[data-qa="modal-overlay"]'),
          hasForm: !!document.querySelector('form#RESPONSE_MODAL_FORM_ID'),
        }),
      });
      console.log('🔍 [VERBOSE] 4. State immediately after click:');
      console.log(`   - scroll: x=${stateAfterClick.scrollX}, y=${stateAfterClick.scrollY}`);
      console.log(`   - body.position: ${stateAfterClick.bodyPosition}`);
      console.log(`   - body.top: "${stateAfterClick.bodyTop}"`);
      console.log(`   - body.overflow: ${stateAfterClick.bodyOverflow}`);
      console.log(`   - html.overflow: ${stateAfterClick.htmlOverflow}`);
      console.log(`   - modal overlay exists: ${stateAfterClick.hasModal}`);
      console.log(`   - form exists: ${stateAfterClick.hasForm}`);
    }
  } catch (error) {
    if (isNavigationError(error)) {
      console.log('⚠️  Navigation detected during button click, continuing...');
      return { status: 'navigation_detected' };
    }
    console.log(`⚠️  Error clicking button: ${error.message}`);
    console.log('💡 Button might be disabled or modal is open, waiting 2 seconds and retrying...');
    await commander.wait({ ms: 2000, reason: 'retry after click error' });
    return { status: 'click_error' };
  }

  if (verbose) {
    console.log('🔍 [VERBOSE] 5. Waiting for modal to appear (or navigation to complete, 2 seconds)...');
  }

  // Just wait for modal to appear (or navigation to complete)
  await commander.wait({ ms: 2000, reason: 'modal to appear' });

  if (verbose) {
    try {
      const scrollAfterWait = await commander.evaluate({
        fn: () => ({ x: window.scrollX, y: window.scrollY }),
      });
      console.log(`🔍 [VERBOSE] 6. Scroll AFTER 2s wait: x=${scrollAfterWait.x}, y=${scrollAfterWait.y}`);
    } catch (e) {
      console.log(`🔍 [VERBOSE] 6. Could not check scroll (page may have navigated): ${e.message}`);
    }
    console.log('🔍 [VERBOSE] 7. Waiting for delayed redirects (2 more seconds)...');
  }

  await commander.wait({ ms: 2000, reason: 'delayed redirects to complete' });

  if (verbose) {
    try {
      const scrollFinal = await commander.evaluate({
        fn: () => ({ x: window.scrollX, y: window.scrollY }),
      });
      console.log(`🔍 [VERBOSE] 8. Scroll AFTER 4s total wait: x=${scrollFinal.x}, y=${scrollFinal.y}`);
    } catch (e) {
      console.log(`🔍 [VERBOSE] 8. Could not check scroll (page may have navigated): ${e.message}`);
    }
  }

  const currentUrl = commander.getUrl();

  if (!targetPagePattern.test(currentUrl)) {
    console.log('⚠️  Redirected to a different page:', currentUrl);

    if (vacancyResponsePattern.test(currentUrl)) {
      console.log('💡 This is a vacancy_response page, handling automatically...');
      await handleVacancyResponsePage();

      await commander.wait({ ms: 2000, reason: 'potential redirect or manual navigation' });

      const newUrl = commander.getUrl();
      if (targetPagePattern.test(newUrl)) {
        console.log('✅ Back on search page after submission');
        await commander.wait({ ms: 1000, reason: 'page to fully load' });
        return { status: 'vacancy_response_handled' };
      } else if (vacancyResponsePattern.test(newUrl)) {
        console.log('💡 Waiting for you to complete and navigate back to:', START_URL);

        const waitResult = await waitForUrlCondition(START_URL, 'Waiting for you to return to the target page');
        if (pageClosedByUser()) {
          return { status: 'page_closed' };
        }

        if (waitResult === 'redirect_needed') {
          return { status: 'redirect_needed' };
        } else {
          console.log('✅ Returned to target page! Continuing with button loop...');
        }

        await commander.wait({ ms: 1000, reason: 'page to fully load after navigation' });
        return { status: 'returned_to_target' };
      }
    } else {
      console.log('💡 This appears to be a separate application form page.');
      console.log('💡 Please fill out the form manually. Take as much time as you need.');
      console.log('💡 Once done, navigate back to:', START_URL);

      await waitForUrlCondition(START_URL, 'Waiting for you to return to the target page');

      if (pageClosedByUser()) {
        return { status: 'page_closed' };
      }

      console.log('✅ Returned to target page! Continuing with button loop...');
      await commander.wait({ ms: 1000, reason: 'page to fully load after manual navigation' });
      return { status: 'manual_form_completed' };
    }
  }

  // Wait for modal
  let modalAppeared = false;
  try {
    if (verbose) {
      try {
        const scrollBeforeModal = await commander.evaluate({
          fn: () => ({ x: window.scrollX, y: window.scrollY }),
        });
        console.log(`🔍 [VERBOSE] 9. Scroll BEFORE waiting for modal selector: x=${scrollBeforeModal.x}, y=${scrollBeforeModal.y}`);
      } catch (e) {
        console.log(`🔍 [VERBOSE] 9. Could not check scroll: ${e.message}`);
      }
      console.log('🔍 [VERBOSE] 10. Waiting for modal selector: form#RESPONSE_MODAL_FORM_ID...');
    }
    await commander.waitForSelector({
      selector: 'form#RESPONSE_MODAL_FORM_ID[name="vacancy_response"]',
      visible: true,
      timeout: 10000,
    });
    modalAppeared = true;
    if (verbose) {
      try {
        const scrollAfterModal = await commander.evaluate({
          fn: () => ({ x: window.scrollX, y: window.scrollY }),
        });
        console.log('🔍 [VERBOSE] 11. Modal selector found');
        console.log(`🔍 [VERBOSE] 12. Scroll AFTER modal appeared: x=${scrollAfterModal.x}, y=${scrollAfterModal.y}`);
      } catch (e) {
        console.log(`🔍 [VERBOSE] 11-12. Modal found but could not check scroll: ${e.message}`);
      }
    }
  } catch {
    console.log('⚠️  Modal did not appear within timeout. This may be a different type of vacancy response.');
    console.log('💡 Skipping this button and moving to the next one...');
    return { status: 'modal_timeout' };
  }

  if (!modalAppeared) {
    return { status: 'modal_not_appeared' };
  }

  // Check for limit error
  const limitErrorCount = await commander.count({
    selector: '[data-qa-popup-error-code="negotiations-limit-exceeded"]',
  });

  if (limitErrorCount > 0) {
    return { status: 'limit_error' };
  }

  // Process modal application
  const result = await processModalApplication({
    commander,
    MESSAGE,
    verbose,
  });

  if (!result.success) {
    return { status: 'modal_processing_failed', reason: result.reason };
  }

  // Check if submission was successful or if limit error appeared
  const limitErrorAfterSubmit = await commander.count({
    selector: '[data-qa-popup-error-code="negotiations-limit-exceeded"]',
  });

  if (limitErrorAfterSubmit > 0) {
    return { status: 'limit_error_after_submit' };
  }

  return { status: 'success' };
}

/**
 * Wait for buttons to appear after page navigation
 */
export async function waitForButtonsAfterNavigation({
  commander,
  pageClosedByUser,
  verbose,
}) {
  console.log('💡 No more "Откликнуться" buttons on this page.');
  console.log('💡 You can manually navigate to another page (e.g., change filters, go to next page)');
  console.log('💡 The automation will continue once buttons are detected on the new page.');

  // Wait and keep checking for URL changes or new buttons
  const startUrl = commander.getUrl();
  let checkCount = 0;

  while (true) {
    if (pageClosedByUser()) {
      return { status: 'page_closed' };
    }

    await commander.wait({ ms: 2000, reason: 'checking for manual navigation or new buttons' });

    const newUrl = commander.getUrl();

    // Check if URL changed (manual navigation)
    if (newUrl !== startUrl) {
      if (verbose) {
        console.log(`🔍 [VERBOSE] URL changed from ${startUrl} to ${newUrl}`);
      }

      // Check if new page has buttons
      const newButtonSelector = await commander.findByText({ text: 'Откликнуться', selector: 'a' });
      const newButtonCount = await commander.count({ selector: newButtonSelector });

      if (newButtonCount > 0) {
        console.log(`✅ Detected ${newButtonCount} button(s) on new page! Continuing automation...`);
        return { status: 'buttons_found' };
      } else {
        if (verbose) {
          console.log('🔍 [VERBOSE] New page has no buttons, continuing to wait...');
        }
      }
    } else {
      // Same URL, check if buttons appeared (e.g., dynamic content loaded)
      const samePageButtonSelector = await commander.findByText({ text: 'Откликнуться', selector: 'a' });
      const samePageButtonCount = await commander.count({ selector: samePageButtonSelector });

      if (samePageButtonCount > 0) {
        console.log(`✅ Detected ${samePageButtonCount} button(s) appeared on same page! Continuing automation...`);
        return { status: 'buttons_found' };
      }
    }

    checkCount++;
    if (checkCount % 5 === 0 && verbose) {
      console.log(`🔍 [VERBOSE] Still waiting... (checked ${checkCount} times)`);
    }
  }
}
