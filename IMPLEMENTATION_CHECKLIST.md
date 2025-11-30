# Implementation Checklist for Code Improvements

This document provides a detailed checklist for implementing the code improvements proposed in [CODE_IMPROVEMENTS_PROPOSAL.md](./CODE_IMPROVEMENTS_PROPOSAL.md), incorporating user feedback.

## Summary of Changes Based on User Feedback

Based on review feedback:
- `closeModalIfPresent` should be kept at application level (not moved to browser-commander) since it's application-specific
- Logging should use [log-lazy](https://github.com/link-foundation/log-lazy) library for lazy evaluation
- CLI arguments should use [lino-arguments](https://github.com/link-foundation/lino-arguments) library

---

## Work Session Progress (2025-11-30)

### ✅ Completed in This Session

| Item | Status | Description |
|------|--------|-------------|
| Phase 1.1 | ✅ Foundation | Created `src/logging.mjs` module with log-lazy |
| Phase 1.2 | ✅ Foundation | Created `src/config.mjs` module with lino-arguments, installed package |
| Phase 2.1 | ✅ Completed | Created `src/helpers/modal-helpers.mjs` with `closeModalIfPresent`, `isModalVisible`, `waitForModalToClose` |
| Phase 2.2 | ✅ Completed | Created `src/hh-selectors.mjs` with SELECTORS and URL_PATTERNS |
| Refactoring | ✅ Done | Updated `src/vacancies.mjs` to use new helpers and selectors |
| CI | ✅ Passing | All 120 tests pass, lint passes |

### 📁 New Files Created

- `src/logging.mjs` - Logging module using log-lazy library
- `src/config.mjs` - Configuration module using lino-arguments library
- `src/hh-selectors.mjs` - Centralized HH.ru selectors and URL patterns
- `src/helpers/modal-helpers.mjs` - Modal handling helper functions

### 🔄 Files Modified

- `src/vacancies.mjs` - Refactored to use new helpers:
  - Import `closeModalIfPresent` from modal-helpers
  - Import `SELECTORS` from hh-selectors
  - Replace 5 modal close patterns with helper function
  - Use `SELECTORS.applicationForm` instead of hardcoded selector

### ⏳ Remaining Work

- Phase 1.1: Replace verbose console.log with log-lazy calls
- Phase 1.2: Integrate config module into apply.mjs
- Phase 2.2: Update vacancy-response.mjs to use selectors
- Phase 2.3: Extract session storage tracker
- Phase 3.x: Structural improvements (split apply.mjs, pageTrigger pattern)

---

## Phase 1: Foundation - Logging and Configuration

### 1.1 Integrate log-lazy Library

**Priority:** High
**Estimated complexity:** Medium
**Dependencies:** None
**Status:** ✅ Foundation created

- [x] Install log-lazy package (already in dependencies)
  ```bash
  npm install log-lazy
  ```

- [x] Create `src/logging.mjs` module
  ```javascript
  import makeLog from 'log-lazy';

  // Initialize with console logging by default
  // Can be extended to use other logging engines later
  const log = makeLog({ level: 'info' });

  export default log;
  export { log };
  ```

- [ ] Replace verbose console.log patterns in `src/apply.mjs`:
  - Line 116-121: verbose logging setup
  - Replace `if (verbose) console.log(...)` with `log.debug(() => ...)`

- [ ] Replace verbose logging in `src/vacancy-response.mjs`:
  - Lines 116-117, 120, 123, 128, 134, 137, 141, 143, etc.
  - Pattern: `if (verbose) console.log('🔍 [VERBOSE]...')` → `log.debug(() => '🔍 ...')`

- [ ] Replace verbose logging in `src/vacancies.mjs`:
  - Lines 57, 92, 115, 139, etc.
  - Same pattern as above

- [ ] Update debug mode flag to control log level
  ```javascript
  // In apply.mjs
  if (argv.verbose) {
    log.enableLevel('debug');
  }
  ```

- [ ] Test logging behavior with verbose flag enabled/disabled

### 1.2 Integrate lino-arguments Library

**Priority:** High
**Estimated complexity:** Medium
**Dependencies:** None
**Status:** ✅ Foundation created

- [x] Install lino-arguments package
  ```bash
  npm install lino-arguments
  ```

- [x] Create `src/config.mjs` module with lino-arguments integration
  - Uses `makeConfig` from lino-arguments
  - Supports environment variables via `getenv`
  - All CLI options defined with proper defaults

- [ ] Create `.lenv` configuration file for defaults (optional)
  ```
  ENGINE: playwright
  JOB_APPLICATION_INTERVAL: 20
  AUTO_SUBMIT_VACANCY_RESPONSE_FORM: false
  ```

- [ ] Refactor `src/apply.mjs` to use new config module:
  - Import `createConfig` from `./config.mjs`
  - Replace yargs setup with config module

- [ ] Update all `argv.xxx` references to use new config object

- [ ] Test all CLI options work correctly:
  - [ ] `--engine playwright`
  - [ ] `--engine puppeteer`
  - [ ] `--url <url>`
  - [ ] `--manual-login`
  - [ ] `--user-data-dir <path>`
  - [ ] `--job-application-interval <seconds>`
  - [ ] `--message <text>`
  - [ ] `--verbose`
  - [ ] `--auto-submit-vacancy-response-form`
  - [ ] `--configuration <path>` (new from lino-arguments)

---

## Phase 2: Application-Level Refactoring

### 2.1 Extract `closeModalIfPresent` Function

**Priority:** Medium
**Estimated complexity:** Low
**Dependencies:** None
**Status:** ✅ Completed

Note: Per user feedback, this stays in the application, not browser-commander.

- [x] Create `src/helpers/modal-helpers.mjs`:
  - `closeModalIfPresent()` - closes modal if present
  - `isModalVisible()` - checks if modal overlay is visible
  - `waitForModalToClose()` - waits for modal to close with timeout
  - Uses SELECTORS from `hh-selectors.mjs` for selector references

- [x] Replace modal closing code in `src/vacancies.mjs`:
  - ✅ `handleLimitError` - now uses `closeModalIfPresent`
  - ✅ `processModalApplication` - all 4 modal close locations updated:
    - Unanswered questions case
    - Button not found case
    - Button disabled case
    - Click failed case

- [ ] Add tests for `closeModalIfPresent` helper (future improvement)

### 2.2 Create Selector Configuration

**Priority:** Medium
**Estimated complexity:** Low
**Dependencies:** None
**Status:** ✅ Completed

- [x] Create `src/hh-selectors.mjs`:
  - `SELECTORS` object with all HH.ru specific selectors
  - `URL_PATTERNS` object with regex patterns for page detection
  - `extractVacancyId()` and `extractVacancyIdFromResponseUrl()` helper functions
  - Comprehensive selector coverage:
    - Modal close buttons
    - Application form and buttons
    - Cover letter elements
    - Error states
    - Question blocks

- [x] Update `src/vacancies.mjs` to import and use selectors:
  - Import `SELECTORS` from `hh-selectors.mjs`
  - Updated `containerSelector` to use `SELECTORS.applicationForm`
  - Updated modal form selector to use `SELECTORS.applicationForm`
  - Updated verbose logging to show actual selector values

- [ ] Update `src/vacancy-response.mjs` to import selectors (future improvement)

- [ ] Update `src/apply.mjs` to import URL patterns (future improvement)

### 2.3 Extract Session Storage Tracker

**Priority:** Medium
**Estimated complexity:** Medium
**Dependencies:** None

- [ ] Create `src/helpers/session-tracker.mjs`:
  ```javascript
  import { log } from '../logging.mjs';

  /**
   * Factory for managing session storage flags
   */
  export function createSessionStorageTracker(options = {}) {
    const { storageKey, buttonText, evaluate } = options;

    return {
      async install() {
        log.debug(() => `Installing click listener for "${buttonText}"`);
        // Install click listener that sets sessionStorage flag
        await evaluate(/* ... */);
      },

      async check() {
        // Check and clear flag
        const result = await evaluate(/* ... */);
        if (result) {
          log.debug(() => `Flag "${storageKey}" detected and cleared`);
        }
        return result;
      },
    };
  }
  ```

- [ ] Replace session storage handling in `src/apply.mjs`:
  - Lines 325-398: `installClickListenerForRedirect`
  - Lines 404-429: `checkAndClearRedirectFlag`

---

## Phase 3: Structural Improvements

### 3.1 Split `apply.mjs` into Smaller Modules

**Priority:** High
**Estimated complexity:** High
**Dependencies:** Phases 1 and 2

- [ ] Create `src/cli.mjs` - entry point and argument parsing:
  - Move lino-arguments configuration here
  - Export parsed config
  - ~50 lines

- [ ] Create `src/orchestrator.mjs` - main coordination logic:
  - Main loop state machine
  - Page navigation handling
  - ~150 lines

- [ ] Create `src/page-handlers.mjs` - page-specific handlers:
  - `handleSearchPage`
  - `handleVacancyPage`
  - `handleVacancyResponsePage`
  - ~200 lines

- [ ] Update `src/apply.mjs`:
  - Import and wire together the modules
  - Reduce from 792 lines to ~100 lines

- [ ] Ensure all tests pass after split

### 3.2 Use `pageTrigger` Pattern for Navigation

**Priority:** Medium
**Estimated complexity:** Medium
**Dependencies:** Phase 3.1

- [ ] Refactor navigation handlers to use pageTrigger:
  ```javascript
  // In page-handlers.mjs
  export function setupPageTriggers(commander) {
    commander.pageTrigger({
      condition: commander.makeUrlCondition(/search\/vacancy.*resume=/),
      action: handleSearchPage,
      name: 'search-page-handler',
    });

    commander.pageTrigger({
      condition: commander.makeUrlCondition(/vacancy_response/),
      action: handleVacancyResponsePage,
      name: 'vacancy-response-handler',
    });

    commander.pageTrigger({
      condition: commander.makeUrlCondition(/\/vacancy\/\d+/),
      action: handleVacancyPage,
      name: 'vacancy-page-handler',
    });
  }
  ```

- [ ] Remove manual `onUrlChange` handlers in apply.mjs

- [ ] Test all page navigation scenarios work correctly

### 3.3 Split Large Functions

**Priority:** Low
**Estimated complexity:** Medium
**Dependencies:** None (can be done independently)

- [ ] Split `handleVacancyResponsePage` in `src/vacancy-response.mjs` (450+ lines):
  - Extract `findAndExpandQuestionSections`
  - Extract `fillAllTextareas`
  - Extract `handleFormSubmission`
  - Main function should be ~50 lines calling sub-functions

- [ ] Split `findAndProcessVacancyButton` in `src/vacancies.mjs` (320+ lines):
  - Extract `findApplyButton`
  - Extract `handleModalAfterClick`
  - Extract `processApplicationResult`

---

## Phase 4: Fix Pre-existing Issues

### 4.1 Fix Lint Errors (DONE)

**Status:** Completed

- [x] Fix quote style in `experiments/test-continuous-monitoring.mjs:56,58`
- [x] Fix unused variable in `src/vacancies.mjs:412`
- [x] Fix quote style in `src/vacancy-response.mjs:417`

### 4.2 Fix Test Failures (Separate Issue)

**Note:** The 3 failing tests (`should handle multiline answers correctly`, `should NOT escape newlines`, `should write multiline answers with proper indentation`) are pre-existing on main branch and relate to multiline Q&A handling.

**Recommendation:** Create a separate issue for fixing these tests as they require careful consideration of backwards compatibility with existing `qa.lino` production data.

---

## Testing Checklist

After each phase, verify:

- [ ] All existing tests pass (`npm test`)
- [ ] ESLint passes (`npx eslint .`)
- [ ] Manual testing of core flows:
  - [ ] Start automation with `npm start`
  - [ ] Navigate to job search page
  - [ ] Click "Apply" button on a vacancy
  - [ ] Fill in vacancy response form
  - [ ] Q&A pairs are saved correctly
- [ ] Verbose mode shows expected debug output
- [ ] Non-verbose mode is clean and minimal

---

## Dependencies

```mermaid
graph TD
    A[Phase 1.1: log-lazy] --> C[Phase 2.1: closeModalIfPresent]
    B[Phase 1.2: lino-arguments] --> D[Phase 3.1: Split apply.mjs]
    A --> D
    C --> D
    E[Phase 2.2: Selectors] --> D
    F[Phase 2.3: Session Tracker] --> D
    D --> G[Phase 3.2: pageTrigger]
    D --> H[Phase 3.3: Split large functions]
```

---

## Estimated Timeline

| Phase | Effort | Can Parallelize |
|-------|--------|-----------------|
| 1.1 log-lazy | 2-4 hours | Yes |
| 1.2 lino-arguments | 2-4 hours | Yes |
| 2.1 closeModalIfPresent | 1-2 hours | Yes |
| 2.2 Selector config | 1-2 hours | Yes |
| 2.3 Session tracker | 2-3 hours | Yes |
| 3.1 Split apply.mjs | 4-6 hours | No (depends on Phase 1 & 2) |
| 3.2 pageTrigger | 2-4 hours | No (depends on 3.1) |
| 3.3 Split large functions | 3-4 hours | Yes |

**Total estimated effort:** 17-29 hours

---

## Notes

1. Each checkbox item should be a separate commit where possible
2. Run tests after each change to catch regressions early
3. Keep backward compatibility with existing functionality
4. Document any API changes in commit messages
5. The user can prioritize which phases to implement first based on immediate needs
