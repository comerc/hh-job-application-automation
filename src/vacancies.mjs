/**
 * Vacancy list processing module
 * Handles finding and clicking "Откликнуться" buttons in vacancy lists
 */

import { isNavigationError } from './browser-commander/index.js';
import { countUnansweredQuestions } from './qa.mjs';
import { closeModalIfPresent, checkAndCloseDirectApplicationModal } from './helpers/modal-helpers.mjs';
import { SELECTORS } from './hh-selectors.mjs';
import { log } from './logging.mjs';

/**
 * Handle limit error when detected
 * Closes modal, waits 1 hour, and refreshes the page
 */
export async function handleLimitError({ commander, START_URL }) {
  console.log('⚠️  Limit reached: 200 applications in 24 hours');
  console.log('💤 Waiting 1 hour before retrying...');

  const closed = await closeModalIfPresent({ commander });
  if (closed) {
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
    log.debug(() => `🔍 Error checking textarea visibility: ${error.message}`);
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
      // Log toggle details in debug mode
      const text = await commander.textContent({ selector: coverToggleSelector });
      const dataQa = await commander.getAttribute({ selector: coverToggleSelector, attribute: 'data-qa' });
      log.debug(() => `🔍 Clicking cover letter toggle: text="${text?.trim()}", data-qa="${dataQa}"`);
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
    containerSelector: SELECTORS.applicationForm,
  });
  const modalUnansweredTestQuestionCount = modalStats.unansweredCount;

  if (modalUnansweredTestQuestionCount > 0) {
    console.log(`⚠️  Found ${modalUnansweredTestQuestionCount} UNANSWERED test question(s) in modal`);
    console.log('💡 Skipping this vacancy - cannot auto-submit when test questions remain unanswered');

    // Close the modal using helper
    const closed = await closeModalIfPresent({ commander });
    if (closed) {
      console.log('✅ Closed the application modal');
    }
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

  log.debug(() => `🔍 Submit button state: ${JSON.stringify(buttonState, null, 2)}`);

  if (!buttonState.found) {
    console.error('❌ Submit button not found in modal!');
    console.error(`   Tried selector: ${submitButtonSelector}`);

    try {
      const formSelector = SELECTORS.applicationForm;
      const modalText = await commander.evaluate({
        fn: (selector) => {
          const form = document.querySelector(selector);
          return form ? form.innerText : 'Could not find modal';
        },
        args: [formSelector],
      });
      console.error('📋 Modal content:');
      console.error(modalText);
    } catch {
      console.error('⚠️  Could not extract modal content');
    }

    console.error('💡 Closing modal and skipping this vacancy...');

    // Close the modal using helper
    const closed = await closeModalIfPresent({ commander });
    if (closed) {
      console.log('✅ Closed the application modal');
    }
    return { success: false, reason: 'button_not_found' };
  }

  if (buttonState.disabled) {
    console.error('❌ Application button is still disabled after entering the message!');
    console.error(`   Button text: "${buttonState.text}"`);

    try {
      const formSelector = SELECTORS.applicationForm;
      const modalText = await commander.evaluate({
        fn: (selector) => {
          const form = document.querySelector(selector);
          return form ? form.innerText : 'Could not find modal';
        },
        args: [formSelector],
      });

      console.error('📋 Reason from modal:');
      console.error(modalText);
    } catch {
      console.error('⚠️  Could not extract detailed error message from modal');
    }

    console.error('');
    console.error('💡 Closing modal and skipping this vacancy...');

    // Close the modal using helper
    const closed = await closeModalIfPresent({ commander });
    if (closed) {
      console.log('✅ Closed the application modal');
    }
    return { success: false, reason: 'button_disabled' };
  }

  // Click submit button with timeout handling
  try {
    const clickResult = await commander.clickButton({
      selector: submitButtonSelector,
      scrollIntoView: false,
      timeout: 10000,
    });

    // Handle new return format {clicked, navigated}
    const clicked = typeof clickResult === 'object' ? clickResult.clicked : clickResult;
    if (!clicked) {
      console.log('⚠️  Click may have triggered navigation, continuing...');
    } else {
      console.log(`✅ ${commander.engine}: clicked submit button`);
    }
  } catch (error) {
    console.error(`❌ Failed to click submit button: ${error.message}`);
    console.error('💡 Closing modal and skipping this vacancy...');

    // Close the modal using helper
    const closed = await closeModalIfPresent({ commander });
    if (closed) {
      console.log('✅ Closed the application modal');
    }
    return { success: false, reason: 'click_failed' };
  }

  await commander.wait({ ms: 2000, reason: 'modal to close after submission' });

  return { success: true };
}

/**
 * Validate we're on the target page and handle early redirects
 * @param {Object} options
 * @param {Object} options.commander - Browser commander instance
 * @param {RegExp} options.targetPagePattern - Pattern to match target page URLs
 * @param {RegExp} options.vacancyResponsePattern - Pattern to match vacancy_response URLs
 * @param {Function} options.handleVacancyResponsePage - Handler for vacancy_response pages
 * @param {Function} options.waitForUrlCondition - Wait for URL condition function
 * @param {string} options.START_URL - Starting URL to return to
 * @param {Function} options.pageClosedByUser - Check if page was closed
 * @returns {Promise<{valid: boolean, status?: string}>}
 */
async function validateTargetPage({
  commander,
  targetPagePattern,
  vacancyResponsePattern,
  handleVacancyResponsePage,
  waitForUrlCondition,
  START_URL,
  pageClosedByUser,
}) {
  const currentPageUrl = commander.getUrl();
  if (!targetPagePattern.test(currentPageUrl)) {
    // Check if we're on a vacancy_response page - if so, handle it
    if (vacancyResponsePattern.test(currentPageUrl)) {
      console.log('💡 On vacancy_response page, handling automatically...');
      await handleVacancyResponsePage();

      // After handling, wait a bit for potential redirect
      await commander.wait({ ms: 2000, reason: 'potential redirect after vacancy response handling' });

      // Check if we're back on target page
      const newUrl = commander.getUrl();
      if (targetPagePattern.test(newUrl)) {
        console.log('✅ Back on search page after vacancy response handling');
        return { valid: false, status: 'vacancy_response_handled' };
      } else if (vacancyResponsePattern.test(newUrl)) {
        // Still on vacancy_response - user needs to complete manually
        console.log('💡 Still on vacancy_response page, waiting for user action...');
        const waitResult = await waitForUrlCondition(START_URL, 'Waiting for you to return to the target page');
        if (pageClosedByUser()) {
          return { valid: false, status: 'page_closed' };
        }
        if (waitResult === 'redirect_needed') {
          return { valid: false, status: 'redirect_needed' };
        }
        console.log('✅ Returned to target page after vacancy response');
        return { valid: false, status: 'returned_to_target' };
      } else {
        // Navigated somewhere else
        return { valid: false, status: 'not_on_target_page' };
      }
    }

    log.debug(() => `🔍 Not on target page, waiting for navigation: ${currentPageUrl}`);
    return { valid: false, status: 'not_on_target_page' };
  }

  return { valid: true };
}

/**
 * Find vacancy button on the page with retry logic
 * @param {Object} options
 * @param {Object} options.commander - Browser commander instance
 * @returns {Promise<{selector: string | null, count: number, status?: string}>}
 */
async function findVacancyButton({ commander }) {
  // Find "Откликнуться" button using text selector
  const buttonSelector = await commander.findByText({ text: 'Откликнуться', selector: 'a' });
  const buttonCount = await commander.count({ selector: buttonSelector });

  if (buttonCount === 0) {
    // Double-check: maybe page is still loading
    log.debug(() => '🔍 No buttons found, waiting for page to fully load...');
    await commander.wait({ ms: 2000, reason: 'page to fully load' });

    // Try one more time
    const buttonSelector2 = await commander.findByText({ text: 'Откликнуться', selector: 'a' });
    const buttonCount2 = await commander.count({ selector: buttonSelector2 });

    if (buttonCount2 === 0) {
      return { selector: null, count: 0, status: 'no_buttons_found' };
    }

    log.debug(() => `🔍 Found ${buttonCount2} button(s) after waiting`);
    return { selector: buttonSelector2, count: buttonCount2, status: 'retry_needed' };
  }

  console.log(`📋 Found ${buttonCount} "Откликнуться" button(s). Processing next button...`);
  return { selector: buttonSelector, count: buttonCount };
}

/**
 * Validate button is enabled and ready to click
 * @param {Object} options
 * @param {Object} options.commander - Browser commander instance
 * @param {string} options.selector - Button selector
 * @returns {Promise<{enabled: boolean, status?: string}>}
 */
async function validateButtonState({ commander, selector }) {
  const isEnabled = await commander.isEnabled({ selector });

  if (!isEnabled) {
    console.log('⚠️  First button is disabled or loading, waiting 2 seconds...');
    await commander.wait({ ms: 2000, reason: 'button to become enabled' });
    return { enabled: false, status: 'button_disabled' };
  }

  return { enabled: true };
}

/**
 * Execute button click with scroll handling and state tracking
 * @param {Object} options
 * @param {Object} options.commander - Browser commander instance
 * @param {string} options.selector - Button selector
 * @returns {Promise<{success: boolean, navigated: boolean, status?: string}>}
 */
async function executeButtonClick({ commander, selector }) {
  // Log scroll position before any interaction
  try {
    const scrollBefore = await commander.evaluate({
      fn: () => ({ x: window.scrollX, y: window.scrollY }),
    });
    log.debug(() => `🔍 1. Scroll BEFORE button click: x=${scrollBefore.x}, y=${scrollBefore.y}`);
  } catch (e) {
    if (isNavigationError(e)) {
      log.debug(() => '🔍 1. Navigation detected during scroll check, continuing...');
      return { success: false, navigated: true, status: 'navigation_detected' };
    }
  }

  // Click button with smooth scrolling animation
  try {
    log.debug(() => '🔍 2. About to click button in list (scrollIntoView: true, smoothScroll: true)');
    const clickResult = await commander.clickButton({
      selector,
      scrollIntoView: true,
      smoothScroll: true,
    });

    // Handle new return format {clicked, navigated}
    const navigated = typeof clickResult === 'object' ? clickResult.navigated : false;

    // If navigation happened, stop processing this page
    if (navigated) {
      console.log('⚠️  Navigation detected during button click, page ready');
      return { success: true, navigated: true, status: 'navigation_detected' };
    }

    log.debug(() => '🔍 3. Button click completed + 1s wait after click (via waitAfterClick)');

    // Check state immediately after click in debug mode
    try {
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
      log.debug(() => '🔍 4. State immediately after click:');
      log.debug(() => `   - scroll: x=${stateAfterClick.scrollX}, y=${stateAfterClick.scrollY}`);
      log.debug(() => `   - body.position: ${stateAfterClick.bodyPosition}`);
      log.debug(() => `   - body.top: "${stateAfterClick.bodyTop}"`);
      log.debug(() => `   - body.overflow: ${stateAfterClick.bodyOverflow}`);
      log.debug(() => `   - html.overflow: ${stateAfterClick.htmlOverflow}`);
      log.debug(() => `   - modal overlay exists: ${stateAfterClick.hasModal}`);
      log.debug(() => `   - form exists: ${stateAfterClick.hasForm}`);
    } catch (e) {
      log.debug(() => `🔍 4. Could not check state (page may have navigated): ${e.message}`);
    }

    return { success: true, navigated: false };
  } catch (error) {
    if (isNavigationError(error)) {
      console.log('⚠️  Navigation detected during button click, continuing...');
      return { success: false, navigated: true, status: 'navigation_detected' };
    }
    console.log(`⚠️  Error clicking button: ${error.message}`);
    console.log('💡 Button might be disabled or modal is open, waiting 2 seconds and retrying...');
    await commander.wait({ ms: 2000, reason: 'retry after click error' });
    return { success: false, navigated: false, status: 'click_error' };
  }
}

/**
 * Handle post-click navigation and redirects
 * @param {Object} options
 * @param {Object} options.commander - Browser commander instance
 * @param {RegExp} options.targetPagePattern - Pattern to match target page URLs
 * @param {RegExp} options.vacancyResponsePattern - Pattern to match vacancy_response URLs
 * @param {Function} options.handleVacancyResponsePage - Handler for vacancy_response pages
 * @param {Function} options.waitForUrlCondition - Wait for URL condition function
 * @param {string} options.START_URL - Starting URL to return to
 * @param {Function} options.pageClosedByUser - Check if page was closed
 * @returns {Promise<{onTargetPage: boolean, status?: string}>}
 */
async function handlePostClickNavigation({
  commander,
  targetPagePattern,
  vacancyResponsePattern,
  handleVacancyResponsePage,
  waitForUrlCondition,
  START_URL,
  pageClosedByUser,
}) {
  // Wait for modal to appear or navigation to complete
  log.debug(() => '🔍 5. Waiting for modal to appear (or navigation to complete, 2 seconds)...');
  await commander.wait({ ms: 2000, reason: 'modal to appear' });

  try {
    const scrollAfterWait = await commander.evaluate({
      fn: () => ({ x: window.scrollX, y: window.scrollY }),
    });
    log.debug(() => `🔍 6. Scroll AFTER 2s wait: x=${scrollAfterWait.x}, y=${scrollAfterWait.y}`);
  } catch (e) {
    log.debug(() => `🔍 6. Could not check scroll (page may have navigated): ${e.message}`);
  }

  // Wait for delayed redirects
  log.debug(() => '🔍 7. Waiting for delayed redirects (2 more seconds)...');
  await commander.wait({ ms: 2000, reason: 'delayed redirects to complete' });

  try {
    const scrollFinal = await commander.evaluate({
      fn: () => ({ x: window.scrollX, y: window.scrollY }),
    });
    log.debug(() => `🔍 8. Scroll AFTER 4s total wait: x=${scrollFinal.x}, y=${scrollFinal.y}`);
  } catch (e) {
    log.debug(() => `🔍 8. Could not check scroll (page may have navigated): ${e.message}`);
  }

  // Check if we're still on target page
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
        return { onTargetPage: false, status: 'vacancy_response_handled' };
      } else if (vacancyResponsePattern.test(newUrl)) {
        console.log('💡 Waiting for you to complete and navigate back to:', START_URL);

        const waitResult = await waitForUrlCondition(START_URL, 'Waiting for you to return to the target page');
        if (pageClosedByUser()) {
          return { onTargetPage: false, status: 'page_closed' };
        }

        if (waitResult === 'redirect_needed') {
          return { onTargetPage: false, status: 'redirect_needed' };
        } else {
          console.log('✅ Returned to target page! Continuing with button loop...');
        }

        await commander.wait({ ms: 1000, reason: 'page to fully load after navigation' });
        return { onTargetPage: false, status: 'returned_to_target' };
      }
    } else {
      console.log('💡 This appears to be a separate application form page.');
      console.log('💡 Please fill out the form manually. Take as much time as you need.');
      console.log('💡 Once done, navigate back to:', START_URL);

      await waitForUrlCondition(START_URL, 'Waiting for you to return to the target page');

      if (pageClosedByUser()) {
        return { onTargetPage: false, status: 'page_closed' };
      }

      console.log('✅ Returned to target page! Continuing with button loop...');
      await commander.wait({ ms: 1000, reason: 'page to fully load after manual navigation' });
      return { onTargetPage: false, status: 'manual_form_completed' };
    }
  }

  return { onTargetPage: true };
}

/**
 * Wait for application modal to appear and check for limit errors
 * @param {Object} options
 * @param {Object} options.commander - Browser commander instance
 * @returns {Promise<{appeared: boolean, limitError: boolean, directApplication?: boolean, status?: string}>}
 */
async function waitForApplicationModal({ commander }) {
  // Wait for modal
  let modalAppeared = false;
  try {
    try {
      const scrollBeforeModal = await commander.evaluate({
        fn: () => ({ x: window.scrollX, y: window.scrollY }),
      });
      log.debug(() => `🔍 9. Scroll BEFORE waiting for modal selector: x=${scrollBeforeModal.x}, y=${scrollBeforeModal.y}`);
    } catch (e) {
      log.debug(() => `🔍 9. Could not check scroll: ${e.message}`);
    }
    log.debug(() => `🔍 10. Waiting for modal selector: ${SELECTORS.applicationForm}...`);
    await commander.waitForSelector({
      selector: SELECTORS.applicationForm,
      visible: true,
      timeout: 10000,
    });
    modalAppeared = true;
    try {
      const scrollAfterModal = await commander.evaluate({
        fn: () => ({ x: window.scrollX, y: window.scrollY }),
      });
      log.debug(() => '🔍 11. Modal selector found');
      log.debug(() => `🔍 12. Scroll AFTER modal appeared: x=${scrollAfterModal.x}, y=${scrollAfterModal.y}`);
    } catch (e) {
      log.debug(() => `🔍 11-12. Modal found but could not check scroll: ${e.message}`);
    }
  } catch {
    // Modal form didn't appear, but we should still check for direct application modal
    // Direct application modals don't have the standard application form
    const directAppResult = await checkAndCloseDirectApplicationModal({ commander });
    if (directAppResult.isDirectApplication) {
      return { appeared: false, limitError: false, directApplication: true, status: 'direct_application' };
    }

    console.log('⚠️  Modal did not appear within timeout. This may be a different type of vacancy response.');
    console.log('💡 Skipping this button and moving to the next one...');
    return { appeared: false, limitError: false, status: 'modal_timeout' };
  }

  if (!modalAppeared) {
    return { appeared: false, limitError: false, status: 'modal_not_appeared' };
  }

  // Check if this is a direct application modal (application on external site)
  const directAppResult = await checkAndCloseDirectApplicationModal({ commander });
  if (directAppResult.isDirectApplication) {
    return { appeared: true, limitError: false, directApplication: true, status: 'direct_application' };
  }

  // Check for limit error
  const limitErrorCount = await commander.count({
    selector: '[data-qa-popup-error-code="negotiations-limit-exceeded"]',
  });

  if (limitErrorCount > 0) {
    return { appeared: true, limitError: true, status: 'limit_error' };
  }

  return { appeared: true, limitError: false };
}

/**
 * Submit modal application and check for post-submit errors
 * @param {Object} options
 * @param {Object} options.commander - Browser commander instance
 * @param {string} options.MESSAGE - Cover letter message
 * @returns {Promise<{success: boolean, limitError: boolean, status?: string, reason?: string}>}
 */
async function submitModalApplication({ commander, MESSAGE }) {
  // Process modal application
  const result = await processModalApplication({
    commander,
    MESSAGE,
  });

  if (!result.success) {
    return { success: false, limitError: false, status: 'modal_processing_failed', reason: result.reason };
  }

  // Check if submission was successful or if limit error appeared
  const limitErrorAfterSubmit = await commander.count({
    selector: '[data-qa-popup-error-code="negotiations-limit-exceeded"]',
  });

  if (limitErrorAfterSubmit > 0) {
    return { success: true, limitError: true, status: 'limit_error_after_submit' };
  }

  return { success: true, limitError: false };
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
  pageClosedByUser,
}) {
  // Check if we're still on a valid target page
  const pageValidation = await validateTargetPage({
    commander,
    targetPagePattern,
    vacancyResponsePattern,
    handleVacancyResponsePage,
    waitForUrlCondition,
    START_URL,
    pageClosedByUser,
  });

  if (!pageValidation.valid) {
    return { status: pageValidation.status };
  }

  // Find vacancy button
  const buttonResult = await findVacancyButton({ commander });

  if (!buttonResult.selector) {
    return { status: buttonResult.status };
  }

  if (buttonResult.status) {
    return { status: buttonResult.status };
  }

  const buttonSelector = buttonResult.selector;

  // Validate button state
  const stateValidation = await validateButtonState({ commander, selector: buttonSelector });

  if (!stateValidation.enabled) {
    return { status: stateValidation.status };
  }

  // Execute button click
  const clickResult = await executeButtonClick({ commander, selector: buttonSelector });

  if (!clickResult.success || clickResult.navigated) {
    return { status: clickResult.status };
  }

  // Handle post-click navigation
  const navigationResult = await handlePostClickNavigation({
    commander,
    targetPagePattern,
    vacancyResponsePattern,
    handleVacancyResponsePage,
    waitForUrlCondition,
    START_URL,
    pageClosedByUser,
  });

  if (!navigationResult.onTargetPage) {
    return { status: navigationResult.status };
  }

  // Wait for modal to appear
  const modalResult = await waitForApplicationModal({ commander });

  if (modalResult.directApplication) {
    // Direct application was detected and closed, skip this vacancy
    return { status: 'direct_application_skipped' };
  }

  if (!modalResult.appeared || modalResult.limitError) {
    return { status: modalResult.status };
  }

  // Submit modal application
  const submitResult = await submitModalApplication({ commander, MESSAGE });

  if (!submitResult.success) {
    return { status: submitResult.status, reason: submitResult.reason };
  }

  if (submitResult.limitError) {
    return { status: submitResult.status };
  }

  return { status: 'success' };
}

/**
 * Find and click the next page link in pagination
 * @param {Object} options
 * @param {Object} options.commander - Browser commander instance
 * @returns {Promise<{found: boolean, clicked?: boolean}>}
 */
async function findAndClickNextPage({ commander }) {
  try {
    // Check if pagination exists
    const pagerCount = await commander.count({ selector: SELECTORS.pagerBlock });
    if (pagerCount === 0) {
      log.debug(() => '🔍 No pagination found on page');
      return { found: false };
    }

    // Find the current page and next page link
    const paginationInfo = await commander.evaluate({
      fn: () => {
        const pagerBlock = document.querySelector('[data-qa="pager-block"]');
        if (!pagerBlock) return null;

        const pageLinks = Array.from(pagerBlock.querySelectorAll('a[data-qa="pager-page"]'));
        if (pageLinks.length === 0) return null;

        // Find current page (aria-current="true")
        const currentPageIndex = pageLinks.findIndex(link => link.getAttribute('aria-current') === 'true');
        if (currentPageIndex === -1) return null;

        // Check if there's a next page
        if (currentPageIndex >= pageLinks.length - 1) {
          return { hasNextPage: false, currentPage: currentPageIndex + 1, totalPages: pageLinks.length };
        }

        const nextPageLink = pageLinks[currentPageIndex + 1];
        return {
          hasNextPage: true,
          currentPage: currentPageIndex + 1,
          nextPage: currentPageIndex + 2,
          totalPages: pageLinks.length,
          nextPageHref: nextPageLink.href,
        };
      },
    });

    if (!paginationInfo) {
      log.debug(() => '🔍 Could not find pagination info');
      return { found: false };
    }

    if (!paginationInfo.hasNextPage) {
      console.log(`📄 On last page (${paginationInfo.currentPage}/${paginationInfo.totalPages}), no more pages available`);
      return { found: true, clicked: false };
    }

    console.log(`📄 Found pagination: currently on page ${paginationInfo.currentPage}/${paginationInfo.totalPages}`);
    console.log(`🔄 Automatically navigating to page ${paginationInfo.nextPage}...`);

    // Click the next page link by finding it again (avoid stale element reference)
    const nextPageSelector = `${SELECTORS.pagerPage}[aria-current="false"]`;
    const allNextPages = await commander.count({ selector: nextPageSelector });

    if (allNextPages > 0) {
      // Find the exact next page by checking href or position
      // We need to click the page that comes right after current
      await commander.evaluate({
        fn: () => {
          const pagerBlock = document.querySelector('[data-qa="pager-block"]');
          const pageLinks = Array.from(pagerBlock.querySelectorAll('a[data-qa="pager-page"]'));
          const currentPageIndex = pageLinks.findIndex(link => link.getAttribute('aria-current') === 'true');
          const nextPageLink = pageLinks[currentPageIndex + 1];
          if (nextPageLink) {
            nextPageLink.click();
          }
        },
      });

      console.log('✅ Clicked next page link, waiting for page to load...');
      return { found: true, clicked: true };
    }

    return { found: false };
  } catch (error) {
    if (isNavigationError(error)) {
      log.debug(() => '🔍 Navigation detected during pagination check');
      return { found: false };
    }
    console.log(`⚠️  Error while checking pagination: ${error.message}`);
    return { found: false };
  }
}

/**
 * Wait for buttons to appear after page navigation
 * Now respects abort signals - will stop waiting IMMEDIATELY if navigation is detected
 * The wait() function is now abortable, so we exit as soon as navigation starts
 */
export async function waitForButtonsAfterNavigation({
  commander,
  pageClosedByUser,
}) {
  console.log('💡 No more "Откликнуться" buttons on this page.');

  // Try to find and click next page automatically
  const paginationResult = await findAndClickNextPage({ commander });

  if (paginationResult.found && paginationResult.clicked) {
    // Successfully clicked next page, wait for navigation to complete
    console.log('💡 Waiting for next page to load...');
    await commander.wait({ ms: 2000, reason: 'waiting for next page to start loading' });
    return { status: 'navigation_detected' };
  }

  if (paginationResult.found && !paginationResult.clicked) {
    // On last page, no more pages to process
    console.log('💡 All pages have been processed!');
    console.log('💡 You can manually navigate to another search or change filters');
  } else {
    // No pagination found
    console.log('💡 You can manually navigate to another page (e.g., change filters, go to next page)');
  }

  console.log('💡 The automation will continue once buttons are detected on the new page.');

  // Wait and keep checking for URL changes or new buttons
  const startUrl = commander.getUrl();
  let checkCount = 0;

  while (true) {
    if (pageClosedByUser()) {
      return { status: 'page_closed' };
    }

    // Check if we should abort due to navigation BEFORE waiting
    // Also check navigationManager.isNavigating() directly for redundancy
    const shouldAbortNow = commander.shouldAbort && commander.shouldAbort();
    const isNavigatingNow = commander.navigationManager && commander.navigationManager.isNavigating();

    if (shouldAbortNow || isNavigatingNow) {
      console.log(`🛑 Navigation detected, stopping button wait immediately (shouldAbort=${shouldAbortNow}, isNavigating=${isNavigatingNow})`);
      return { status: 'navigation_detected' };
    }

    // Use abortable wait - will exit immediately if navigation occurs
    const waitResult = await commander.wait({ ms: 2000, reason: 'checking for manual navigation or new buttons' });

    // Check if wait was aborted due to navigation
    if (waitResult && waitResult.aborted) {
      console.log('🛑 Wait was interrupted by navigation, exiting button wait loop');
      return { status: 'navigation_detected' };
    }

    // Double-check abort status after wait completes
    const shouldAbortAfterWait = commander.shouldAbort && commander.shouldAbort();
    const isNavigatingAfterWait = commander.navigationManager && commander.navigationManager.isNavigating();

    if (shouldAbortAfterWait || isNavigatingAfterWait) {
      console.log(`🛑 Navigation detected after wait, exiting button wait loop (shouldAbort=${shouldAbortAfterWait}, isNavigating=${isNavigatingAfterWait})`);
      return { status: 'navigation_detected' };
    }

    const newUrl = commander.getUrl();

    // Check if URL changed (manual navigation)
    if (newUrl !== startUrl) {
      log.debug(() => `🔍 URL changed from ${startUrl} to ${newUrl}`);

      // URL changed - we should exit and let the main loop handle page loading
      // Don't try to wait for page ready here - that's the main loop's job
      console.log('🔄 URL changed, exiting to let main loop handle new page');
      return { status: 'navigation_detected' };
    }

    // Same URL, check if buttons appeared (e.g., dynamic content loaded)
    // But only if we're not in the middle of navigation
    if (!commander.shouldAbort || !commander.shouldAbort()) {
      try {
        const samePageButtonSelector = await commander.findByText({ text: 'Откликнуться', selector: 'a' });
        const samePageButtonCount = await commander.count({ selector: samePageButtonSelector });

        if (samePageButtonCount > 0) {
          console.log(`✅ Detected ${samePageButtonCount} button(s) appeared on same page! Continuing automation...`);
          return { status: 'buttons_found' };
        }
      } catch (error) {
        // If we get an error during element search, navigation might have occurred
        if (isNavigationError(error) || (commander.shouldAbort && commander.shouldAbort())) {
          console.log('🛑 Navigation occurred during button search, exiting');
          return { status: 'navigation_detected' };
        }
        // Log other errors but continue
        log.debug(() => `🔍 Error during button search: ${error.message}`);
      }
    }

    checkCount++;
    if (checkCount % 5 === 0) {
      log.debug(() => `🔍 Still waiting... (checked ${checkCount} times)`);
    }
  }
}
