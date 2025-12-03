# Case Study Update: Issue #115 - Root Cause Identified (2025-12-02)

## Summary

This document updates the original case study with findings from the December 2nd investigation triggered by user-provided logs showing ongoing character corruption.

## New Evidence from 2025-12-02 Run

### Log File Analysis

The user provided a new log showing:

1. **Cover letter fills successfully first:**
```
✅ Fill verification succeeded after 1 attempt(s)
🔍 [VERBOSE] Filled textarea with text: "Здравствуйте,\n\nМне понравилась ваша компания..."
✅ Fill verification passed
Prefilled cover letter message into: textarea[data-qa="vacancy-response-popup-form-letter-input"]
```

2. **QA answer retrieved from database is ALREADY CORRUPTED:**
```
[QA] Fuzzy match for "Укажите Ваш ожидаемый уровень дохода на данную позицию?" (score: 1.000)
[QA] Matched to: "Укажите Ваш ожидаемый уровень дохода на данную позицию?"
[QA] Answer: "оты?\n\nПосмотреть мой код на GitHub можно тут:\n\ngithub.com/kОoт n4a5r0d0\n0g0i tрhубuлеbй .вc oмеmся/ц dнeа eрpук-и.assistant..."
```

The answer `"github.com/kОoт n4a5r0d0\n0g0i tрhубuлеbй"` is clearly corrupted - Russian and English characters interleaved with gibberish.

3. **When filling, the corruption gets worse:**
```
Expected: "оты?\n\nПосмотреть мой код на GitHub можно тут:\n\ngithub.com/kОoт n4a5r0d0..."
Got: "оты?\n\nПосмотреть мой откыо?д \nн\nа ПоGсмiотtреHтьu bмо й мокжондо  нтау т:G\ni..."
```

This shows **two text streams being typed simultaneously**, causing the text to interleave character-by-character.

## Root Cause Analysis

### The Fundamental Issue: Puppeteer's `page.keyboard.type()`

Looking at `src/browser-commander/core/engine-adapter.js:401-404`:

```javascript
async type(locatorOrElement, text) {
  // Puppeteer requires focus before typing
  await locatorOrElement.focus();
  await this.page.keyboard.type(text);  // <-- THIS IS THE PROBLEM!
}
```

**Critical Problem:** Puppeteer's `page.keyboard.type()` types to **whatever element currently has focus**, not to the element that was focused before!

### Race Condition Scenario

When two fill operations run concurrently:

```
Time    Operation A (Cover Letter)     Operation B (QA Textarea)
----    --------------------------     -------------------------
T1      focus(textareaA)
T2                                     focus(textareaB)  // Steals focus from A!
T3      type("Здравствуйте...")        type("От 450000...")
T4      Characters interleave because both are typing to textareaB!
```

### How Corrupted Data Gets Persisted

1. **Concurrent typing corrupts the textarea content**
2. **`saveQAPairs()` runs periodically (every 5 seconds)** - see `page-triggers.mjs:99-116`
3. **The corrupted content is read from the textarea** and saved to `qa.lino`
4. **Future runs retrieve the corrupted data** and attempt to fill with it
5. **The corruption compounds** - each run potentially adds more corruption

### Evidence from Log

The log shows the corruption pattern:
- Input: `"github.com/konard"` (English)
- Input: `"От 450000 рублей"` (Russian)
- Output: `"github.com/kОoт n4a5r0d0"` - Characters from both languages interleaved

## Why Previous Fix (Commit 15d0114) Didn't Fully Solve It

The commit 15d0114 fixed **selector uniqueness** - ensuring each textarea has a unique selector. This prevents:
- Wrong textarea being selected
- Multiple operations targeting the same selector

**BUT** it didn't fix the Puppeteer `page.keyboard.type()` issue:
- Even with unique selectors, both operations still use `page.keyboard.type()`
- `page.keyboard.type()` types to the **focused** element
- Focus can be stolen between the `focus()` call and the `type()` call

## Solution: Global Typing Mutex

### Approach

1. **Add a global mutex** that ensures only ONE fill operation can type at a time
2. **Lock before focus()**, release after type() completes
3. This serializes all typing operations, preventing interleaving

### Implementation Location

File: `src/browser-commander/core/engine-adapter.js`

```javascript
// Global typing mutex to prevent concurrent keyboard operations
// Puppeteer's page.keyboard.type() types to whatever has focus,
// so if another operation steals focus, characters interleave.
let globalTypingLock = null;

async function acquireTypingLock() {
  while (globalTypingLock) {
    await globalTypingLock;
  }
  let releaseLock;
  globalTypingLock = new Promise(resolve => {
    releaseLock = () => {
      globalTypingLock = null;
      resolve();
    };
  });
  return releaseLock;
}

// In PuppeteerAdapter:
async type(locatorOrElement, text) {
  const release = await acquireTypingLock();
  try {
    await locatorOrElement.focus();
    await this.page.keyboard.type(text);
  } finally {
    release();
  }
}
```

### Additional Safeguard: Q&A Corruption Detection

Add validation before saving Q&A pairs to detect corrupted text:

```javascript
function detectCorruptedText(text) {
  // Pattern: alternating Cyrillic and Latin characters (sign of interleaving)
  const interleavingPattern = /([а-яА-Я])([a-zA-Z])([а-яА-Я])/g;
  const matches = text.match(interleavingPattern) || [];

  // If more than 3 instances of interleaving, likely corrupted
  return matches.length > 3;
}
```

## Timeline of Issue

1. **Issue #80**: Basic textarea filling problem - fixed with `click()` + `type()`
2. **Issue #111**: Concurrent typing observed - first screenshot
3. **Commit 15d0114**: Fix selector uniqueness
4. **Issue #115**: Problem persists - character corruption still occurring
5. **2025-12-02**: Root cause identified as `page.keyboard.type()` + stolen focus

## Files Affected

- `src/browser-commander/core/engine-adapter.js` - Add typing mutex
- `src/vacancy-response.mjs` - Potentially add corruption detection
- `src/qa.mjs` - Potentially add pre-fill validation

## Verification Steps

After implementing the fix:

1. Run with multiple textareas visible
2. Watch logs for proper serialization of fill operations
3. Verify no character interleaving in filled textareas
4. Confirm Q&A database entries are not corrupted

## References

- Original case study: `docs/case-studies/issue-115-textarea-filling-problem/case-study.md`
- Log file: `docs/case-studies/issue-115-textarea-filling-problem/logs/2025-12-02-run-log.txt`
- Related issues: #80, #111, #115
