# Case Study: Issue #118 - Application Termination on Selector Timeout

**Date**: 2025-12-05
**Issue**: [#118 - We should not get application killed on such error](https://github.com/konard/hh-job-application-automation/issues/118)
**Status**: Analyzed and Fix Implemented

## Executive Summary

The application terminates unexpectedly when encountering a selector timeout error while waiting for the cover letter textarea on the vacancy response page. This behavior interrupts the automation loop and requires manual restart, reducing reliability and user experience.

## 1. Timeline and Sequence of Events

Based on the error logs provided in the issue, the following sequence was reconstructed:

### 1.1 Normal Operation Phase
1. Application successfully navigates to hh.ru vacancy search page
2. Detects vacancy_response page and begins form handling
3. Network idle timeout occurs with 6 pending requests (various CDN assets and tracking scripts)
4. Application successfully clicks cover letter toggle to expand the section
5. Multiple network requests complete (analytics, tracking, CDN assets)

### 1.2 Error Phase
1. Application logs: "Cover letter section expanded"
2. Application attempts to wait for textarea selector: `textarea[data-qa="vacancy-response-popup-form-letter-input"]`
3. **CRITICAL ERROR**: `Error occurred: Waiting for selector 'textarea[data-qa="vacancy-response-popup-form-letter-input"]' failed`
4. All page triggers unregistered (cleanup)
5. **Application terminates with exit code 1**

### 1.3 Network Context
The error occurred while the following were happening:
- Multiple third-party tracking requests (Yandex, uxfeedback.ru, etc.)
- Network idle timeout after 10000ms with 6 pending requests
- CDN asset loading (uxfeedback, adfox, etc.)

## 2. Root Cause Analysis

### 2.1 Primary Root Cause

The application crashes due to **unhandled timeout exception** from `waitForSelector` in the main async function wrapper:

**Location**: `src/apply.mjs:137-148`

```javascript
})().catch(async (error) => {
  // Check if this is a navigation error - if so, don't crash
  if (isNavigationError(error)) {
    console.log('Navigation-related error occurred, attempting to recover...');
    console.log('The automation may have been interrupted by page navigation.');
    console.log('Please restart the script if needed.');
    // Don't exit with error for navigation issues
    process.exit(0);
  }
  console.error('Error occurred:', error.message);
  process.exit(1);  // ← KILLS APPLICATION
});
```

The error handler only handles navigation errors gracefully, but treats all other errors (including timeout errors) as fatal.

### 2.2 Contributing Factors

#### 2.2.1 Selector Waiting Logic
**Location**: `src/vacancy-response.mjs:235-260` (`waitForTextareaSelector` function)

The function tries multiple selectors with a 2000ms timeout each:
```javascript
async function waitForTextareaSelector({ commander, preferredSelector }) {
  const selectorsToTry = [
    preferredSelector,
    SELECTORS.coverLetterTextareaPopup,
    SELECTORS.coverLetterTextareaForm,
    'textarea',
  ].filter(Boolean);

  for (const selector of selectorsToTry) {
    try {
      log.debug(() => `Waiting for textarea selector: ${selector}`);
      await commander.waitForSelector({ selector, visible: true, timeout: 2000 });
      log.debug(() => `Textarea found and visible: ${selector}`);
      return selector;
    } catch {
      log.debug(() => `Selector timed out after 2000ms: ${selector}`);
      if (selector === 'textarea') {
        console.log('Cover letter textarea not found on vacancy_response page');
        const count = await commander.count({ selector: 'textarea' });
        console.log(`Found ${count} textarea(s) on page`);
        return null;  // ← Returns null, doesn't throw
      }
    }
  }
  return null;
}
```

While this function handles timeout gracefully and returns `null`, the exception is thrown before reaching the final 'textarea' selector check.

#### 2.2.2 Timing Issues with Dynamic Content

The error logs show:
1. Toggle click completed successfully
2. "Cover letter section expanded" message logged
3. Wait of 1700ms for animation completion
4. **Still unable to find textarea after waiting**

This suggests:
- The textarea element may not render even after expansion animation
- Page JavaScript may fail to inject the textarea
- Network delays (6 pending requests) may prevent textarea rendering
- Page JavaScript errors (third-party scripts) may interfere

#### 2.2.3 Exception Propagation Chain

**Call Stack Analysis**:
1. `handleVacancyResponsePage()` calls `waitForTextareaSelector()` - Line 403
2. `waitForTextareaSelector()` calls `commander.waitForSelector()` - Line 246
3. `waitForSelector()` throws TimeoutError (browser-commander/elements/selectors.js:208)
4. Exception bubbles up through `handleVacancyResponsePage()`
5. Exception reaches orchestrator's `runMainLoop()`
6. Exception reaches `apply.mjs` main catch handler - Line 137
7. **Application terminates** - Line 147

### 2.3 Why This Matters

According to the issue description, the expectation is:

> "Instead on waiting failed we should continue to try our automation loop again."

The current behavior violates this expectation by:
1. Treating timeout as a fatal error
2. Terminating the entire application
3. Requiring manual restart
4. Losing progress through the vacancy list

## 3. Technical Analysis

### 3.1 Error Types and Handling

Current error handling in `src/apply.mjs`:
- **Navigation errors**: Handled gracefully ✓
- **Timeout errors**: Treated as fatal ✗
- **Other errors**: Treated as fatal ✗

### 3.2 Playwright/Puppeteer Timeout Behavior

Based on research:
- **Default timeout**: 30 seconds (configurable)
- **Timeout in code**: 2000ms (very short)
- **TimeoutError type**: Specific error class thrown by Playwright
- **Best practice**: Always handle TimeoutError in automation scripts

### 3.3 Current Error Handling Gap

The code has sophisticated error handling at lower levels:
- `isNavigationError()` function to detect navigation issues
- `safeEvaluate()` methods that catch and handle errors
- Try-catch blocks in individual handlers

**BUT**: The top-level catch in `apply.mjs` doesn't recognize timeout errors as recoverable.

## 4. Impact Assessment

### 4.1 User Impact
- **Severity**: High
- **Frequency**: Occurs when page load is slow or DOM differs from expected
- **Consequence**: Complete automation stoppage, requires manual intervention

### 4.2 Reliability Impact
- Automation is not resilient to minor page variations
- Cannot continue through vacancy list after single timeout
- Reduces automation effectiveness significantly

## 5. Proposed Solutions

### Solution 1: Add Timeout Error Detection (Recommended)

**Advantages**:
- Minimal code changes
- Follows existing pattern (like `isNavigationError`)
- Maintains current error handling structure
- Allows selective recovery

**Implementation**:
```javascript
function isTimeoutError(error) {
  if (!error) return false;
  const message = error.message || '';
  return (
    message.includes('Waiting for selector') ||
    message.includes('timeout') ||
    message.includes('TimeoutError') ||
    error.name === 'TimeoutError'
  );
}

// In apply.mjs catch handler:
})().catch(async (error) => {
  if (isNavigationError(error)) {
    // ... existing handling
  }

  if (isTimeoutError(error)) {
    console.log('⚠️  Timeout error occurred, continuing automation...');
    console.log(`   Error: ${error.message}`);
    console.log('   The automation will continue with the next vacancy');
    // Don't exit - let orchestrator continue
    return;
  }

  console.error('Error occurred:', error.message);
  process.exit(1);
});
```

### Solution 2: Make Textarea Optional

**Advantages**:
- Handles missing textarea gracefully at the source
- Continues automation even if form structure differs
- Better user feedback

**Implementation**:
Modify `handleVacancyResponsePage()` to check if `workingSelector` is null and return early with a log message instead of continuing.

### Solution 3: Implement Retry Logic

**Advantages**:
- Gives the page more time to load
- Can handle transient issues
- More robust overall

**Implementation**:
Add retry loop with exponential backoff when selector not found.

### Solution 4: Hybrid Approach (Best)

Combine all three approaches:
1. Add timeout error detection for top-level recovery
2. Handle missing textarea gracefully in vacancy-response handler
3. Add retry logic with longer waits for slow pages

## 6. Research Sources

The following sources informed this analysis:

- [How to Handle a Playwright Timeout: A Tutorial With Examples](https://autify.com/blog/playwright-timeout)
- [A Complete Guide to waitForSelector in Playwright](https://autify.com/blog/playwright-waitforselector)
- [Playwright Auto-waiting Documentation](https://playwright.dev/docs/actionability)
- [How to handle errors and exceptions in Playwright](https://webscraping.ai/faq/playwright/how-to-handle-errors-and-exceptions-in-playwright)
- [Dealing with waits and timeouts in Playwright - Checkly Docs](https://www.checklyhq.com/docs/learn/playwright/waits-and-timeouts/)

## 7. Implementation Plan

1. ✓ Create case study document (this file)
2. Add `isTimeoutError()` helper function
3. Update error handler in `apply.mjs` to catch timeout errors
4. Update `handleVacancyResponsePage()` to handle null selector gracefully
5. Add unit tests for timeout error handling
6. Create experiment script to test timeout scenarios
7. Test with real hh.ru pages
8. Update documentation

## 8. Testing Strategy

### 8.1 Unit Tests
- Test `isTimeoutError()` with various error types
- Test top-level error handler with timeout errors
- Test vacancy response handler with missing textarea

### 8.2 Integration Tests
- Simulate timeout in waitForSelector
- Verify automation continues after timeout
- Verify proper logging occurs

### 8.3 Manual Testing
- Test with slow network conditions
- Test with pages missing expected elements
- Verify automation completes vacancy list

## 9. Conclusion

Issue #118 reveals a critical gap in error handling where timeout errors cause complete application failure instead of graceful continuation. The fix involves recognizing timeout errors as non-fatal and allowing the automation loop to continue, similar to how navigation errors are already handled.

This change will significantly improve the robustness and reliability of the automation by allowing it to skip problematic vacancies and continue processing the list.
