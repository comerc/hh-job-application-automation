# Issue 136: Proposed Solution - Execution Guard

## Solution Overview

We implemented a **guard mechanism** in `handleVacancyResponsePage()` to prevent concurrent execution. This is a simple, effective solution that:

1. Prevents the same handler from running twice concurrently
2. Logs a warning message when a duplicate call is detected
3. Provides utility functions for testing and debugging

## Implementation Details

### Changes Made

**File: `src/vacancy-response.mjs`**

1. Added module-level guard variables:
```javascript
let isHandlingVacancyResponse = false;
let currentHandlingUrl = null;
```

2. Added guard check at the start of `handleVacancyResponsePage()`:
```javascript
// Get current URL for guard check
const currentUrl = commander.getUrl();

// Guard against concurrent execution (fixes issue #136)
if (isHandlingVacancyResponse) {
  console.log(`⚠️  handleVacancyResponsePage already running for: ${currentHandlingUrl}`);
  console.log(`   Skipping duplicate call for: ${currentUrl}`);
  return;
}

// Set guard
isHandlingVacancyResponse = true;
currentHandlingUrl = currentUrl;
```

3. Added `finally` block to reset the guard:
```javascript
} finally {
  // Always reset guard when function completes (success or error)
  isHandlingVacancyResponse = false;
  currentHandlingUrl = null;
}
```

4. Added utility functions for testing:
```javascript
export function resetVacancyResponseGuard() { ... }
export function isVacancyResponseHandlingInProgress() { ... }
```

### Why This Solution?

1. **Minimal Changes**: Only modifies one file (`vacancy-response.mjs`)
2. **Safe**: Uses `finally` block to ensure guard is always reset
3. **Observable**: Logs when duplicate calls are detected
4. **Testable**: Exports utility functions for testing
5. **No Breaking Changes**: Existing code paths continue to work

### Alternative Considered: Remove Legacy Calls

We could also remove the legacy calls in `vacancies.mjs`:
- Line 306 in `validateTargetPage()`
- Line 808 in `handlePostClickNavigation()`

However, the guard solution is safer because:
- It doesn't require understanding all edge cases of the legacy code
- It provides visibility into when duplicates occur
- It can be combined with legacy code removal later

## Verification

### Manual Testing
1. Run the application with verbose mode enabled
2. Navigate to a vacancy with test questions
3. Click "Откликнуться"
4. Check console for either:
   - Normal operation (single "Detected vacancy_response page" message)
   - Guard activation ("`⚠️  handleVacancyResponsePage already running`" message)

### Expected Console Output (with guard active)
```
⚠️  handleVacancyResponsePage already running for: https://hh.ru/applicant/vacancy_response?vacancyId=...
   Skipping duplicate call for: https://hh.ru/applicant/vacancy_response?vacancyId=...
```

### Unit Test
```bash
node experiments/test-issue-136-guard.js
```

Expected output:
```
Test 1: Guard should start as false
✅ Test 1 passed: Guard is initially false

Test 2: Verify exports are properly available
✅ Test 2 passed: Exports are properly available

All basic tests passed!
```

## Future Improvements

If this issue recurs or we want a more permanent fix:
1. Remove the legacy `handleVacancyResponsePage()` calls from `vacancies.mjs`
2. Ensure the pageTrigger system handles all edge cases
3. Add integration tests to verify single-call behavior
