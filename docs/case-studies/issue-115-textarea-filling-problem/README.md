# Issue #115: Multiple Textarea Filling Problems - Case Study

## Quick Links

- **Main Case Study**: [case-study.md](./case-study.md)
- **Issue**: [#115](https://github.com/konard/hh-job-application-automation/issues/115)
- **Related Issue**: [#80](https://github.com/konard/hh-job-application-automation/issues/80)
- **Pull Request**: [#116](https://github.com/konard/hh-job-application-automation/pull/116)

## Problem Summary

Multiple problems with filling textareas simultaneously in HH.ru job application forms:

1. **Text Duplication**: Same text appearing twice ("Да.Да.", "Удалённая работа Удалённая работа.")
2. **Character Corruption**: Characters doubled and garbled ("ООт 445500000000 ррууббллнееййй...")
3. **Non-Empty Textarea Skipping**: System skips filling textareas that already have content

## Key Findings

- **One problem is FIXED**: Concurrent typing bug (commit 15d0114)
- **Two problems NEED INVESTIGATION**: Text duplication and character corruption in edge cases
- **One DESIGN DECISION NEEDED**: How to handle non-empty textareas

## Files in This Case Study

- `case-study.md` - Complete analysis (22KB)
- `screenshot.png` - Visual evidence from issue
- `issue-80-data.json` - Related issue #80 data
- `pr-116-data.json` - Pull request metadata
- `README.md` - This file

## Quick Reference

### Root Cause (Concurrent Bug - FIXED)

```javascript
// Before: Global index could match wrong textarea
const selector = `textarea:nth-of-type(${index + 1})`;

// After: Unique attribute-based selector
if (textarea.name) {
  selector = `textarea[name="${textarea.name}"]`;
} else {
  const uniqueId = `qa-temp-${Date.now()}-${taskIndex}`;
  textarea.setAttribute('data-qa-temp-id', uniqueId);
  selector = `textarea[data-qa-temp-id="${uniqueId}"]`;
}
```

### Recommended Next Steps

1. Test with the concurrent fix to see if problems are reduced
2. Check Q&A database (`data/qa.lino`) for duplicate entries
3. Add detailed logging to track fill operations
4. Implement proposed solutions from case study

## Related Code Files

- `src/qa.mjs` - Q&A extraction and filling logic (FIXED in commit 15d0114)
- `src/vacancy-response.mjs` - Vacancy response page handler
- `src/browser-commander/interactions/fill.js` - Low-level filling implementation
- `tests/issue-80-textarea-filling.test.mjs` - Textarea filling tests

## Experiments

Several experiment files were created during issue #80 investigation:
- `experiments/analyze-issue-80-framework.mjs`
- `experiments/test-issue-80-textarea-filling.mjs`
- `experiments/test-issue-80-accurate-simulation.mjs`
- `experiments/test-issue-80-fix-verification.mjs`

These files analyze HH.ru's Magritte framework and verify fixes.

---

📅 Case Study Date: 2025-12-01
🤖 Generated with Claude Code
