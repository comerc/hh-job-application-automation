# Case Study: Issue #124 - Direct Application Modal Detection and Skip

## Summary

This case study documents the investigation and resolution of GitHub issue #124, which addressed the need to automatically skip "direct application" vacancies on hh.ru - vacancies that redirect to an external employer website instead of allowing applications through the hh.ru platform.

## Problem Statement

When automating job applications on hh.ru, the system encountered a specific type of vacancy modal called "Вакансия с прямым откликом" (Vacancy with direct response). Unlike regular vacancies, these require the user to fill out an application form on the employer's external website, which cannot be automated.

### The Direct Application Modal Structure

The modal displays:
- **Title**: "Вакансия с прямым откликом" (Vacancy with direct response)
- **Description**: "Откликнуться на эту вакансию Вы можете, заполнив анкету на сайте работодателя" (You can apply for this vacancy by filling out a form on the employer's website)
- **Primary button**: "Откликнуться на вакансию" (Apply for vacancy) - links to external site
- **Cancel button**: "Отменить" (Cancel) - closes the modal

### Key HTML Structure

```html
<div class="magritte-desktop-container___26vkq_3-1-14">
  <div class="magritte-main___iCU-E_3-1-14" data-qa="magritte-alert">
    <div class="magritte-title___yG219_3-1-14">Вакансия с прямым откликом</div>
    <div class="magritte-description___KeNoT_3-1-14">
      Откликнуться на эту вакансию Вы можете, заполнив анкету на сайте работодателя.
    </div>
  </div>
  <div class="magritte-buttons___lyxBC_3-1-14">
    <a data-qa="vacancy-response-link-advertising" href="...">Откликнуться на вакансию</a>
    <button data-qa="vacancy-response-link-advertising-cancel">Отменить</button>
  </div>
</div>
```

## Timeline of Events

### Phase 1: Initial Issue Report (Dec 11, 2025)

- Issue #124 was created to request automatic skipping of direct applications
- The screenshot and HTML structure were provided showing the modal
- The expected behavior was: click "Отменить" and move to the next vacancy

### Phase 2: Investigation and Failed Attempts

The initial problem was that the automation waited for the standard application modal form:
```javascript
await commander.waitForSelector({
  selector: 'form#RESPONSE_MODAL_FORM_ID[name="vacancy_response"]',
  visible: true,
  timeout: 10000,
});
```

Since direct application modals don't contain this form, the automation would timeout and skip the button without properly detecting the direct application modal.

### Phase 3: Root Cause Analysis

The key findings were:

1. **Different container**: Direct application modals use `data-qa="magritte-alert"` instead of `data-qa="modal-overlay"`
2. **Missing form**: There is no `form#RESPONSE_MODAL_FORM_ID` element in direct application modals
3. **Unique identifier**: The cancel button has `data-qa="vacancy-response-link-advertising-cancel"`

### Phase 4: Solution Implementation (PR #128)

The fix implemented in PR #128 added a new function `checkAndCloseDirectApplicationModal()` in `src/helpers/modal-helpers.mjs`:

```javascript
export async function checkAndCloseDirectApplicationModal(options = {}) {
  const { commander, verbose = false } = options;

  try {
    // Check if the direct application cancel button exists
    const cancelButtonSelector = SELECTORS.directApplicationCancelButton;
    const count = await commander.count({ selector: cancelButtonSelector });

    if (count > 0) {
      // Verify by checking for direct application text
      const isDirectApp = await commander.safeEvaluate({
        fn: () => {
          // Look for magritte-alert container
          const magritteAlert = document.querySelector('[data-qa="magritte-alert"]');
          if (magritteAlert) {
            const alertText = magritteAlert.textContent || '';
            if (alertText.includes('Вакансия с прямым откликом') ||
                alertText.includes('прямым откликом') ||
                alertText.includes('сайте работодателя')) {
              return { found: true, reason: 'magritte-alert with direct application text' };
            }
          }
          // Fallback checks...
        },
        // ...
      });

      if (isDirectApp.value && isDirectApp.value.found) {
        // Click cancel button to close modal
        await commander.clickButton({ selector: cancelButtonSelector, scrollIntoView: false });
        await commander.wait({ ms: 1000, reason: 'direct application modal to close' });
        return { isDirectApplication: true, closed: true };
      }
    }
    return { isDirectApplication: false, closed: false };
  } catch (error) {
    return { isDirectApplication: false, closed: false };
  }
}
```

### Phase 5: Verification (Dec 13, 2025)

The fix was verified working with the following log output:

```
🔍 Standard modal form not found, checking for direct application modal...
🔍 [VERBOSE] checkAndCloseDirectApplicationModal: found 1 cancel button(s) with selector: [data-qa="vacancy-response-link-advertising-cancel"]
🔍 [VERBOSE] checkAndCloseDirectApplicationModal: detection result = {"found":true,"reason":"magritte-alert with direct application text"}
💡 Detected direct application modal (application on external site)
   Detection reason: magritte-alert with direct application text
⏭️  Automatically skipping this vacancy...
✅ Direct application skipped, continuing with next vacancy...
```

## Files Modified

### `src/helpers/modal-helpers.mjs`
- Added `checkAndCloseDirectApplicationModal()` function
- Implements detection logic using multiple fallback strategies
- Includes verbose logging for debugging

### `src/hh-selectors.mjs`
- Added `directApplicationCancelButton` selector: `'[data-qa="vacancy-response-link-advertising-cancel"]'`
- Added `directApplicationAlert` selector: `'[data-qa="magritte-alert"]'`

### `src/vacancies.mjs`
- Updated `waitForApplicationModal()` to call `checkAndCloseDirectApplicationModal()` when standard modal doesn't appear
- Returns `directApplication: true` status for proper flow control

## Detection Strategy

The solution uses a multi-layered detection approach:

1. **Primary check**: Look for cancel button with `data-qa="vacancy-response-link-advertising-cancel"`
2. **Text verification via magritte-alert**: Check `data-qa="magritte-alert"` container for Russian text indicating direct application
3. **Fallback via DOM traversal**: Walk up the DOM from cancel button to find parent containers with the text
4. **Fallback via modal-overlay**: Check original `data-qa="modal-overlay"` as additional fallback

## Lessons Learned

1. **Modal structure varies**: hh.ru uses different modal containers for different purposes
2. **Text-based detection is robust**: Checking for specific Russian text ensures we don't accidentally close other modals
3. **Multiple fallbacks are important**: The DOM structure may change, so having multiple detection methods increases reliability
4. **Verbose logging aids debugging**: The detailed logging helped identify exactly what the code was detecting

## References

- Issue: https://github.com/konard/hh-job-application-automation/issues/124
- Fix PR: https://github.com/konard/hh-job-application-automation/pull/128
- Verification PR: https://github.com/konard/hh-job-application-automation/pull/129
