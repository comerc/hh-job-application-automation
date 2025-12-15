# Issue 136: Root Cause Analysis

## Summary

The root cause of duplicate field filling is that `handleVacancyResponsePage()` is called from **two independent code paths** that both trigger when navigating to a `vacancy_response` URL:

1. **Legacy Handler** in `vacancies.mjs:808` - Called from `handlePostClickNavigation()` when URL changes to a vacancy_response pattern
2. **PageTrigger Handler** in `page-triggers.mjs:137` - The newer pageTrigger system also detects the same URL pattern and triggers its own handler

Both handlers run concurrently, causing the form to be filled twice.

## Affected Code Paths

### Path 1: Legacy Handler (vacancies.mjs)

```
findAndProcessVacancyButton()
  └── handlePostClickNavigation()
        └── if (vacancyResponsePattern.test(currentUrl))
              └── await handleVacancyResponsePage(); // Line 808
```

This path is called when:
1. User clicks "Откликнуться" button
2. Button click triggers navigation to vacancy_response page
3. `handlePostClickNavigation()` detects the URL change

### Path 2: PageTrigger Handler (page-triggers.mjs)

```
setupPageTriggers()
  └── registerPageTriggers()
        └── commander.pageTrigger({
              name: 'vacancy-response-page',
              condition: createVacancyResponseCondition(),
              action: async (ctx) => {
                await handleVacancyResponsePage(); // Line 137
              }
            })
```

This path is called when:
1. Navigation completes
2. PageTrigger system evaluates URL conditions
3. `vacancy-response-page` trigger matches the URL pattern

## Why This Wasn't Caught Earlier

The code comments in `page-handlers.mjs` and `orchestrator.mjs` indicate that the pageTrigger system was meant to **replace** the legacy handlers:

```javascript
// page-handlers.mjs:9-10
// NOTE: This module contains legacy handlers that use onUrlChange pattern.
// The primary navigation handling is now done by page-triggers.mjs using the
// pageTrigger pattern from browser-commander.
```

However, the legacy calls to `handleVacancyResponsePage()` in `vacancies.mjs` were **not removed** when the pageTrigger system was added. This is a **migration incompleteness** bug.

## Proposed Solutions

### Solution 1: Remove Legacy Calls (Recommended)

Remove the calls to `handleVacancyResponsePage()` from `vacancies.mjs` since the pageTrigger system now handles this:

**Files to modify:**
- `vacancies.mjs:306` - Remove call in `validateTargetPage()`
- `vacancies.mjs:808` - Remove call in `handlePostClickNavigation()`

**Pros:**
- Clean solution that completes the migration to pageTriggers
- Removes code duplication
- Aligns with code comments indicating legacy handlers are deprecated

**Cons:**
- Need to ensure pageTrigger system handles all edge cases

### Solution 2: Add Execution Guard

Add a guard to prevent duplicate execution of `handleVacancyResponsePage()`:

```javascript
// In vacancy-response.mjs
let isHandlingVacancyResponse = false;

export async function handleVacancyResponsePage(options) {
  // Prevent concurrent execution
  if (isHandlingVacancyResponse) {
    console.log('Already handling vacancy response page, skipping duplicate call');
    return;
  }

  isHandlingVacancyResponse = true;
  try {
    // ... existing code ...
  } finally {
    isHandlingVacancyResponse = false;
  }
}
```

**Pros:**
- Safe fallback even if legacy code remains
- Quick fix

**Cons:**
- Doesn't address the root cause (duplicate code paths)
- Can mask other issues

### Solution 3: Hybrid Approach (Recommended)

1. Remove legacy calls from `vacancies.mjs`
2. Keep a guard in `handleVacancyResponsePage()` as a safety measure

This ensures:
- Clean migration to pageTriggers
- Safety net for any remaining edge cases
- Clear logging when duplicate calls are detected

## Impact Assessment

### High Impact
- Text fields contain duplicated content
- User experience degraded
- Application form may fail validation if text is too long

### Affected Features
- Cover letter auto-fill (sometimes affected)
- Q&A question auto-fill (frequently affected)
- Auto-save functionality (duplicated saves visible in logs)

## Related Issues

- Issue #122: Also about duplicate text filling, but for different root cause (multiple questions targeting same selector)
- Issue #89: Original migration to pageTrigger pattern (referenced in code comments)

## Test Plan

1. Navigate to a vacancy with test questions
2. Click "Откликнуться"
3. Verify text fields are filled only once
4. Check console logs for any "Already handling" messages
5. Verify auto-save only happens once per change
