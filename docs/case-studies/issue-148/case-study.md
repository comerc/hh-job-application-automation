# Case Study: Issue #148 - Invalid Selector with Trailing Comma

## Issue Summary

**Error Message:**
```
SyntaxError: Failed to execute 'querySelectorAll' on 'Document': '[data-qa="vacancy-serp__vacancy_response"],' is not a valid selector
```

**Root Cause:** When an array is passed as a single argument to a browser function that expects a string selector, JavaScript's implicit type coercion converts the array to a string with a trailing comma.

## Technical Analysis

### The Error Pattern

When `document.querySelectorAll()` receives an array as its argument instead of a string:
```javascript
// Array passed as selector
const selector = ['[data-qa="vacancy-serp__vacancy_response"]', []];
document.querySelectorAll(selector);
// JavaScript implicitly calls selector.toString()
// Result: "[data-qa=\"vacancy-serp__vacancy_response\"]," + "" = "[data-qa=\"vacancy-serp__vacancy_response\"],"
```

The trailing comma comes from the empty array `[]` being converted to an empty string, but the comma separator between array elements remains.

### Where This Happens

The bug manifests in Playwright's `page.evaluate()` when arguments are incorrectly handled. In `browser-commander`'s `PlaywrightAdapter.evaluateOnPage()`:

```javascript
async evaluateOnPage(fn, args = []) {
  if (args.length === 0) {
    return await this.page.evaluate(fn);
  } else if (args.length === 1) {
    // BUG TRIGGER: If args = [[selector, ids]], args.length is 1
    // args[0] becomes [selector, ids], passed as first arg to fn
    return await this.page.evaluate(fn, args[0]);
  } else {
    // Correct multi-arg handling with function reconstruction
    const fnString = fn.toString();
    return await this.page.evaluate(
      ({ fnStr, argsArray }) => {
        const reconstructedFn = new Function(`return (${fnStr})`)();
        return reconstructedFn(...argsArray);
      },
      { fnStr: fnString, argsArray: args }
    );
  }
}
```

**The Issue:** When `args = [[selector, ids]]` (accidentally double-nested), `args.length === 1`, triggering the single-arg branch. The entire array `[selector, ids]` is passed as the first parameter.

### Reproduction Steps

```javascript
const page = await browser.newPage();
await page.setContent(`
  <html>
    <body>
      <a data-qa="vacancy-serp__vacancy_response">Откликнуться</a>
    </body>
  </html>
`);

const selector = '[data-qa="vacancy-serp__vacancy_response"]';
const ids = [];

// WRONG: Double-nested args
const wrongArgs = [[selector, ids]];
console.log(wrongArgs.length); // 1 - triggers single-arg branch

await page.evaluate(
  (baseSelector, processedIds) => {
    // baseSelector is now [selector, ids], not a string!
    document.querySelectorAll(baseSelector); // Throws error
  },
  wrongArgs[0]  // Passes array as first arg
);
```

### Investigation Findings

1. **browser-commander v0.5.3 contains the fix** for multi-argument handling (Issue #132)
2. **The correct code path works**: When `args = [selector, ids]` (length 2), the multi-arg branch handles it correctly
3. **The bug occurs when** `args` is double-nested or somehow `args.length === 1` when there should be 2 args

### Potential Causes

1. **Accidental double-wrapping** of args somewhere in the call chain
2. **Race condition** where the selector value becomes corrupted
3. **Dependency version mismatch** between npm/bun lock files
4. **Stale cache** in bun's node_modules

## Workarounds

### 1. Validate Selector Before Use (Application-Level)

```javascript
async function findVacancyButton({ commander }) {
  const baseButtonSelector = await commander.findByText({
    text: 'Откликнуться',
    selector: 'a'
  });

  const normalizedSelector = await commander.normalizeSelector({
    selector: baseButtonSelector
  });

  // DEFENSIVE: Validate selector is a string
  if (typeof normalizedSelector !== 'string') {
    console.error('Invalid selector type:', typeof normalizedSelector, normalizedSelector);
    return { selector: null, count: 0, status: 'invalid_selector' };
  }

  // Continue with safeEvaluate...
}
```

### 2. Clean Install Dependencies

```bash
# Remove cached dependencies
rm -rf node_modules
rm -rf bun.lock
rm -rf package-lock.json

# Reinstall
npm install
# or
bun install
```

### 3. Pin Exact browser-commander Version

```json
{
  "dependencies": {
    "browser-commander": "0.5.3"  // Not "^0.5.3"
  }
}
```

## Suggested Fix for browser-commander

The issue could be made more robust by validating args in `evaluateOnPage`:

```javascript
async evaluateOnPage(fn, args = []) {
  // Defensive: Detect accidentally double-nested args
  if (args.length === 1 && Array.isArray(args[0]) && args[0].length > 1) {
    console.warn('Warning: args appears to be double-nested, unwrapping');
    args = args[0];
  }

  if (args.length === 0) {
    return await this.page.evaluate(fn);
  } else if (args.length === 1) {
    return await this.page.evaluate(fn, args[0]);
  } else {
    // Multi-arg handling...
  }
}
```

However, this is a heuristic and may not cover all cases. The better fix is to ensure args are never double-wrapped in the first place.

## Related Issues

- Issue #132: Original trailing comma bug in browser-commander
- browser-commander v0.5.3: Contains the fix for multi-arg handling

## Test Files

Created experiments to reproduce and understand the issue:
- `experiments/test-issue-148-trailing-comma.mjs` - Basic reproduction
- `experiments/test-issue-148-exact-scenario.mjs` - Exact scenario from findVacancyButton
- `experiments/test-issue-148-deep-trace.mjs` - Detailed tracing of evaluateOnPage
- `experiments/test-issue-148-normalizeSelector.mjs` - normalizeSelector edge cases

## Conclusion

The trailing comma error is caused by JavaScript's array-to-string coercion when `querySelectorAll` receives an array instead of a string. The browser-commander v0.5.3 fix handles the normal case correctly, but if args are accidentally double-nested (`[[selector, ids]]` instead of `[selector, ids]`), the bug resurfaces.

The fix should include:
1. Defensive validation in the application code
2. Clean dependency reinstall to eliminate cache issues
3. Report to browser-commander for potential defensive handling in the library
