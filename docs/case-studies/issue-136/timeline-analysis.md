# Issue 136: Timeline Analysis - Duplicate Field Filling

## Timeline Reconstruction

Based on the logs, here is the sequence of events leading to duplicate field filling:

### T0: User clicks "Откликнуться" (Apply) button
- User is on search results page
- Click triggers navigation to `vacancy_response` page

### T1: Navigation Detection
```
🔗 URL change detected: https://hh.ru/search/vacancy?... → https://hh.ru/applicant/vacancy_response?vacancyId=128631898
🔄 External navigation detected (JS redirect or link click)
🛑 Aborting previous operations due to navigation
```

### T2: PageTrigger System Reacts
The `search-page` action is stopped:
```
🛑 Stopping action "search-page"...
🛑 Action "search-page" stopped (caught ActionStoppedError)
```

### T3: Legacy Handler in vacancies.mjs Triggers (CALL #1)
The `handlePostClickNavigation()` function in `vacancies.mjs` detects the URL change and calls `handleVacancyResponsePage()`:

```javascript
// vacancies.mjs:803-808
if (vacancyResponsePattern.test(currentUrl)) {
  console.log('💡 This is a vacancy_response page, handling automatically...');
  await handleVacancyResponsePage();  // <-- FIRST CALL
  ...
}
```

Log evidence:
```
💡 This is a vacancy_response page, handling automatically...
Detected vacancy_response page, handling application form...
Engine: puppeteer
About to wait for body selector
Body selector found
About to count textareas
Initial scan: Found 1 textarea(s) on page
```

### T4: Page Ready Event Triggers
```
✅ Navigation complete (session 45, 13331ms)
```

### T5: PageTrigger vacancy-response-page Starts (CALL #2)
```
🚀 Starting action "vacancy-response-page" for: https://hh.ru/applicant/vacancy_response?vacancyId=128631898
📋 [vacancy-response-page] Action started for: https://hh.ru/applicant/vacancy_response?vacancyId=128631898
📋 [vacancy-response-page] Tracking vacancy ID: 128631898
Detected vacancy_response page, handling application form...  // <-- SECOND CALL
```

### T6: Both Handlers Run Concurrently

At this point, **TWO instances** of `handleVacancyResponsePage()` are running:
1. The one from T3 (legacy handler in vacancies.mjs)
2. The one from T5 (pageTrigger handler)

### T7: Duplicate Form Filling Occurs

Both handlers try to:
1. Fill the cover letter textarea
2. Find and fill Q&A questions
3. Call `setupQAHandling()` which fills textareas

Evidence of duplicate Q&A filling (same textarea filled twice):
```
[QA] Answer: "От 450000 рублей в месяц на руки."
🔒 [TYPING-LOCK-115] Requesting lock for: puppeteer-type:TEXTAREA[name="task_292677829_text"]
⌨️  [TYPING] Starting focus+type for TEXTAREA[name="task_292677829_text"]: "От 450000 рублей в месяц на руки."
✍️  [TYPING] Completed typing 33 characters to TEXTAREA[name="task_292677829_text"]
[QA] Prefilled textarea for: Напишите, пожалуйста, какую сумму заработной платы вы рассматриваете

...later...

🔒 [TYPING-LOCK-116] Requesting lock for: puppeteer-type:TEXTAREA[name="task_292677829_text"]
⌨️  [TYPING] Starting focus+type for TEXTAREA[name="task_292677829_text"]: "От 450000 рублей в месяц на руки."
✍️  [TYPING] Completed typing 33 characters to TEXTAREA[name="task_292677829_text"]
[QA] Prefilled textarea for: Напишите, пожалуйста, какую сумму заработной платы вы рассматриваете
```

## Root Cause

The application has **two separate mechanisms** that both call `handleVacancyResponsePage()`:

### 1. Legacy Handler (vacancies.mjs)
Location: `vacancies.mjs:808` in `handlePostClickNavigation()`
Trigger: URL pattern matching in the click handling flow

```javascript
if (vacancyResponsePattern.test(currentUrl)) {
  console.log('💡 This is a vacancy_response page, handling automatically...');
  await handleVacancyResponsePage();
```

### 2. PageTrigger Handler (page-triggers.mjs)
Location: `page-triggers.mjs:137` in `registerPageTriggers()`
Trigger: PageTrigger system with URL condition

```javascript
const unregisterVacancyResponse = commander.pageTrigger({
  name: 'vacancy-response-page',
  condition: createVacancyResponseCondition(),
  action: async (ctx) => {
    ...
    await handleVacancyResponsePage();  // Called by pageTrigger
  },
});
```

Both handlers are active and neither checks if the other has already started handling the page.

## Code Flow Diagram

```
User clicks "Откликнуться"
        │
        ▼
┌───────────────────────────────────────┐
│     executeButtonClick()              │
│         vacancies.mjs                 │
└───────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────┐
│   handlePostClickNavigation()         │
│         vacancies.mjs:765             │
│                                       │
│  Detects vacancy_response URL         │
│  Calls handleVacancyResponsePage() ◀──┼─── CALL #1 (Legacy)
└───────────────────────────────────────┘
        │
        │ (concurrently)
        ▼
┌───────────────────────────────────────┐
│      PageTrigger System               │
│        page-triggers.mjs              │
│                                       │
│  URL matches vacancy_response pattern │
│  Starts "vacancy-response-page"       │
│  Calls handleVacancyResponsePage() ◀──┼─── CALL #2 (PageTrigger)
└───────────────────────────────────────┘
        │
        ▼
    BOTH FILL FORMS
    = DUPLICATE TEXT
```

## Why the Cover Letter Isn't Always Duplicated

The cover letter fill has a check:
```javascript
// vacancy-response.mjs:482-493
const filled = await commander.fillTextArea({
  selector: textareaSelector,
  text: MESSAGE,
  checkEmpty: true,  // <-- This prevents duplicate filling if content exists
  ...
});
```

The `checkEmpty: true` option prevents filling if the textarea already has content.

However, the Q&A handling in `setupQAHandling()` uses `fillTextareaQuestion()` which doesn't have this safeguard for all scenarios.

## Similar Issues

This issue is related to Issue #122, which was about duplicate text filling due to multiple questions targeting the same textarea. The fix for #122 added deduplication by selector (`vacancy-response.mjs:33-42`), but that only deduplicates within a single call to `setupQAHandling()`.

When `handleVacancyResponsePage()` is called twice, `setupQAHandling()` is called twice, and each call processes all questions independently.
