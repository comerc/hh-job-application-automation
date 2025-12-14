# Case Study: Issue #130 - SyntaxError: Failed to execute 'querySelectorAll' on 'Document': '[object Object]' is not a valid selector

## Issue Summary

**Issue**: https://github.com/konard/hh-job-application-automation/issues/130
**PR**: https://github.com/konard/hh-job-application-automation/pull/131
**Error Log**: [Gist Link](https://gist.github.com/konard/aaa1c2f6617e2367136c435589475124)

## Error Description

When running the automation script with Puppeteer engine, the following error occurred:

```
Error occurred: SyntaxError: Failed to execute 'querySelectorAll' on 'Document': '[object Object]' is not a valid selector.
```

## Timeline of Events

1. **User starts automation** with command:
   ```bash
   npm run puppeteer -- --url "https://hh.ru/search/vacancy?resume=80d55a81ff0171bfa80039ed1f743266675357&from=resumelist" --manual-login --job-application-interval 5 --verbose
   ```

2. **Login phase completes successfully**:
   - Browser launches with Puppeteer engine
   - Manual login page opens
   - User completes login successfully

3. **Automation starts**:
   - Page triggers registered: "vacancy-response-page", "vacancy-page", "search-page"
   - Redirects to search page: `https://hh.ru/search/vacancy?resume=...`
   - Function `checkAndRedirectIfNeeded` called
   - **Error occurs** immediately after

4. **Script terminates**:
   - All page triggers unregistered
   - Script exits

## Root Cause Analysis

### The Problem

The error occurs in `src/vacancies.mjs` in the `findVacancyButton` function (lines 399-408):

```javascript
async function findVacancyButton({ commander }) {
  // Find "Откликнуться" button using text selector
  const baseButtonSelector = await commander.findByText({ text: 'Откликнуться', selector: 'a' });

  // Get the list of already processed vacancy IDs to pass to the browser context
  const processedIds = Array.from(processedVacancyIds);

  // Use evaluate to find the first unprocessed button by checking vacancy card IDs
  const unprocessedButtonInfo = await commander.safeEvaluate({
    fn: (baseSelector, alreadyProcessedIds) => {
      // Find all buttons matching the base selector
      const allButtons = document.querySelectorAll(baseSelector);  // ❌ ERROR HERE
      ...
    },
    args: [baseButtonSelector, processedIds],  // baseButtonSelector is an object!
  });
}
```

### Why This Happens

The `commander.findByText()` function in `src/browser-commander/elements/selectors.js` (lines 81-102) behaves differently for Playwright vs Puppeteer:

**For Playwright** (lines 88-91):
```javascript
if (engine === 'playwright') {
  const textSelector = exact ? `:text-is("${text}")` : `:has-text("${text}")`;
  return `${selector}${textSelector}`;  // ✅ Returns a STRING
}
```

**For Puppeteer** (lines 93-101):
```javascript
else {
  // For Puppeteer, we need to use XPath or evaluate
  // Return a special selector marker that will be handled by other methods
  return {                                    // ❌ Returns an OBJECT
    _isPuppeteerTextSelector: true,
    baseSelector: selector,
    text,
    exact,
  };
}
```

### The Design Pattern

The Puppeteer text selector object is designed to be normalized before use. The `normalizeSelector` function (lines 111-162) converts this object to a real CSS selector by:

1. Checking if it's a Puppeteer text selector object
2. Running JavaScript in the browser to find the matching element
3. Returning a valid CSS selector (using data-qa or nth-of-type)

### What Went Wrong

The code in `findVacancyButton` passes the selector **directly to `safeEvaluate`** without normalization:

```javascript
args: [baseButtonSelector, processedIds],  // ❌ baseButtonSelector might be an object!
```

When the function executes in the browser context:
```javascript
const allButtons = document.querySelectorAll(baseSelector);
```

If `baseSelector` is an object, it gets converted to the string `"[object Object]"`, which is not a valid CSS selector, causing the SyntaxError.

## Why It Worked Before

This issue only manifests when using **Puppeteer** engine. When using Playwright:
- `findByText` returns a string selector (e.g., `a:has-text("Откликнуться")`)
- The string is passed directly to `querySelectorAll`
- Everything works fine

## Solution

The fix requires normalizing the selector before passing it to functions that will execute in the browser context. There are several places in the code where this pattern occurs:

1. **src/vacancies.mjs** - `findVacancyButton` function (line 399)
2. **src/vacancies.mjs** - Retry logic in `findVacancyButton` (line 500)
3. **src/vacancies.mjs** - `validateButtonState` function (line 602)
4. **src/vacancies.mjs** - Button scroll logic (line 664)
5. **src/vacancies.mjs** - Button click logic (line 680)
6. **src/vacancies.mjs** - `waitForButtonsOrNavigation` function (line 1250)

### Implementation Strategy

For each location where `findByText` results are passed to browser context code:
1. Normalize the selector using `commander.normalizeSelector()`
2. Handle the case where normalization returns null (element not found)
3. Ensure the normalized string selector is what gets passed to evaluate functions

## Related Issues

This is similar to previous issues where objects were incorrectly passed to browser context functions. The pattern of having different return types for different engines (Playwright vs Puppeteer) requires careful handling at call sites.

## Prevention

To prevent similar issues in the future:

1. **Always normalize** selectors from `findByText` before passing to `evaluate` or `safeEvaluate`
2. **Type checking** - Consider adding runtime checks to validate selector types
3. **Documentation** - Clearly document which functions return different types for different engines
4. **Testing** - Ensure tests cover both Playwright and Puppeteer engines
5. **Code review** - Watch for patterns where selectors are passed to browser context code

## Files Modified

- `src/vacancies.mjs` - Fixed all locations where `findByText` results are passed to browser context
