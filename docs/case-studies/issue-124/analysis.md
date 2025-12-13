# Case Study: Issue #124 - Direct Application Modal Detection Failure

## Issue Summary
The automation fails to detect and close direct application modals ("Вакансия с прямым откликом"), causing the automation to get stuck.

## Timeline of Events

1. **Initial Report**: User reported that when encountering a direct application modal, the automation doesn't click "Отменить" and gets stuck.

2. **PR #125 Implementation**: A fix was merged that added `checkAndCloseDirectApplicationModal()` function to detect and close these modals.

3. **Post-merge Failure**: The fix didn't work in production. User confirmed the issue persists.

## Root Cause Analysis

### The Problem
The `checkAndCloseDirectApplicationModal()` function in `src/helpers/modal-helpers.mjs` has a critical bug in its verification logic.

### Code Flow
```javascript
// Line 161-162: First, correctly finds the cancel button
const cancelButtonSelector = SELECTORS.directApplicationCancelButton;
const count = await commander.count({ selector: cancelButtonSelector });

if (count > 0) {
  // Line 170-184: Then, tries to verify it's a direct application modal
  const isDirectApp = await commander.safeEvaluate({
    fn: () => {
      // BUG: Looks for modal-overlay which doesn't exist for direct app modal
      const modalOverlay = document.querySelector('[data-qa="modal-overlay"]');
      if (!modalOverlay) return false;  // <-- Returns false here!

      const modalText = modalOverlay.textContent || '';
      return modalText.includes('Вакансия с прямым откликом') ...
    },
    ...
  });

  // Since isDirectApp.value is false, the cancel button is never clicked
}
```

### HTML Structure Comparison

**Regular Application Modal** (has `modal-overlay`):
```html
<div data-qa="modal-overlay">
  <div data-qa="modal">
    <form id="RESPONSE_MODAL_FORM_ID" name="vacancy_response">
      ...
    </form>
  </div>
</div>
```

**Direct Application Modal** (uses `magritte-alert`):
```html
<div class="magritte-desktop-container___26vkq_3-1-14">
  <div class="magritte-main___iCU-E_3-1-14" data-qa="magritte-alert">
    <div class="magritte-title___yG219_3-1-14">Вакансия с прямым откликом</div>
    <div class="magritte-description___KeNoT_3-1-14">...</div>
  </div>
  <div class="magritte-buttons___lyxBC_3-1-14">
    <a data-qa="vacancy-response-link-advertising">Откликнуться на вакансию</a>
    <button data-qa="vacancy-response-link-advertising-cancel">Отменить</button>
  </div>
</div>
```

### Log Evidence
From `apply.mjs.log.txt` (line 995):
```
   - modal overlay exists: false
   - form exists: false
```

This shows that after clicking the "Откликнуться" button:
1. The standard modal overlay doesn't exist (`modal overlay exists: false`)
2. The standard application form doesn't exist (`form exists: false`)
3. However, the body has `overflow: clip` indicating a modal-like overlay is present

The direct application modal appeared, but the detection logic failed because it was looking for the wrong container element.

## Solution

### Approach 1: Check for Cancel Button + Text in Document (Recommended)
Instead of looking inside `modal-overlay`, look for the cancel button AND verify the text exists anywhere on the page (or near the button):

```javascript
const isDirectApp = await commander.safeEvaluate({
  fn: () => {
    // Check if cancel button exists
    const cancelButton = document.querySelector('[data-qa="vacancy-response-link-advertising-cancel"]');
    if (!cancelButton) return false;

    // Check for direct application text anywhere in the document
    // (the modal must be visible since cancel button exists)
    const pageText = document.body.textContent || '';
    return pageText.includes('Вакансия с прямым откликом') ||
           pageText.includes('прямым откликом') ||
           pageText.includes('сайте работодателя');
  },
  defaultValue: false,
  operationName: 'direct application check',
});
```

### Approach 2: Check for magritte-alert Container
Add the magritte-alert container as an alternative to modal-overlay:

```javascript
const modalContainer = document.querySelector('[data-qa="modal-overlay"]') ||
                       document.querySelector('[data-qa="magritte-alert"]')?.closest('.magritte-desktop-container');
```

## Files to Modify
- `src/helpers/modal-helpers.mjs`: Fix `checkAndCloseDirectApplicationModal()` function

## Testing
1. Run existing unit tests to ensure no regression
2. Manual test with a vacancy that has direct application requirement
