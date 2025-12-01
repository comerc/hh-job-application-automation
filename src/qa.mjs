/**
 * Q&A handling module for hh.ru job application forms
 * Handles extraction, matching, and auto-filling of questions and answers
 */

/**
 * Extract all questions from page (textareas, radios, checkboxes)
 * @param {Object} options - Configuration options
 * @param {Function} options.evaluate - Browser commander evaluate function
 * @returns {Promise<Array>} - Array of question objects
 */
export async function extractPageQuestions(options = {}) {
  const { evaluate } = options;

  return await evaluate({
    fn: () => {
      const questions = [];

      // Extract textarea questions - only from task-body elements to avoid mixing with cover letter
      const taskBodies = document.querySelectorAll('[data-qa="task-body"]');
      taskBodies.forEach((taskBody, taskIndex) => {
        const questionEl = taskBody.querySelector('[data-qa="task-question"]');
        if (!questionEl) return;

        const question = questionEl.textContent.trim();
        if (!question) return;

        // Find textarea within this specific task-body
        const textarea = taskBody.querySelector('textarea');
        if (!textarea) return;

        // Generate a unique selector - prefer name attribute for reliability
        // Using name attribute ensures we target the exact textarea without index confusion
        let selector;
        if (textarea.name) {
          selector = `textarea[name="${textarea.name}"]`;
        } else if (textarea.id) {
          selector = `textarea#${textarea.id}`;
        } else {
          // Fallback: Mark the textarea with a temporary attribute for identification
          // This ensures we target the exact element even if page structure is complex
          const uniqueId = `qa-temp-${Date.now()}-${taskIndex}`;
          textarea.setAttribute('data-qa-temp-id', uniqueId);
          selector = `textarea[data-qa-temp-id="${uniqueId}"]`;
        }

        questions.push({
          type: 'textarea',
          question,
          selector,
          index: taskIndex,
          currentValue: textarea.value.trim(),
        });
      });

      // Extract radio and checkbox questions (reuse taskBodies from above)
      taskBodies.forEach((taskBody) => {
        const questionEl = taskBody.querySelector('[data-qa="task-question"]');
        if (!questionEl) return;

        const question = questionEl.textContent.trim();
        if (!question) return;

        const radioInputs = taskBody.querySelectorAll('input[type="radio"]');
        const checkboxInputs = taskBody.querySelectorAll('input[type="checkbox"]');

        if (radioInputs.length === 0 && checkboxInputs.length === 0) return;

        // Group radio buttons by name
        const radiosByName = {};
        radioInputs.forEach((radio) => {
          if (!radio.name) return;
          if (!radiosByName[radio.name]) {
            radiosByName[radio.name] = [];
          }

          const cell = radio.closest('[data-qa="cell"]');
          let optionText = '';
          if (cell) {
            const textContent = cell.querySelector('[data-qa="cell-text-content"]');
            if (textContent) {
              optionText = textContent.textContent.trim();
            }
          }

          radiosByName[radio.name].push({
            value: radio.value,
            optionText,
            checked: radio.checked,
          });
        });

        // Group checkboxes by name
        const checkboxesByName = {};
        checkboxInputs.forEach((checkbox) => {
          if (!checkbox.name) return;
          if (!checkboxesByName[checkbox.name]) {
            checkboxesByName[checkbox.name] = [];
          }

          const cell = checkbox.closest('[data-qa="cell"]');
          let optionText = '';
          if (cell) {
            const textContent = cell.querySelector('[data-qa="cell-text-content"]');
            if (textContent) {
              optionText = textContent.textContent.trim();
            }
          }

          checkboxesByName[checkbox.name].push({
            value: checkbox.value,
            optionText,
            checked: checkbox.checked,
          });
        });

        // Add radio questions
        Object.entries(radiosByName).forEach(([name, options]) => {
          const checkedOption = options.find(opt => opt.checked);
          const currentAnswer = checkedOption ? checkedOption.optionText : '';

          questions.push({
            type: 'radio',
            question,
            name,
            options,
            currentAnswer,
            selector: `input[name="${name}"]`,
          });
        });

        // Add checkbox questions
        Object.entries(checkboxesByName).forEach(([name, options]) => {
          const checkedOptions = options.filter(opt => opt.checked);
          const currentAnswers = checkedOptions.map(opt => opt.optionText);

          questions.push({
            type: 'checkbox',
            question,
            name,
            options,
            currentAnswers,
            selector: `input[name="${name}"]`,
          });
        });
      });

      return questions;
    },
  });
}

/**
 * Extract Q&A pairs from filled forms
 * @param {Object} options - Configuration options
 * @param {Function} options.evaluate - Browser commander evaluate function
 * @returns {Promise<Array>} - Array of {question, answer} pairs
 */
export async function extractQAPairs(options = {}) {
  const { evaluate } = options;

  return await evaluate({
    fn: () => {
      const pairs = [];

      // Extract textarea answers
      const textareas = document.querySelectorAll('textarea');
      textareas.forEach((textarea) => {
        const taskBody = textarea.closest('[data-qa="task-body"]');
        if (!taskBody) return;

        const questionEl = taskBody.querySelector('[data-qa="task-question"]');
        if (!questionEl) return;

        const question = questionEl.textContent.trim();
        const answer = textarea.value.trim();

        if (question && answer) {
          pairs.push({ question, answer });
        }
      });

      // Extract radio and checkbox answers
      const taskBodies = document.querySelectorAll('[data-qa="task-body"]');
      taskBodies.forEach((taskBody) => {
        const questionEl = taskBody.querySelector('[data-qa="task-question"]');
        if (!questionEl) return;

        const question = questionEl.textContent.trim();
        if (!question) return;

        // Extract checked radio
        const checkedRadio = taskBody.querySelector('input[type="radio"]:checked');
        if (checkedRadio) {
          const cell = checkedRadio.closest('[data-qa="cell"]');
          if (!cell) return;

          const textContent = cell.querySelector('[data-qa="cell-text-content"]');
          if (!textContent) return;

          let answer = textContent.textContent.trim();

          // Check for custom text
          if (checkedRadio.value === 'open') {
            const customTextarea = taskBody.querySelector(`textarea[name="${checkedRadio.name}_text"]`);
            if (customTextarea && customTextarea.value.trim()) {
              answer = customTextarea.value.trim();
            }
          }

          if (answer) {
            pairs.push({ question, answer });
          }
        }

        // Extract checked checkboxes
        const checkedCheckboxes = taskBody.querySelectorAll('input[type="checkbox"]:checked');
        if (checkedCheckboxes.length > 0) {
          const answers = [];

          checkedCheckboxes.forEach((checkbox) => {
            const cell = checkbox.closest('[data-qa="cell"]');
            if (!cell) return;

            const textContent = cell.querySelector('[data-qa="cell-text-content"]');
            if (!textContent) return;

            let answer = textContent.textContent.trim();

            if (checkbox.value === 'open') {
              const customTextarea = taskBody.querySelector(`textarea[name="${checkbox.name}_text"]`);
              if (customTextarea && customTextarea.value.trim()) {
                answer = customTextarea.value.trim();
              }
            }

            if (answer) {
              answers.push(answer);
            }
          });

          if (answers.length > 0) {
            const finalAnswer = answers.length === 1 ? answers[0] : answers;
            pairs.push({ question, answer: finalAnswer });
          }
        }
      });

      return pairs;
    },
  });
}

/**
 * Count unanswered test questions
 * @param {Object} options - Configuration options
 * @param {Function} options.evaluate - Browser commander evaluate function
 * @param {string} options.containerSelector - Optional container selector (for modals)
 * @returns {Promise<Object>} - {totalCount, unansweredCount}
 */
export async function countUnansweredQuestions(options = {}) {
  const { evaluate, containerSelector } = options;

  return await evaluate({
    fn: (container) => {
      const root = container ? document.querySelector(container) : document;
      if (!root) return { totalCount: 0, unansweredCount: 0 };

      const taskBodies = root.querySelectorAll('[data-qa="task-body"]');
      let totalCount = 0;
      let unansweredCount = 0;

      taskBodies.forEach((taskBody) => {
        const radios = taskBody.querySelectorAll('input[type="radio"]');
        const checkboxes = taskBody.querySelectorAll('input[type="checkbox"]');

        // Check radio questions
        if (radios.length > 0) {
          totalCount++;
          const hasSelection = Array.from(radios).some(radio => radio.checked);
          if (!hasSelection) {
            unansweredCount++;
          }
        }

        // Check checkbox questions
        if (checkboxes.length > 0 && radios.length === 0) {
          totalCount++;
          const hasSelection = Array.from(checkboxes).some(checkbox => checkbox.checked);
          if (!hasSelection) {
            unansweredCount++;
          }
        }
      });

      return { totalCount, unansweredCount };
    },
    args: [containerSelector],
  });
}

/**
 * Auto-fill textarea question
 * @param {Object} options - Configuration options
 * @param {Object} options.commander - Browser commander instance
 * @param {Object} options.questionData - Question data with selector and answer
 * @param {boolean} options.verbose - Enable verbose logging
 * @returns {Promise<boolean>} - True if filled
 */
export async function fillTextareaQuestion(options = {}) {
  const { commander, questionData, verbose = false } = options;

  // Perform fresh check of textarea content right before filling
  // This is more reliable than the stale currentValue from extraction time
  const freshValue = await commander.evaluate({
    fn: (selector) => {
      const textarea = document.querySelector(selector);
      return textarea ? textarea.value.trim() : '';
    },
    args: [questionData.selector],
  });

  if (freshValue) {
    if (verbose) {
      console.log(`[QA] Textarea already has content for: ${questionData.question}`);
      console.log(`[QA] Current value: "${freshValue.substring(0, 50)}..."`);
    }
    return false;
  }

  // fillTextArea with checkEmpty: true provides additional safety check
  const result = await commander.fillTextArea({
    selector: questionData.selector,
    text: questionData.answer,
    checkEmpty: true,
    scrollIntoView: true,
    simulateTyping: true,
  });

  // fillTextArea returns an object with { filled, verified, skipped, actualValue }
  const filled = result && result.filled;

  if (filled) {
    console.log(`[QA] Prefilled textarea for: ${questionData.question}`);
  } else if (result && result.skipped) {
    console.log(`[QA] Textarea was not empty, skipped: ${questionData.question}`);
  }

  return filled;
}

/**
 * Auto-fill radio question
 * @param {Object} options - Configuration options
 * @param {Object} options.commander - Browser commander instance
 * @param {Object} options.questionData - Question data with options and answer
 * @param {boolean} options.verbose - Enable verbose logging
 * @returns {Promise<boolean>} - True if filled
 */
export async function fillRadioQuestion(options = {}) {
  const { commander, questionData, verbose = false } = options;

  const answers = Array.isArray(questionData.answer) ? questionData.answer : [questionData.answer];

  // Find matching option
  let matchingOption = null;
  for (const ans of answers) {
    matchingOption = questionData.options.find(opt =>
      opt.optionText && ans &&
      (opt.optionText.toLowerCase().includes(ans.toLowerCase().substring(0, 20)) ||
       ans.toLowerCase().includes(opt.optionText.toLowerCase())),
    );
    if (matchingOption) break;
  }

  if (!matchingOption) {
    if (verbose) {
      console.log(`[QA] No matching radio option found for: ${questionData.question}`);
    }
    return false;
  }

  const radioSelector = `input[name="${questionData.name}"][value="${matchingOption.value}"]`;

  // Check if already checked
  const alreadyChecked = await commander.evaluate({
    fn: (selector) => {
      const radio = document.querySelector(selector);
      return radio ? radio.checked : false;
    },
    args: [radioSelector],
  });

  if (alreadyChecked) {
    if (verbose) {
      console.log(`[QA] Radio option "${matchingOption.optionText}" already selected for: ${questionData.question}`);
    }
    return false;
  }

  await commander.clickButton({
    selector: radioSelector,
    scrollIntoView: true,
    smoothScroll: true,
  });

  console.log(`[QA] Selected radio option "${matchingOption.optionText}" for: ${questionData.question}`);
  await commander.wait({ ms: 300, reason: 'visual feedback after radio selection' });

  // Handle custom text option
  if (matchingOption.value === 'open') {
    await fillCustomTextForOption({ commander, questionData, answers });
  }

  return true;
}

/**
 * Auto-fill checkbox question
 * @param {Object} options - Configuration options
 * @param {Object} options.commander - Browser commander instance
 * @param {Object} options.questionData - Question data with options and answer
 * @param {boolean} options.verbose - Enable verbose logging
 * @returns {Promise<boolean>} - True if any filled
 */
export async function fillCheckboxQuestion(options = {}) {
  const { commander, questionData, verbose = false } = options;

  const answers = Array.isArray(questionData.answer) ? questionData.answer : [questionData.answer];
  let anyFilled = false;

  for (const ans of answers) {
    const matchingOption = questionData.options.find(opt =>
      opt.optionText && ans &&
      (opt.optionText.toLowerCase().includes(ans.toLowerCase().substring(0, 20)) ||
       ans.toLowerCase().includes(opt.optionText.toLowerCase())),
    );

    if (!matchingOption) continue;

    const checkboxSelector = `input[name="${questionData.name}"][value="${matchingOption.value}"]`;

    const alreadyChecked = await commander.evaluate({
      fn: (selector) => {
        const checkbox = document.querySelector(selector);
        return checkbox ? checkbox.checked : false;
      },
      args: [checkboxSelector],
    });

    if (alreadyChecked) {
      if (verbose) {
        console.log(`[QA] Option "${matchingOption.optionText}" already checked for: ${questionData.question}`);
      }
      continue;
    }

    await commander.clickButton({
      selector: checkboxSelector,
      scrollIntoView: true,
      smoothScroll: true,
    });

    console.log(`[QA] Checked option "${matchingOption.optionText}" for: ${questionData.question}`);
    await commander.wait({ ms: 300, reason: 'visual feedback after checkbox selection' });

    // Handle custom text
    if (matchingOption.value === 'open') {
      await fillCustomTextForOption({ commander, questionData, answers: [ans] });
    }

    anyFilled = true;
  }

  return anyFilled;
}

/**
 * Fill custom text for "open" option (internal helper)
 * @param {Object} options - Configuration options
 * @param {Object} options.commander - Browser commander instance
 * @param {Object} options.questionData - Question data
 * @param {Array} options.answers - Answer array
 */
async function fillCustomTextForOption(options = {}) {
  const { commander, questionData, answers } = options;

  const customTextarea = await commander.evaluate({
    fn: (name) => {
      const textareaName = name + '_text';
      const textarea = document.querySelector(`textarea[name="${textareaName}"]`);
      return textarea ? textareaName : null;
    },
    args: [questionData.name],
  });

  if (customTextarea) {
    const textToFill = Array.isArray(answers) ? answers[0] : answers;
    await commander.fillTextArea({
      selector: `textarea[name="${customTextarea}"]`,
      text: textToFill,
      checkEmpty: true,
      scrollIntoView: true,
      simulateTyping: true,
    });
    console.log(`[QA] Filled custom textarea for: ${questionData.question}`);
  }
}

/**
 * Setup auto-save listeners for textareas to mark them for saving on blur
 * @param {Object} options - Configuration options
 * @param {Function} options.evaluate - Browser commander evaluate function
 * @param {Map} options.questionToAnswer - Map of questions to answers
 */
export async function setupAutoSaveListeners(options = {}) {
  const { evaluate, questionToAnswer } = options;

  await evaluate({
    fn: (qaData) => {
      const qaObj = Object.fromEntries(qaData);
      const textareas = document.querySelectorAll('textarea');

      textareas.forEach((textarea) => {
        const taskBody = textarea.closest('[data-qa="task-body"]');
        if (!taskBody) return;

        const questionEl = taskBody.querySelector('[data-qa="task-question"]');
        if (!questionEl) return;

        const question = questionEl.textContent.trim();
        if (!question) return;

        const knownAnswer = qaObj[question]?.answer;

        textarea.addEventListener('blur', async () => {
          const answer = textarea.value.trim();
          if (answer && answer !== knownAnswer) {
            textarea.dataset.qaQuestion = question;
            textarea.dataset.qaAnswer = answer;
            console.log('[QA] Marked for saving:', question, '->', answer);
          }
        });
      });
    },
    args: [Array.from(questionToAnswer.entries())],
  });
}

/**
 * Collect marked Q&A pairs from textareas with data attributes
 * @param {Object} options - Configuration options
 * @param {Function} options.evaluate - Browser commander evaluate function
 * @returns {Promise<Array>} - Array of {question, answer} pairs
 */
export async function collectMarkedQAPairs(options = {}) {
  const { evaluate } = options;

  return await evaluate({
    fn: () => {
      const pairs = [];
      const textareas = document.querySelectorAll('textarea[data-qa-question][data-qa-answer]');
      textareas.forEach((textarea) => {
        pairs.push({
          question: textarea.dataset.qaQuestion,
          answer: textarea.dataset.qaAnswer,
        });
      });
      return pairs;
    },
  });
}
