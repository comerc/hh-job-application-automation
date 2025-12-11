# Case Study: Issue #122 - Questions Filled with Answers Twice

## Executive Summary

**Issue**: Application fills textarea questions with duplicate answers (e.g., "Более 5 летБолее 5 лет", "От 550000 рублей в месяц в grossОт 550000 рублей в месяц в gross")

**Root Cause**: Race condition caused by multiple calls to fill the same textarea element within the same question-filling iteration, despite having a locking mechanism and checkEmpty flag in place.

**Severity**: High - Causes form submission failures and poor user experience

**Status**: Under investigation, fix in progress

## Timeline of Events

### Event Sequence from Log Analysis

Based on the log file from the gist (e9fab5ab7fec7096c9fe0e133538f8de), here is the reconstructed timeline:

#### Salary Question (task_283162215_text)
```
Line 854: 🔒 [TYPING-LOCK-22] Requesting lock for: TEXTAREA[name="task_283162215_text"]
Line 855: ✅ [TYPING-LOCK-22] Lock acquired immediately (no wait)
Line 856: ⌨️  [TYPING] Starting focus+type: "От 550000 рублей в месяц в gross"
Line 857: 🔒 [TYPING-LOCK-23] Requesting lock for: TEXTAREA[name="task_283162215_text"]
         ❌ SECOND REQUEST FOR SAME ELEMENT
Line 858: ⏳ [TYPING-LOCK-23] Waiting for lock (current owner: puppeteer-type:TEXTAREA[name="task_283162215_text"])
Line 861: 🔓 [TYPING-LOCK-22] Lock released after 156ms
Line 862: ✅ [TYPING-LOCK-23] Lock acquired after 155ms wait
Line 863: ⌨️  [TYPING] Starting focus+type: "От 550000 рублей в месяц в gross"
         ❌ SECOND TYPE OF SAME TEXT TO SAME ELEMENT
Line 872: 🔓 [TYPING-LOCK-23] Lock released after 102ms
Line 874: 🔍 [VERBOSE] Filled textarea with text: "От 550000 рублей в месяц в gross..."
Line 876: [QA] Prefilled textarea for: Какой уровень заработной платы вы рассматриваете для смены работы?
         ❌ RESULT: TEXT WAS FILLED TWICE
```

#### Experience Question (task_283162219_text)
```
Line 894: 🔒 [TYPING-LOCK-24] Requesting lock for: TEXTAREA[name="task_283162219_text"]
Line 895: ✅ [TYPING-LOCK-24] Lock acquired immediately (no wait)
Line 896: ⌨️  [TYPING] Starting focus+type: "Более 5 лет"
Line 899: 🔓 [TYPING-LOCK-24] Lock released after 62ms
Line 901: 🔍 [VERBOSE] Filled textarea with text: "Более 5 лет..."
Line 903: [QA] Prefilled textarea for: Сколько лет коммерческого опыта написания кода на языке Kotlin вы имеете?
Line 908: 🔒 [TYPING-LOCK-25] Requesting lock for: TEXTAREA[name="task_283162219_text"]
         ❌ SECOND REQUEST FOR SAME ELEMENT
Line 909: ✅ [TYPING-LOCK-25] Lock acquired immediately (no wait)
Line 910: ⌨️  [TYPING] Starting focus+type: "Более 5 лет"
         ❌ SECOND TYPE OF SAME TEXT TO SAME ELEMENT
Line 913: 🔓 [TYPING-LOCK-25] Lock released after 53ms
Line 915: 🔍 [VERBOSE] Filled textarea with text: "Более 5 лет..."
Line 917: [QA] Prefilled textarea for: Сколько лет коммерческого опыта написания кода на языке Kotlin вы имеете?
         ❌ RESULT: TEXT WAS FILLED TWICE
```

### Observations from the Timeline

1. **Pattern Confirmed**: Both duplicate fills follow the same pattern - two separate fill operations for the same textarea
2. **Lock Mechanism Works**: The typing lock correctly prevents concurrent typing, but doesn't prevent multiple fill attempts
3. **CheckEmpty Bypass**: The `checkEmpty: true` flag should have prevented the second fill, but it didn't

## Root Cause Analysis

### The Problem

The issue occurs at a **higher level** than the locking mechanism. The log shows that:

1. The application makes **two separate calls** to `fillTextareaQuestion()` for the same question
2. Each call goes through the full fill process independently
3. The `checkEmpty` check in `fillTextArea()` happens **before** the first fill completes
4. Both fills pass the empty check and proceed to type

### Code Flow Analysis

#### Entry Point: `vacancy-response.mjs` Line 53-66

```javascript
for (const [question, data] of questionToAnswer) {
  try {
    if (data.type === 'textarea') {
      // Skip if this selector was already filled (prevents duplicate fills)
      if (filledSelectors.has(data.selector)) {
        console.log(`[QA] Skipping duplicate fill for selector: ${data.selector}`);
        continue;
      }
      const filled = await fillTextareaQuestion({ commander, questionData: data, verbose });
      if (filled) {
        filledSelectors.add(data.selector);
      }
      // Small delay between textarea fills to ensure stability
      await commander.wait({ ms: 2000, reason: 'stability delay between textarea fills' });
    }
    // ... radio/checkbox handling
  }
}
```

**Key Finding**: There is a `filledSelectors` Set that should prevent duplicate fills, but it only gets updated **after** the fill completes. This creates a race window.

#### The Actual Bug

Looking at the log evidence:
- Lines 740, 780: Same question matched twice ("От 550000 рублей в месяц в gross")
- Lines 743, 746, 783, 786, 798: Same question matched multiple times ("Более 5 лет")

The root cause is in `vacancy-response.mjs` at line 29-46:

```javascript
const pageQuestions = await extractPageQuestions({ evaluate: commander.evaluate });

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
```

**The Real Bug**: The code uses `questionToAnswer.set(item.question, ...)` with the question text as the key. However, when iterating in the fill loop, if `extractPageQuestions()` returns **multiple questions with the same text but different selectors**, the Map will only store the last one, but during the fill loop iteration, we're iterating over the **original question text keys** which may not be unique.

**Wait, let me re-examine...**

Actually, looking at the log more carefully:

```
Line 741-746: Processing question about "Технического лидера?"
              Matched to: "Сколько лет коммерческого опыта с С#?"
              Answer: "Более 5 лет"
Line 744-746: Processing question about "Kotlin"
              Matched to: "Сколько лет коммерческого опыта с С#?"
              Answer: "Более 5 лет"
```

**THE REAL BUG**: Multiple **different** questions on the page are matching to the **same** database question, resulting in **multiple question items with different selectors but the same answer**. When these are stored in `questionToAnswer` Map using the **page question** as the key, we get multiple distinct entries that all target potentially the same textarea element.

Looking further at the log:
- Line 741-743: "Сколько лет коммерческого опыта у вас имеется в роли Технического лидера?" → Answer: "Более 5 лет"
- Line 744-746: "Сколько лет коммерческого опыта написания кода на языке Kotlin вы имеете?" → Answer: "Более 5 лет"
- Line 756-758: Same first question again
- Line 781-783: First question again
- Line 784-786: Second question again
- Line 796-798: First question again

This suggests that `extractPageQuestions()` is finding the **same questions multiple times**, OR there's a loop issue causing the matching logic to run multiple times.

Looking at the pattern:
- Lines 732-758: First iteration of matching
- Lines 772-798: Second iteration of matching (same questions)

**CONFIRMED ROOT CAUSE**: The matching logic is **running multiple times** on the same page questions, causing duplicate entries in the `questionToAnswer` Map. This happens because the code structure shows the matching output appearing twice in the log.

### Additional Contributing Factors

1. **checkEmpty Race Condition**: Even with `checkEmpty: true`, there's a timing issue where:
   - First fill starts, checks empty (passes)
   - Second fill starts before first completes, checks empty (still passes)
   - Both fills proceed, causing duplication

2. **filledSelectors Tracking**: The Set is updated only after `fillTextareaQuestion` returns, creating a race window for the second call.

## Technical Deep Dive

### The checkEmpty Logic

From `fill.js` lines 264-271:

```javascript
if (checkEmpty) {
  const isEmpty = await checkIfElementEmpty({ page, engine, locatorOrElement });
  if (!isEmpty) {
    const currentValue = await getInputValue({ page, engine, locatorOrElement });
    log.debug(() => `🔍 [VERBOSE] Textarea already has content, skipping: "${currentValue.substring(0, 30)}..."`);
    return { filled: false, verified: false, skipped: true, actualValue: currentValue };
  }
}
```

This check happens **before** the typing starts, but there's no mutex around the entire fill operation at this level.

### The fillTextareaQuestion Logic

From `qa.mjs` lines 310-350:

```javascript
export async function fillTextareaQuestion(options = {}) {
  const { commander, questionData, verbose = false } = options;

  // Perform fresh check of textarea content right before filling
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
    }
    return false;
  }

  const result = await commander.fillTextArea({
    selector: questionData.selector,
    text: questionData.answer,
    checkEmpty: true,
    scrollIntoView: true,
    simulateTyping: true,
  });

  const filled = result && result.filled;
  // ...
  return filled;
}
```

There are **two empty checks**:
1. Fresh check in `fillTextareaQuestion` (line 315-329)
2. Check in `fillTextArea` (line 264-271)

Despite these checks, both fills proceeded, which means:
- Both got to the fresh check before either completed filling
- The textarea was genuinely empty when both checked

## Browser Automation Best Practices Research

Based on online research, several best practices emerged:

### 1. Duplicate Text Input Issue (Playwright)
- **Source**: [Ray.run Discord Forum - Resolving Duplicate Text Issue](https://ray.run/discord-forum/threads/119708-input-command-types-duplicate-text-solved)
- **Finding**: The `fill` command can duplicate input in forms. Recommended workaround is `pressSequentially`, though Playwright discourages this.
- **Reason**: App logic can interfere with typing - e.g., if app isn't fully initialized and changes focus, or initializes fields with default values while typing.

### 2. Race Conditions in Form Automation
- **Source**: Multiple sources on Playwright vs Puppeteer comparisons
- **Finding**: Many apps don't properly disable controls while initializing, so actionability checks pass and automation continues while page isn't ready.
- **Best Practice**: Explicitly wait for indication that page is ready (e.g., wait for last expected network response).

### 3. Performance Issues with Large Text
- **Source**: [Playwright Issue #33761](https://github.com/microsoft/playwright/issues/33761)
- **Finding**: Filling textarea with lots of text lines is surprisingly slow.
- **Workaround**: Implement JavaScript function to set value attribute directly, then press tab to fire events.

### 4. Auto-Wait Functionality
- **Finding**: Playwright's AutoWait ensures elements fully load before action is executed, helping prevent race conditions during form filling.

## Proposed Solutions

### Solution 1: Fix the Root Cause - Prevent Duplicate Question Matching (RECOMMENDED)

**Problem**: The matching logic runs multiple times or `extractPageQuestions()` returns duplicates.

**Fix**: Add deduplication at the extraction or matching level:

```javascript
// In vacancy-response.mjs, after extracting questions
const pageQuestions = await extractPageQuestions({ evaluate: commander.evaluate });

// Deduplicate by selector (same textarea should only appear once)
const uniqueQuestions = [];
const seenSelectors = new Set();
for (const item of pageQuestions) {
  if (!seenSelectors.has(item.selector)) {
    seenSelectors.add(item.selector);
    uniqueQuestions.push(item);
  }
}

// Then proceed with matching on uniqueQuestions instead of pageQuestions
```

### Solution 2: Strengthen the filledSelectors Guard

**Problem**: `filledSelectors` Set is updated after fill completes, creating race window.

**Fix**: Add selector to the Set **before** filling:

```javascript
if (data.type === 'textarea') {
  // Check AND mark as being filled atomically
  if (filledSelectors.has(data.selector)) {
    console.log(`[QA] Skipping duplicate fill for selector: ${data.selector}`);
    continue;
  }
  filledSelectors.add(data.selector); // ← MOVE THIS UP (before fill)

  const filled = await fillTextareaQuestion({ commander, questionData: data, verbose });
  // No need to add again here

  await commander.wait({ ms: 2000, reason: 'stability delay between textarea fills' });
}
```

### Solution 3: Add Global Fill Lock per Selector

**Problem**: Multiple functions can call fillTextArea on the same selector.

**Fix**: Implement a global selector-based lock registry at the commander level.

### Solution 4: Investigate and Fix Why Matching Runs Twice

**Problem**: Log shows matching output appearing twice, suggesting the entire setupQAHandling might be called twice.

**Investigation Needed**:
- Check if `handleVacancyResponsePage` is called multiple times
- Check if there are multiple instances of the application running
- Add unique run IDs to log messages to detect multiple execution paths

## Recommendations

### Immediate Actions

1. **Implement Solution 1**: Add deduplication of questions by selector
2. **Implement Solution 2**: Move `filledSelectors.add()` before the fill operation
3. **Add Debug Logging**: Add unique execution IDs to trace if functions are called multiple times
4. **Unit Tests**: Add tests for duplicate question handling

### Medium-Term Actions

1. **Refactor fillTextareaQuestion**: Remove duplicate empty checks or consolidate them
2. **Review commander.fillTextArea**: Ensure it has all features from `fillTextareaQuestion` so the wrapper can be removed
3. **Add Integration Tests**: Test scenarios with multiple questions having same answer

### Long-Term Actions

1. **Architectural Review**: Consider moving to a more robust state machine for form filling
2. **Telemetry**: Add metrics to track duplicate fill attempts in production
3. **Documentation**: Document the expected behavior and constraints for question matching

## Feature Parity Analysis: fillTextareaQuestion vs commander.fillTextArea

Based on code review, `fillTextareaQuestion` has these features:

1. **Fresh empty check** (lines 315-329) - Additional check beyond `checkEmpty`
2. **Verbose logging** - Conditional logging based on verbose flag
3. **Custom return value handling** - Returns boolean, not result object
4. **Console output** - User-facing messages about what was filled

The `commander.fillTextArea` has:

1. **checkEmpty flag** - But only one check, not fresh check
2. **scrollIntoView** - Automatic scrolling
3. **simulateTyping** - Character-by-character typing
4. **verify flag** - Verification of filled content
5. **Detailed result object** - Returns {filled, verified, skipped, actualValue}

### Missing in commander.fillTextArea

- The "fresh check" pattern (checking value again right before fill)
- User-facing console messages
- Boolean return value convenience

### Proposal

Instead of removing `fillTextareaQuestion`, enhance `commander.fillTextArea` to support these use cases better, or keep `fillTextareaQuestion` as a domain-specific wrapper that adds the fresh check and user messaging.

## Files Affected

- `src/vacancy-response.mjs` - Main loop that calls fill functions
- `src/qa.mjs` - `fillTextareaQuestion` function and question extraction
- `src/browser-commander/interactions/fill.js` - Low-level fill implementation

## Related Issues

- Issue #115: Previous textarea filling problem (see case study)
- Issue #105: Page navigation errors

## References and Sources

1. [Ray.run Discord Forum - Resolving Duplicate Text Issue with Input Command in Playwright](https://ray.run/discord-forum/threads/119708-input-command-types-duplicate-text-solved)
2. [Playwright Issue #33761 - Filling a textarea element with lots of text lines is surprisingly slow](https://github.com/microsoft/playwright/issues/33761)
3. [Apify Academy - Interacting with a page](https://docs.apify.com/academy/puppeteer-playwright/page/interacting-with-a-page)
4. [TestGrid - Playwright vs. Puppeteer: Choosing the Best Web Automation Library](https://testgrid.io/blog/playwright-vs-puppeteer/)
5. [ScraperAPI - Playwright vs Puppeteer in 2025](https://www.scraperapi.com/blog/playwright-vs-puppeteer/)
6. [BrowserStack - Playwright vs Puppeteer: Which to choose in 2025?](https://www.browserstack.com/guide/playwright-vs-puppeteer)

## Conclusion

The duplicate text filling issue is caused by a combination of factors:

1. **Primary cause**: Multiple questions on the page match to the same answer, and there's insufficient deduplication by selector
2. **Secondary cause**: Race condition in the `filledSelectors` tracking which updates after fill completes
3. **Contributing factor**: Multiple empty checks happening before any fill completes

The recommended fix is to implement both Solution 1 (deduplication) and Solution 2 (early selector tracking) to prevent this issue at multiple levels.
