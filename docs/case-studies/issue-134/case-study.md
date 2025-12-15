# Case Study: Issue #134 - SyntaxError: 'a:has-text("Откликнуться")' is not a valid selector

## Issue Summary

**Issue**: https://github.com/konard/hh-job-application-automation/issues/134
**PR**: https://github.com/konard/hh-job-application-automation/pull/135
**Error Log**: [error-log.txt](./error-log.txt)
**Related Issues**: #130, #132

## Error Description

When running the automation script with **Playwright** engine, the following error occurred:

```
Error occurred: page.evaluate: SyntaxError: Failed to execute 'querySelectorAll' on 'Document': 'a:has-text("Откликнуться")' is not a valid selector.
```

**Note**: This is a **different error** from issue #132. In #132, the error had a trailing comma (`'a:has-text("Откликнуться"),'`). In #134, there is no trailing comma - the issue is that the `:has-text()` pseudo-selector is not valid for `document.querySelectorAll()`.

## Timeline of Events

### Commit History

1. **ac8ff2f** - Merge PR #133 (fix for issue #132) - Fixed trailing comma issue
2. **a15359a** - Fix ESLint trailing comma errors in experiment script
3. **11922ff** - Revert of initial commit
4. **4e54c89** - Fix SyntaxError: 'a:has-text(...),' trailing comma in Playwright evaluate

### What Happened

1. **Issue #132 was fixed**: The trailing comma bug was caused by Playwright's `page.evaluate()` receiving an array as the second argument and passing the entire array as the first parameter to the function. This was fixed by reconstructing the function and spreading arguments.

2. **Issue #134 appeared**: After the fix for #132, a new (but related) error appeared. The trailing comma is gone, but now the `:has-text()` selector itself is invalid for `document.querySelectorAll()`.

## Root Cause Analysis

### The Real Bug (Issue #134)

The selector `a:has-text("Откликнуться")` is a **Playwright-specific selector** that only works with Playwright's locator API. It is **NOT** a valid CSS selector for `document.querySelectorAll()`.

### Code Flow

1. In `findVacancyButton()` (src/vacancies.mjs:399):
   ```javascript
   const baseButtonSelector = await commander.findByText({ text: 'Откликнуться', selector: 'a' });
   ```

2. For **Playwright**, `findByText()` returns a string: `'a:has-text("Откликнуться")'`

3. The `normalizeSelector()` function is then called (vacancies.mjs:402):
   ```javascript
   const normalizedSelector = await commander.normalizeSelector({ selector: baseButtonSelector });
   ```

4. **THE BUG**: `normalizeSelector()` only handled **Puppeteer text selectors** (objects with `_isPuppeteerTextSelector`). For Playwright, it just returned the string selector as-is:
   ```javascript
   if (typeof selector === 'string') {
     return selector;  // Returns 'a:has-text("...")' unchanged!
   }
   ```

5. This Playwright-specific selector was then passed to `document.querySelectorAll()` inside browser context (vacancies.mjs:416):
   ```javascript
   const allButtons = document.querySelectorAll(baseSelector);  // FAILS!
   ```

### Why Issue #132 Fix Didn't Catch This

The fix for issue #132 correctly handled the multiple arguments problem in `PlaywrightAdapter.evaluateOnPage()`. However, the underlying issue - that Playwright text selectors cannot be used with `document.querySelectorAll()` - was always present. It was just masked by the trailing comma error being thrown first.

## Comparison: Issues #130, #132, #134

| Issue | Error | Root Cause | Engine |
|-------|-------|------------|--------|
| #130 | `'[object Object]' is not a valid selector` | Puppeteer text selector object passed to querySelectorAll | Puppeteer |
| #132 | `'a:has-text("..."),'` (trailing comma) | Multiple args passed as array to Playwright evaluate | Playwright |
| #134 | `'a:has-text("...")'` (no trailing comma) | Playwright text selector passed to querySelectorAll | Playwright |

## Solution

The fix extends `normalizeSelector()` to handle Playwright text selectors:

### 1. Added helper functions to detect and parse Playwright text selectors:

```javascript
function isPlaywrightTextSelector(selector) {
  if (typeof selector !== 'string') return false;
  return selector.includes(':has-text(') || selector.includes(':text-is(');
}

function parsePlaywrightTextSelector(selector) {
  const hasTextMatch = selector.match(/^(.+?):has-text\("(.+?)"\)$/);
  if (hasTextMatch) {
    return { baseSelector: hasTextMatch[1], text: hasTextMatch[2], exact: false };
  }
  const textIsMatch = selector.match(/^(.+?):text-is\("(.+?)"\)$/);
  if (textIsMatch) {
    return { baseSelector: textIsMatch[1], text: textIsMatch[2], exact: true };
  }
  return null;
}
```

### 2. Extended `normalizeSelector()` to handle Playwright text selectors:

```javascript
export async function normalizeSelector(options = {}) {
  const { page, engine, selector } = options;

  // Handle Playwright text selectors (strings containing :has-text or :text-is)
  if (typeof selector === 'string' && engine === 'playwright' && isPlaywrightTextSelector(selector)) {
    const parsed = parsePlaywrightTextSelector(selector);
    if (!parsed) return selector;

    // Use page.evaluate to find matching element and generate a valid CSS selector
    const result = await page.evaluate(({ baseSelector, text, exact }) => {
      const elements = Array.from(document.querySelectorAll(baseSelector));
      const matchingElement = elements.find(el => {
        const elementText = el.textContent.trim();
        return exact ? elementText === text : elementText.includes(text);
      });

      if (!matchingElement) return null;

      // Generate a unique selector using data-qa or nth-of-type
      const dataQa = matchingElement.getAttribute('data-qa');
      if (dataQa) return `[data-qa="${dataQa}"]`;

      const tagName = matchingElement.tagName.toLowerCase();
      const siblings = Array.from(matchingElement.parentElement.children).filter(
        el => el.tagName.toLowerCase() === tagName
      );
      const index = siblings.indexOf(matchingElement);
      return `${tagName}:nth-of-type(${index + 1})`;
    }, parsed);

    return result;
  }

  // ... rest of function handles plain strings and Puppeteer objects
}
```

### 3. Updated bindings to pass `engine` parameter:

```javascript
const normalizeSelectorBound = (opts) => normalizeSelector({ ...opts, page, engine });
```

### 4. Updated `withTextSelectorSupport()` to also handle Playwright text selectors:

```javascript
if (engine === 'playwright' && typeof selector === 'string' && isPlaywrightTextSelector(selector)) {
  selector = await normalizeSelector({ page, engine, selector });
  if (!selector) {
    throw new Error('Element with specified text not found');
  }
}
```

## Testing

The fix was verified with:

1. **Unit tests**: All existing tests pass (`npm test`)
2. **Lint checks**: No ESLint errors (`npm run lint`)
3. **Experiment script**: `experiments/test-playwright-text-selector-normalization.mjs` verifies:
   - `findByText()` returns Playwright-specific selector format
   - `normalizeSelector()` converts it to valid CSS selector
   - Plain CSS selectors remain unchanged
   - Both `:has-text()` and `:text-is()` are handled

## Prevention

To prevent similar issues in the future:

1. **Unified text selector handling**: All text selectors (both Playwright and Puppeteer) now go through `normalizeSelector()` before being used in browser context
2. **Engine parameter**: `normalizeSelector()` now receives the `engine` parameter to correctly handle engine-specific selectors
3. **Documentation**: Updated JSDoc to clarify that text selectors must be normalized before use with `document.querySelectorAll()`

## Key Learnings

1. **Playwright selectors are not CSS selectors**: Playwright's `:has-text()` and `:text-is()` pseudo-selectors are only valid for Playwright's locator API, not for `document.querySelectorAll()`

2. **Both engines need normalization**: Both Puppeteer (object format) and Playwright (string format) text selectors need to be converted to valid CSS selectors before use in browser context

3. **Layered bugs**: Issue #132 masked issue #134. The trailing comma bug was thrown before the invalid selector bug could be reached

## Files Modified

- `src/browser-commander/elements/selectors.js` - Extended `normalizeSelector()` to handle Playwright text selectors
- `src/browser-commander/bindings.js` - Pass `engine` parameter to `normalizeSelector()`
- `docs/case-studies/issue-134/` - Added case study documentation
- `experiments/test-playwright-text-selector-normalization.mjs` - Added experiment to verify the fix

## References

- [Playwright Selectors Documentation](https://playwright.dev/docs/selectors)
- [CSS Selectors Specification](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Selectors)
- Related Issues: #130, #132, #134
