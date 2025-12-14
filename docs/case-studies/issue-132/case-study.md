# Case Study: Issue #132 - SyntaxError: Failed to execute 'querySelectorAll' on 'Document': 'a:has-text("Откликнуться"),' is not a valid selector

## Issue Summary

**Issue**: https://github.com/konard/hh-job-application-automation/issues/132
**PR**: https://github.com/konard/hh-job-application-automation/pull/133
**Error Log**: [error-log.txt](./error-log.txt)

## Error Description

When running the automation script with **Playwright** engine, the following error occurred:

```
Error occurred: page.evaluate: SyntaxError: Failed to execute 'querySelectorAll' on 'Document': 'a:has-text("Откликнуться"),' is not a valid selector.
```

Note the **trailing comma** in the selector string - this is the key symptom that led to identifying the root cause.

## Timeline of Events

### Commit History

1. **9df3852** - Merge PR #131 (fix for issue #130) - Introduced the regression
2. **9bb221f** - Fix for issue #130: Normalize Puppeteer text selectors before passing to browser context
3. **3886e37** - Merge PR #129 (previous working state)

### What Happened

1. **Issue #130 was reported**: Puppeteer engine crashed with `'[object Object]' is not a valid selector` because `findByText()` returns an object for Puppeteer that was being passed directly to `document.querySelectorAll()` in the browser context.

2. **Fix for #130 was implemented** (commit 9bb221f): Added `normalizeSelector()` call to convert the Puppeteer text selector object to a valid CSS selector string.

3. **Issue #132 appeared**: After the fix for #130, Playwright engine now crashes with `'a:has-text("Откликнуться"),'` error.

## Root Cause Analysis

### The Two Bugs

**Bug 1 (Issue #130 - Fixed):**
- `findByText()` returns different types for different engines:
  - Playwright: Returns a string selector (e.g., `a:has-text("...")`)
  - Puppeteer: Returns an object `{_isPuppeteerTextSelector: true, ...}`
- When the object was passed to `document.querySelectorAll()`, it was stringified to `"[object Object]"`

**Bug 2 (Issue #132 - NEW):**
- Playwright's `page.evaluate()` only accepts **a single optional argument**
- The code in `PlaywrightAdapter.evaluateOnPage()` incorrectly passed multiple args as a single array:
  ```javascript
  // Buggy code at line 391-401 of engine-adapter.js
  async evaluateOnPage(fn, args = []) {
    if (args.length === 0) {
      return await this.page.evaluate(fn);
    } else if (args.length === 1) {
      return await this.page.evaluate(fn, args[0]);
    } else {
      // Multiple args - pass as array (BUG!)
      return await this.page.evaluate(fn, args);
    }
  }
  ```

### Why the Trailing Comma?

1. In `findVacancyButton()` (src/vacancies.mjs:413), the code calls:
   ```javascript
   await commander.safeEvaluate({
     fn: (baseSelector, alreadyProcessedIds) => {
       const allButtons = document.querySelectorAll(baseSelector);
       // ...
     },
     args: [normalizedSelector, processedIds],
   });
   ```

2. For Playwright, `normalizedSelector` is `"a:has-text(\"Откликнуться\")"` and `processedIds` is `[]` (empty Set converted to array).

3. The buggy `PlaywrightAdapter.evaluateOnPage()` receives `args = ["a:has-text(...)", []]` and calls:
   ```javascript
   this.page.evaluate(fn, ["a:has-text(...)", []]);
   ```

4. Playwright passes this single array to the function. The function signature `(baseSelector, alreadyProcessedIds)` expects two separate arguments, but receives:
   - `baseSelector = ["a:has-text(...)", []]` (the entire array!)
   - `alreadyProcessedIds = undefined`

5. When `document.querySelectorAll(baseSelector)` is called, JavaScript converts the array to a string:
   ```javascript
   ["a:has-text(\"Откликнуться\")", []].toString()
   // Results in: "a:has-text(\"Откликнуться\"),"
   ```
   The empty array becomes an empty string, resulting in a trailing comma.

### Evidence

```javascript
// Reproducing the bug:
> ["a:has-text(\"Откликнуться\")", []].toString()
'a:has-text("Откликнуться"),'

// This matches the error message exactly!
```

## The Underlying Design Issue

### Playwright vs Puppeteer evaluate() API Differences

**Playwright** ([documentation](https://playwright.dev/docs/evaluating)):
- `page.evaluate(fn, arg)` takes a single optional argument
- To pass multiple values, use an object or array with destructuring:
  ```javascript
  await page.evaluate(({ a, b }) => a + b, { a: 1, b: 2 });
  await page.evaluate(([a, b]) => a + b, [1, 2]);
  ```

**Puppeteer** ([documentation](https://pptr.dev/api/puppeteer.page.evaluate)):
- `page.evaluate(fn, ...args)` spreads multiple arguments:
  ```javascript
  await page.evaluate((a, b) => a + b, 1, 2);
  ```

## Solution: Fix in PlaywrightAdapter

The fix is implemented in `src/browser-commander/core/engine-adapter.js`. When there are multiple arguments, we:

1. Convert the function to a string
2. Pass both the function string and arguments array to the browser context
3. In the browser, reconstruct the function and call it with spread arguments

```javascript
async evaluateOnPage(fn, args = []) {
  // Playwright only accepts a single argument (can be array/object)
  // To match Puppeteer's behavior where args are spread, we wrap the function
  // and pass all args as a single array, then apply them in the browser context
  if (args.length === 0) {
    return await this.page.evaluate(fn);
  } else if (args.length === 1) {
    return await this.page.evaluate(fn, args[0]);
  } else {
    // Multiple args - wrap function to accept array and spread them
    // This makes Playwright behave like Puppeteer's spread behavior
    // We pass the function string and args array, then reconstruct and call in browser
    const fnString = fn.toString();
    return await this.page.evaluate(({ fnStr, argsArray }) => {
      // Reconstruct the function in browser context and call with spread args
      const reconstructedFn = new Function('return (' + fnStr + ')')();
      return reconstructedFn(...argsArray);
    }, { fnStr: fnString, argsArray: args });
  }
}
```

### Why This Works

1. **Function string serialization**: We convert the function to a string using `fn.toString()`
2. **Single argument passing**: We pass a single object `{ fnStr, argsArray }` to satisfy Playwright's API
3. **Function reconstruction**: In the browser context, we use `new Function()` to reconstruct the original function
4. **Argument spreading**: We call the reconstructed function with spread arguments `...argsArray`

This approach:
- Requires **no changes to existing call sites** (transparent fix)
- Works for both Playwright and Puppeteer
- Handles any number of arguments correctly

## Testing

The fix was verified with:

1. **Unit tests**: All existing tests pass (`npm test`)
2. **Lint checks**: No ESLint errors (`npm run lint`)
3. **Experiment script**: `experiments/test-playwright-multi-args.mjs` - verifies the fix handles:
   - Single argument
   - Multiple arguments (the bug case)
   - Three or more arguments
   - Mixed types (string + array)
   - Complex arrow functions

## Prevention

To prevent similar issues in the future:

1. **Unified API documentation**: Document that `PlaywrightAdapter` and `PuppeteerAdapter` have different argument handling behaviors
2. **Testing**: Add integration tests that verify both Playwright and Puppeteer engines work with the same code paths
3. **Engine adapter abstraction**: The engine adapter should abstract away API differences between engines
4. **Code review**: When modifying engine-specific code, always test with both engines

## References

- [Playwright Evaluating JavaScript Documentation](https://playwright.dev/docs/evaluating)
- [Puppeteer page.evaluate() Documentation](https://pptr.dev/api/puppeteer.page.evaluate)
- Related Issues: #130, #132

## Files Modified

- `src/browser-commander/core/engine-adapter.js` - Fixed `PlaywrightAdapter.evaluateOnPage()` to handle multiple arguments correctly
- `docs/case-studies/issue-132/` - Added case study documentation
- `experiments/test-playwright-multi-args.mjs` - Added experiment to verify the fix
