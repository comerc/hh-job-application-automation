# Issue 136: Duplicate Field Filling - Raw Logs

## Issue Description
Text fields are being filled multiple times (duplicate filling), causing doubled text in textareas.

## Raw Log from Issue

```
🔍 [VERBOSE] Waiting 2000ms: modal to appear
...
🔗 URL change detected: https://hh.ru/search/vacancy?... → https://hh.ru/applicant/vacancy_response?vacancyId=128631898&startedWithQuestion=false
🔄 External navigation detected (JS redirect or link click)
🛑 Aborting previous operations due to navigation
🛑 Wait aborted: modal to appear
📤 Triggering onBeforeNavigate callbacks...
🛑 Stopping action "search-page"...
🛑 Action "search-page" stopped (caught ActionStoppedError)
✅ Action stopped
🧹 Running 0 session cleanup callbacks...
🔄 Network tracker reset
⏳ Waiting for page ready (external navigation)...
...
⚠️  Redirected to a different page: https://hh.ru/applicant/vacancy_response?vacancyId=128631898&startedWithQuestion=false
💡 This is a vacancy_response page, handling automatically...
Detected vacancy_response page, handling application form...
Engine: puppeteer
About to wait for body selector
Body selector found
About to count textareas
Initial scan: Found 1 textarea(s) on page
Processing textarea 0 with selector: textarea:nth-of-type(1)
Initial textarea 0: data-qa="(none)", visible=true
Checking if textarea is already visible
Checking selector: textarea[data-qa="vacancy-response-popup-form-letter-input"]
Count for textarea[data-qa="vacancy-response-popup-form-letter-input"]: 0
Checking selector: textarea[data-qa="vacancy-response-form-letter-input"]
Count for textarea[data-qa="vacancy-response-form-letter-input"]: 0
Found toggle element: text="Сопроводительное письмоДобавить", data-qa="vacancy-response-letter-toggle"
Cover letter section is collapsed, clicking toggle (text: "Сопроводительное письмоДобавить", data-qa: "vacancy-response-letter-toggle") to expand...
🔍 [VERBOSE] Target element: DIV: "Сопроводительное письмоДобавит..."
🔍 [VERBOSE] Scrolling with behavior: smooth
🔍 [VERBOSE] Waiting 1000ms: smooth scroll animation to complete
...
🔍 [VERBOSE] Wait complete (1000ms)
✅ Scroll verification passed - element is in viewport
🔍 [VERBOSE] About to click element
...
✅ Click verification passed: element removed from DOM (UI updated)
🔍 [VERBOSE] Click completed
🔍 [VERBOSE] Waiting 500ms: checking for navigation after click
...
🔍 [VERBOSE] Wait complete (500ms)
🔄 Navigation detected via NavigationManager
🔄 Click triggered navigation to: https://hh.ru/applicant/vacancy_response?vacancyId=128631898&startedWithQuestion=false
⏳ Waiting for existing page ready operation (after click navigation)...
...
⚠️  Action "undefined" did not stop gracefully within 10000ms
✅ Navigation complete (session 45, 13331ms)
🚀 Starting action "vacancy-response-page" for: https://hh.ru/applicant/vacancy_response?vacancyId=128631898&startedWithQuestion=false
📋 [vacancy-response-page] Action started for: https://hh.ru/applicant/vacancy_response?vacancyId=128631898&startedWithQuestion=false
📋 [vacancy-response-page] Tracking vacancy ID: 128631898
Detected vacancy_response page, handling application form...
Engine: puppeteer
About to wait for body selector
✅ Page ready after 13332ms (external navigation)
Toggle click completed
🔍 [VERBOSE] Waiting 1700ms: expand animation to complete
Body selector found
About to count textareas
Initial scan: Found 2 textarea(s) on page
Processing textarea 0 with selector: textarea:nth-of-type(1)
Initial textarea 0: data-qa="(none)", visible=true
Processing textarea 1 with selector: textarea:nth-of-type(2)
Initial textarea 1: data-qa="(none)", visible=false
Checking if textarea is already visible
Checking selector: textarea[data-qa="vacancy-response-popup-form-letter-input"]
Count for textarea[data-qa="vacancy-response-popup-form-letter-input"]: 1
Visible for textarea[data-qa="vacancy-response-popup-form-letter-input"]: true
Cover letter section already expanded, textarea visible
Waiting for textarea selector: textarea[data-qa="vacancy-response-popup-form-letter-input"]
Textarea found and visible: textarea[data-qa="vacancy-response-popup-form-letter-input"]
About to fill textarea with selector: textarea[data-qa="vacancy-response-popup-form-letter-input"]
🔍 [VERBOSE] Element already in view (within 10% threshold), skipping scroll
...
✅ Click verification passed: element still connected (assumed success)
🔒 [TYPING-LOCK-114] Requesting lock for: puppeteer-type:TEXTAREA[data-qa="vacancy-response-popup-form-letter-input"]
✅ [TYPING-LOCK-114] Lock acquired immediately (no wait) for: puppeteer-type:TEXTAREA[data-qa="vacancy-response-popup-form-letter-input"]
⌨️  [TYPING] Starting focus+type for TEXTAREA[data-qa="vacancy-response-popup-form-letter-input"]: "Здравствуйте,

Мне понравилась ваша компания, я ду..."
👁️  [TYPING] Focused TEXTAREA[data-qa="vacancy-response-popup-form-letter-input"], about to type 489 characters
🔍 [VERBOSE] Wait complete (1700ms)
Cover letter section expanded
After toggle click: Found 2 textarea(s) on page
Waiting for textarea selector: textarea[data-qa="vacancy-response-popup-form-letter-input"]
Textarea found and visible: textarea[data-qa="vacancy-response-popup-form-letter-input"]
About to fill textarea with selector: textarea[data-qa="vacancy-response-popup-form-letter-input"]
🔍 [VERBOSE] Textarea already has content, skipping: "Здравствуйте,

Мне понравилась..."
Prefilled cover letter message into: textarea[data-qa="vacancy-response-popup-form-letter-input"]
Found 2 textarea(s) on the page
[QA] Fuzzy match for "Напишите, пожалуйста, какую сумму заработной платы вы рассматриваете" (score: 1.000)
[QA] Matched to: "Напишите, пожалуйста, какую сумму заработной платы вы рассматриваете"
[QA] Answer: "От 450000 рублей в месяц на руки."
🔍 [VERBOSE] Scrolling with behavior: smooth
✅ Scroll verification succeeded after 1 attempt(s)
🔍 [VERBOSE] Waiting 300ms: smooth scroll animation to complete
✍️  [TYPING] Completed typing 489 characters to TEXTAREA[data-qa="vacancy-response-popup-form-letter-input"]
🔓 [TYPING-LOCK-114] Lock released after 1905ms by: puppeteer-type:TEXTAREA[data-qa="vacancy-response-popup-form-letter-input"]
✅ Fill verification succeeded after 1 attempt(s)
🔍 [VERBOSE] Filled textarea with text: "Здравствуйте,

Мне понравилась ваша компания, я ду..."
✅ Fill verification passed
Prefilled cover letter message into: textarea[data-qa="vacancy-response-popup-form-letter-input"]
Found 2 textarea(s) on the page
[QA] Fuzzy match for "Напишите, пожалуйста, какую сумму заработной платы вы рассматриваете" (score: 1.000)
[QA] Matched to: "Напишите, пожалуйста, какую сумму заработной платы вы рассматриваете"
[QA] Answer: "От 450000 рублей в месяц на руки."
🔍 [VERBOSE] Element already in view (within 10% threshold), skipping scroll
...
✅ Click verification passed: element still connected (assumed success)
🔒 [TYPING-LOCK-115] Requesting lock for: puppeteer-type:TEXTAREA[name="task_292677829_text"]
✅ [TYPING-LOCK-115] Lock acquired immediately (no wait) for: puppeteer-type:TEXTAREA[name="task_292677829_text"]
⌨️  [TYPING] Starting focus+type for TEXTAREA[name="task_292677829_text"]: "От 450000 рублей в месяц на руки."
👁️  [TYPING] Focused TEXTAREA[name="task_292677829_text"], about to type 33 characters
✍️  [TYPING] Completed typing 33 characters to TEXTAREA[name="task_292677829_text"]
🔓 [TYPING-LOCK-115] Lock released after 121ms by: puppeteer-type:TEXTAREA[name="task_292677829_text"]
✅ Fill verification succeeded after 1 attempt(s)
🔍 [VERBOSE] Filled textarea with text: "От 450000 рублей в месяц на руки...."
✅ Fill verification passed
[QA] Prefilled textarea for: Напишите, пожалуйста, какую сумму заработной платы вы рассматриваете
🔍 [VERBOSE] Waiting 2000ms: stability delay between textarea fills
🔍 [VERBOSE] Wait complete (300ms)
✅ Scroll verification passed - element is in viewport
✅ Click verification passed: element still connected (assumed success)
🔒 [TYPING-LOCK-116] Requesting lock for: puppeteer-type:TEXTAREA[name="task_292677829_text"]
✅ [TYPING-LOCK-116] Lock acquired immediately (no wait) for: puppeteer-type:TEXTAREA[name="task_292677829_text"]
⌨️  [TYPING] Starting focus+type for TEXTAREA[name="task_292677829_text"]: "От 450000 рублей в месяц на руки."
👁️  [TYPING] Focused TEXTAREA[name="task_292677829_text"], about to type 33 characters
✍️  [TYPING] Completed typing 33 characters to TEXTAREA[name="task_292677829_text"]
🔓 [TYPING-LOCK-116] Lock released after 112ms by: puppeteer-type:TEXTAREA[name="task_292677829_text"]
✅ Fill verification succeeded after 1 attempt(s)
🔍 [VERBOSE] Filled textarea with text: "От 450000 рублей в месяц на руки...."
✅ Fill verification passed
[QA] Prefilled textarea for: Напишите, пожалуйста, какую сумму заработной платы вы рассматриваете
🔍 [VERBOSE] Waiting 2000ms: stability delay between textarea fills
Saved Q&A: Напишите, пожалуйста, какую сумму заработной платы вы рассматриваете
Auto-saved 1 Q&A pair(s)
Saved Q&A: Напишите, пожалуйста, какую сумму заработной платы вы рассматриваете
Auto-saved 1 Q&A pair(s)
...
[multiple repeated saves follow]
```

## Key Observations

1. **Two handlers are running concurrently** - The log shows both:
   - Manual handler from `validateTargetPage` in `vacancies.mjs` (line 304-306)
   - PageTrigger handler `vacancy-response-page`

2. **The same textarea gets filled multiple times** - TYPING-LOCK-115 and TYPING-LOCK-116 both fill the same textarea `TEXTAREA[name="task_292677829_text"]`

3. **The issue is visible in the lock IDs**:
   - TYPING-LOCK-114: First typing operation (cover letter)
   - TYPING-LOCK-115: First Q&A fill for salary question
   - TYPING-LOCK-116: **SECOND** Q&A fill for the **same** salary question (DUPLICATE!)

## Root Cause Hypothesis

The `handleVacancyResponsePage` function is being called from two different places concurrently:
1. From `vacancies.mjs:validateTargetPage()` via `handlePostClickNavigation()` (line 808)
2. From `page-triggers.mjs` via the `vacancy-response-page` pageTrigger

Both handlers start executing almost simultaneously when a vacancy_response page is detected.
