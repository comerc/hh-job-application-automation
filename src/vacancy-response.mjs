/**
 * Vacancy response page handler
 * Handles the vacancy_response page with QA auto-filling
 */

import {
  extractPageQuestions,
  extractQAPairs,
  countUnansweredQuestions,
  fillTextareaQuestion,
  fillRadioQuestion,
  fillCheckboxQuestion,
  setupAutoSaveListeners,
  collectMarkedQAPairs,
} from './qa.mjs';
import { findBestMatch } from './qa-database.mjs';

/**
 * Setup Q&A auto-fill and auto-save for all textareas and radio buttons on the page
 */
export async function setupQAHandling({ commander, readQADatabase, addOrUpdateQA, verbose }) {
  try {
    const qaMap = await readQADatabase();

    // Extract all questions from the page using qa.mjs
    const pageQuestions = await extractPageQuestions({ evaluate: commander.evaluate });

    const questionToAnswer = new Map();

    // Match questions with answers from database
    for (const item of pageQuestions) {
      const match = findBestMatch(item.question, qaMap);
      if (match) {
        questionToAnswer.set(item.question, {
          ...item,
          answer: match.answer,
          matchScore: match.score,
        });
        console.log(`[QA] Fuzzy match for "${item.question}" (score: ${match.score.toFixed(3)})`);
        console.log(`[QA] Matched to: "${match.question}"`);
        console.log(`[QA] Answer: "${match.answer}"`);
      }
    }

    // Auto-fill textareas and select radio buttons using qa.mjs functions
    for (const [question, data] of questionToAnswer) {
      try {
        if (data.type === 'textarea') {
          await fillTextareaQuestion({ commander, questionData: data, verbose });
        } else if (data.type === 'radio') {
          await fillRadioQuestion({ commander, questionData: data, verbose });
        } else if (data.type === 'checkbox') {
          await fillCheckboxQuestion({ commander, questionData: data, verbose });
        }
      } catch (error) {
        console.error(`[QA] Error autofilling for "${question}":`, error.message);
      }
    }

    // Setup auto-save listeners for textareas using qa.mjs
    await setupAutoSaveListeners({
      evaluate: commander.evaluate,
      questionToAnswer,
    });

    const qaPairsToSave = await collectMarkedQAPairs({
      evaluate: commander.evaluate,
    });

    for (const { question, answer } of qaPairsToSave) {
      await addOrUpdateQA(question, answer);
      console.log('💾 Saved Q&A:', question);
    }

    return qaPairsToSave.length;
  } catch (error) {
    console.error('⚠️  Error setting up Q&A handling:', error.message);
    return 0;
  }
}

/**
 * Save Q&A pairs from textareas and radio buttons after user interaction
 */
export async function saveQAPairs({ commander, addOrUpdateQA }) {
  try {
    const qaPairs = await extractQAPairs({ evaluate: commander.evaluate });

    for (const { question, answer } of qaPairs) {
      await addOrUpdateQA(question, answer);
      console.log('💾 Saved Q&A:', question);
    }

    return qaPairs.length;
  } catch (error) {
    console.error('⚠️  Error saving Q&A pairs:', error.message);
    return 0;
  }
}

/**
 * Handle the vacancy_response page
 */
export async function handleVacancyResponsePage({
  commander,
  MESSAGE,
  vacancyResponsePattern,
  readQADatabase,
  addOrUpdateQA,
  autoSubmitEnabled,
  verbose,
}) {
  console.log('📝 Detected vacancy_response page, handling application form...');

  if (verbose) {
    console.log(`🔍 [VERBOSE] Engine: ${commander.engine}`);
    console.log('🔍 [VERBOSE] About to wait for body selector');
  }

  await commander.waitForSelector({ selector: 'body' });

  if (verbose) {
    console.log('🔍 [VERBOSE] Body selector found');
  }

  // Log all textareas for debugging
  if (verbose) {
    console.log('🔍 [VERBOSE] About to count textareas');
  }
  const initialCount = await commander.count({ selector: 'textarea' });
  console.log(`🔍 Initial scan: Found ${initialCount} textarea(s) on page`);

  if (verbose) {
    console.log('🔍 [VERBOSE] Starting to inspect each textarea');
    for (let i = 0; i < initialCount; i++) {
      const selector = `textarea:nth-of-type(${i + 1})`;
      console.log(`🔍 [VERBOSE] Processing textarea ${i} with selector: ${selector}`);
      const dataQa = await commander.getAttribute({ selector, attribute: 'data-qa' });
      const visible = await commander.isVisible({ selector });
      const dataQaDisplay = dataQa || '(none)';
      console.log(`🔍 Initial textarea ${i}: data-qa="${dataQaDisplay}", visible=${visible}`);
    }
    console.log('🔍 [VERBOSE] Finished inspecting textareas');
  }

  // Check if textarea is already visible
  if (verbose) {
    console.log('🔍 [VERBOSE] Checking if textarea is already visible');
  }
  let textareaAlreadyVisible = false;
  let textareaSelector = '';
  const possibleSelectors = [
    'textarea[data-qa="vacancy-response-popup-form-letter-input"]',
    'textarea[data-qa="vacancy-response-form-letter-input"]',
  ];

  for (const sel of possibleSelectors) {
    if (verbose) {
      console.log(`🔍 [VERBOSE] Checking selector: ${sel}`);
    }
    const count = await commander.count({ selector: sel });
    if (verbose) {
      console.log(`🔍 [VERBOSE] Count for ${sel}: ${count}`);
    }
    if (count > 0) {
      const visible = await commander.isVisible({ selector: sel });
      if (verbose) {
        console.log(`🔍 [VERBOSE] Visible for ${sel}: ${visible}`);
      }
      if (visible) {
        textareaAlreadyVisible = true;
        textareaSelector = sel;
        console.log('💡 Cover letter section already expanded, textarea visible');
        break;
      }
    }
  }
  if (verbose) {
    console.log(`🔍 [VERBOSE] textareaAlreadyVisible: ${textareaAlreadyVisible}`);
  }

  // If textarea not visible, click toggle button
  if (!textareaAlreadyVisible) {
    try {
      let toggleFound = false;
      let toggleSelector = null;

      // Try data-qa attributes first
      const dataQaSelectors = [
        '[data-qa="vacancy-response-letter-toggle"]',
        '[data-qa="add-cover-letter"]',
      ];

      for (const sel of dataQaSelectors) {
        const count = await commander.count({ selector: sel });
        if (count > 0) {
          toggleFound = true;
          toggleSelector = sel;
          break;
        }
      }

      // Fallback to text matching for small elements
      if (!toggleFound) {
        if (verbose) {
          console.log('🔍 [VERBOSE] data-qa not found, searching by text');
        }

        // Try each element type separately using findByText
        // Search for multiple possible texts: the label or the "Добавить" button
        const searchTexts = ['Добавить', 'Сопроводительное письмо'];
        const elementTypes = ['a', 'button', 'span', 'div'];

        for (const searchText of searchTexts) {
          for (const elementType of elementTypes) {
            if (verbose) {
              console.log(`🔍 [VERBOSE] Searching for "${searchText}" in ${elementType} elements`);
            }
            toggleSelector = await commander.findByText({
              text: searchText,
              selector: elementType,
            });
            const count = await commander.count({ selector: toggleSelector });
            if (verbose) {
              console.log(`🔍 [VERBOSE] Found ${count} elements matching "${searchText}" in ${elementType}`);
            }
            if (count > 0) {
              toggleFound = true;
              break;
            }
          }
          if (toggleFound) break;
        }
      }

      if (toggleFound) {
        const text = await commander.textContent({ selector: toggleSelector });
        const dataQa = await commander.getAttribute({ selector: toggleSelector, attribute: 'data-qa' });
        if (verbose) {
          console.log(`🔍 [VERBOSE] Found toggle element: text="${text?.trim()}", data-qa="${dataQa}"`);
        }
        console.log(`🔘 Cover letter section is collapsed, clicking toggle (text: "${text?.trim()}", data-qa: "${dataQa}") to expand...`);

        await commander.clickButton({
          selector: toggleSelector,
          scrollIntoView: true,
        });

        console.log('🔍 Toggle click completed');

        await commander.wait({ ms: 1700, reason: 'expand animation to complete' });
        console.log('✅ Cover letter section expanded');

        // Log textareas after toggle
        const countAfter = await commander.count({ selector: 'textarea' });
        if (verbose) {
          console.log(`📊 After toggle click: Found ${countAfter} textarea(s) on page`);
        }
      } else {
        console.log('💡 Toggle button not found, cover letter section may already be expanded');
      }
    } catch (error) {
      console.log('💡 Toggle button not found, cover letter section may already be expanded');
      console.log(`🔍 Error during toggle: ${error.message}`);
    }
  }

  // Wait for textarea
  if (!textareaAlreadyVisible) {
    textareaSelector = 'textarea[data-qa="vacancy-response-popup-form-letter-input"]';
  }

  try {
    if (verbose) {
      console.log(`🔍 [VERBOSE] Waiting for textarea selector: ${textareaSelector}`);
    }
    await commander.waitForSelector({ selector: textareaSelector, visible: true, timeout: 2000 });
    if (verbose) {
      console.log('🔍 [VERBOSE] Textarea found and visible');
    }
  } catch {
    if (verbose) {
      console.log('🔍 [VERBOSE] First selector timed out after 2000ms, trying alternative');
    }
    textareaSelector = 'textarea[data-qa="vacancy-response-form-letter-input"]';
    try {
      if (verbose) {
        console.log(`🔍 [VERBOSE] Trying alternative textarea selector: ${textareaSelector}`);
      }
      await commander.waitForSelector({ selector: textareaSelector, visible: true, timeout: 2000 });
      if (verbose) {
        console.log('🔍 [VERBOSE] Alternative textarea found and visible');
      }
    } catch {
      if (verbose) {
        console.log('🔍 [VERBOSE] Alternative selector timed out after 2000ms, trying any textarea');
      }
      textareaSelector = 'textarea';
      console.log('⚠️  Warning: Using generic textarea selector (no data-qa found). This may be fragile.');
      try {
        if (verbose) {
          console.log(`🔍 [VERBOSE] Trying any textarea selector: ${textareaSelector}`);
        }
        await commander.waitForSelector({ selector: textareaSelector, visible: true, timeout: 2000 });
        if (verbose) {
          console.log('🔍 [VERBOSE] Any textarea found and visible');
        }
      } catch {
        console.log('⚠️  Cover letter textarea not found on vacancy_response page');
        const count = await commander.count({ selector: 'textarea' });
        console.log(`🔍 Found ${count} textarea(s) on page`);
        return;
      }
    }
  }

  // Fill cover letter
  if (verbose) {
    console.log(`🔍 [VERBOSE] About to fill textarea with selector: ${textareaSelector}`);
  }
  const filled = await commander.fillTextArea({
    selector: textareaSelector,
    text: MESSAGE,
    checkEmpty: true,
    scrollIntoView: true,
    simulateTyping: true,
  });
  if (filled) {
    console.log(`✅ Prefilled cover letter message into: ${textareaSelector}`);
  } else {
    console.log('⏭️  Cover letter already contains text, skipping prefill');
  }

  // Count textareas
  const textareaCount = await commander.count({ selector: 'textarea' });
  console.log(`📊 Found ${textareaCount} textarea(s) on the page`);

  // Setup Q&A handling first (this will auto-fill answers from database)
  await setupQAHandling({ commander, readQADatabase, addOrUpdateQA, verbose });

  // Wait for form validation and give user time to review auto-filled answers
  await commander.wait({ ms: 30000, reason: 'form validation and user review after auto-fill' });

  // Check if we're still on the vacancy_response page (may have navigated away)
  const currentUrl = commander.getUrl();
  if (!vacancyResponsePattern.test(currentUrl)) {
    console.log('💡 Page navigated away from vacancy_response, skipping auto-submit');
    return;
  }

  // Count total test questions and unanswered test questions using qa.mjs
  let testQuestionStats;
  try {
    if (verbose) {
      console.log('🔍 [VERBOSE] Counting test questions (radio/checkbox)...');
    }
    testQuestionStats = await countUnansweredQuestions({
      evaluate: commander.evaluate,
    });
    if (verbose) {
      console.log(`🔍 [VERBOSE] Question stats: total=${testQuestionStats.totalCount}, unanswered=${testQuestionStats.unansweredCount}`);
    }
  } catch (error) {
    if (error.message && error.message.includes('Execution context was destroyed')) {
      console.log('💡 Page navigated away during question counting, skipping auto-submit');
      return;
    }
    throw error;
  }

  // Check if there are test questions:
  // - Radio/checkbox questions counted by countUnansweredQuestions
  // - OR multiple textareas (more than just the cover letter)
  const hasTestQuestions = testQuestionStats.totalCount > 0 || textareaCount > 1;
  const hasUnansweredQuestions = testQuestionStats.unansweredCount > 0;

  if (verbose) {
    console.log(`🔍 [VERBOSE] hasTestQuestions=${hasTestQuestions} (radioCheckbox=${testQuestionStats.totalCount}, textareas=${textareaCount})`);
    console.log(`🔍 [VERBOSE] hasUnansweredQuestions=${hasUnansweredQuestions}`);
  }

  // Check if any test textareas are empty (beyond just the cover letter)
  let hasEmptyTestTextareas;
  try {
    if (verbose) {
      console.log('🔍 [VERBOSE] Checking for empty test textareas...');
    }
    hasEmptyTestTextareas = await commander.evaluate({
      fn: () => {
        const textareas = document.querySelectorAll('textarea');
        let emptyCount = 0;
        const details = [];

        textareas.forEach((textarea, index) => {
          // Skip the cover letter textarea
          const isCoverLetter = textarea.getAttribute('data-qa') === 'vacancy-response-popup-form-letter-input' ||
                                textarea.getAttribute('data-qa') === 'vacancy-response-form-letter-input';

          const isEmpty = !textarea.value.trim();
          details.push({
            index,
            isCoverLetter,
            isEmpty,
            dataQa: textarea.getAttribute('data-qa'),
            valueLength: textarea.value.length,
          });

          if (!isCoverLetter && isEmpty) {
            emptyCount++;
          }
        });

        return { hasEmpty: emptyCount > 0, emptyCount, details };
      },
    });
    if (verbose) {
      console.log(`🔍 [VERBOSE] Textarea check result:`, JSON.stringify(hasEmptyTestTextareas, null, 2));
    }
    // For backwards compatibility, extract the boolean
    const textareaCheckResult = hasEmptyTestTextareas;
    hasEmptyTestTextareas = textareaCheckResult.hasEmpty;
  } catch (error) {
    if (error.message && error.message.includes('Execution context was destroyed')) {
      console.log('💡 Page navigated away during textarea check, skipping auto-submit');
      return;
    }
    throw error;
  }

  if (hasUnansweredQuestions) {
    console.log(`⚠️  Found ${testQuestionStats.unansweredCount} of ${testQuestionStats.totalCount} radio/checkbox test question(s) UNANSWERED`);
    console.log('💡 Cannot auto-submit when test questions remain unanswered - manual submission required');
    console.log('💡 Please answer the remaining questions and submit the form manually when ready');
    if (verbose) {
      console.log('🔍 [VERBOSE] Returning early due to unanswered radio/checkbox questions');
    }
    return;
  }

  if (hasEmptyTestTextareas) {
    console.log('⚠️  Found EMPTY test question textarea(s)');
    console.log('💡 Cannot auto-submit when test textareas are empty - manual submission required');
    console.log('💡 Please fill the empty textarea(s) and submit the form manually when ready');
    if (verbose) {
      console.log('🔍 [VERBOSE] Returning early due to empty test textareas');
    }
    return;
  }

  // Decide whether to auto-submit based on configuration and question presence
  let shouldAutoSubmit = false;

  if (verbose) {
    console.log('🔍 [VERBOSE] Deciding whether to auto-submit...');
    console.log(`🔍 [VERBOSE]   hasTestQuestions=${hasTestQuestions}`);
    console.log(`🔍 [VERBOSE]   auto-submit-vacancy-response-form=${autoSubmitEnabled}`);
  }

  if (!hasTestQuestions) {
    // No test questions - always auto-submit (only cover letter)
    shouldAutoSubmit = true;
    console.log('✅ No test questions found, only cover letter - will auto-submit');
  } else if (autoSubmitEnabled) {
    // Has test questions but all answered and flag is enabled
    shouldAutoSubmit = true;
    console.log(`✅ All ${testQuestionStats.totalCount} test question(s) answered and --auto-submit-vacancy-response-form enabled - will auto-submit`);
  } else {
    // Has test questions, all answered, but flag is disabled
    shouldAutoSubmit = false;
    console.log(`💡 All ${testQuestionStats.totalCount} test question(s) answered, but --auto-submit-vacancy-response-form is disabled`);
    console.log('💡 Please review the answers and submit the form manually when ready');
    if (verbose) {
      console.log('🔍 [VERBOSE] Returning early: flag disabled');
    }
    return;
  }

  // Auto-submit if decided to auto-submit
  if (shouldAutoSubmit) {
    console.log('✅ Proceeding with auto-submit');

    // Try multiple selectors for submit button (modal vs full-page form)
    const possibleSelectors = [
      '[data-qa="vacancy-response-submit-popup"]',  // Modal form
      '[data-qa="vacancy-response-letter-submit"]', // Full-page form
      'button[type="submit"]',                       // Generic fallback
    ];

    let submitSelector = null;
    for (const sel of possibleSelectors) {
      const count = await commander.count({ selector: sel });
      if (count > 0) {
        submitSelector = sel;
        console.log(`Found submit button with selector: ${sel}`);
        break;
      }
    }

    if (!submitSelector) {
      console.log('⚠️  Submit button not found (tried multiple selectors)');
      return;
    }

    // Check button state with detailed logging
    const buttonState = await commander.evaluate({
      fn: (sel) => {
        const el = document.querySelector(sel);
        if (!el) return { found: false };

        return {
          found: true,
          disabled: el.hasAttribute('disabled') || el.classList.contains('disabled'),
          hasDisabledAttr: el.hasAttribute('disabled'),
          hasDisabledClass: el.classList.contains('disabled'),
          classList: Array.from(el.classList),
          textContent: el.textContent?.trim(),
        };
      },
      args: [submitSelector],
    });

    if (verbose) {
      console.log('🔍 [VERBOSE] Submit button state:', JSON.stringify(buttonState, null, 2));
    }

    if (!buttonState.found) {
      console.log('⚠️  Submit button not found in DOM');
      return;
    }

    if (buttonState.disabled) {
      console.log('⚠️  Submit button is disabled, manual action required');
      console.log(`   Button text: "${buttonState.textContent}"`);
      console.log(`   Has disabled attribute: ${buttonState.hasDisabledAttr}`);
      console.log(`   Has disabled class: ${buttonState.hasDisabledClass}`);
      console.log('💡 The form may require additional validation. Please check manually.');
      if (verbose) {
        console.log('🔍 [VERBOSE] NOT clicking disabled submit button, returning early');
      }
      return;
    } else {
      if (verbose) {
        console.log('🔍 [VERBOSE] Submit button is enabled, clicking...');
      }
      await commander.clickButton({
        selector: submitSelector,
        scrollIntoView: true,
        smoothScroll: true,
      });
      console.log('✅ Clicked submit button');
      await commander.wait({ ms: 2000, reason: 'submission to complete' });
    }
  }
}
