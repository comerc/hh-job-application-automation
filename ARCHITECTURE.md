# HH Job Application Automation - Architecture

This document describes the architecture of the HH.ru job application automation system.

## Overview

The system automates job applications on HH.ru (HeadHunter) using browser automation. It consists of two main layers:

1. **browser-commander** - A generic browser automation library supporting Playwright and Puppeteer
2. **Application Layer** - HH.ru-specific automation logic

## Directory Structure

```
src/
├── apply.mjs                 # Entry point - CLI parsing, initialization
├── orchestrator.mjs          # Main coordination logic and state machine
├── page-handlers.mjs         # Navigation and click listener handlers
├── vacancies.mjs             # Vacancy button finding and processing
├── vacancy-response.mjs      # Response form handling (cover letter, Q&A)
├── qa.mjs                    # Q&A matching logic
├── qa-database.mjs           # Q&A database operations (Links Notation format)
├── config.mjs                # Configuration using lino-arguments
├── logging.mjs               # Logging using log-lazy
├── hh-selectors.mjs          # Centralized CSS selectors and URL patterns
├── helpers/
│   ├── modal-helpers.mjs     # Modal detection and closing helpers
│   └── session-tracker.mjs   # Session storage tracking for button clicks
└── browser-commander/        # Generic browser automation library
    └── (see browser-commander/ARCHITECTURE.md)
```

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              apply.mjs                                   │
│                         (Entry Point & CLI)                              │
│  • Parse CLI arguments (lino-arguments)                                  │
│  • Initialize browser and commander                                      │
│  • Create and start orchestrator                                         │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          orchestrator.mjs                                │
│                     (Main Coordination Logic)                            │
│  • State machine for page navigation                                     │
│  • URL condition waiting with redirect detection                         │
│  • Session storage flag management                                       │
│  • Coordinates page handlers                                             │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          │                     │                     │
          ▼                     ▼                     ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐
│ page-handlers   │  │  vacancies.mjs  │  │  vacancy-response.mjs       │
│     .mjs        │  │                 │  │                             │
│                 │  │ • Find vacancy  │  │ • Fill cover letter         │
│ • Navigation    │  │   buttons       │  │ • Handle Q&A questions      │
│   handlers      │  │ • Process       │  │ • Detect required fields    │
│ • Click         │  │   applications  │  │ • Submit form               │
│   listeners     │  │ • Handle modals │  │                             │
│ • URL change    │  │                 │  │ Helper functions:           │
│   callbacks     │  │                 │  │ • findCoverLetterTextarea() │
└─────────────────┘  └─────────────────┘  │ • expandCoverLetterSection()│
                                          │ • waitForTextareaSelector() │
                                          │ • findSubmitButton()        │
                                          │ • getSubmitButtonState()    │
                                          └─────────────────────────────┘
```

## Data Flow

```
1. User starts application with CLI arguments
                    │
                    ▼
2. Browser launched, commander created
                    │
                    ▼
3. Navigate to vacancy search page
                    │
                    ▼
4. Main loop starts (orchestrator)
         ┌─────────┴──────────┐
         │                    │
         ▼                    ▼
5a. Search Page         5b. Vacancy Page
    │                       │
    └──► Find & click       └──► Install click
         vacancy button          listener
         │                       │
         ▼                       ▼
6. Vacancy Response Page
    │
    ▼
7. Fill form (cover letter, Q&A)
    │
    ▼
8. Submit (if auto-submit enabled)
    │
    ▼
9. Return to search page → Loop
```

## Key Design Principles Applied

### Separation of Concerns
- **Entry Point** (`apply.mjs`): Only CLI parsing and initialization
- **Coordination** (`orchestrator.mjs`): State management, no business logic
- **Business Logic**: Distributed across `vacancies.mjs`, `vacancy-response.mjs`
- **Infrastructure**: `browser-commander`, `logging.mjs`, `config.mjs`

### Single Source of Truth
- **Selectors**: All CSS selectors in `hh-selectors.mjs`
- **URL Patterns**: All URL regexes in `hh-selectors.mjs`
- **Configuration**: Single `config.mjs` module using lino-arguments

### DRY (Don't Repeat Yourself)
- **Modal handling**: `closeModalIfPresent()` helper
- **Logging**: Centralized through `log-lazy` library
- **Session tracking**: `session-tracker.mjs` helper

### Small Units
- Large functions split into focused helpers
- `apply.mjs` reduced from 729 to 143 lines (80% reduction)
- `vacancy-response.mjs` split into 6+ helper functions

## Configuration

The application uses [lino-arguments](https://github.com/link-foundation/lino-arguments) for configuration:

| Option | Description | Default |
|--------|-------------|---------|
| `--engine` | Browser engine (playwright/puppeteer) | playwright |
| `--url` | Starting URL for job search | - |
| `--user-data-dir` | Browser profile directory | Auto-detected |
| `--message` | Default cover letter message | - |
| `--verbose` | Enable debug logging | false |
| `--manual-login` | Wait for manual login | false |
| `--job-application-interval` | Seconds between applications | 1 |
| `--auto-submit-vacancy-response-form` | Auto-submit forms | false |

## Logging

Uses [log-lazy](https://github.com/link-foundation/log-lazy) for lazy-evaluated logging:

```javascript
import { log } from './logging.mjs';

// Zero-cost when disabled - message function not called
log.debug(() => `Processing vacancy: ${vacancyId}`);
```

## Q&A Database

Q&A pairs stored in Links Notation format (`data/qa.lino`):

```
"Question text here"
  "Answer text here"

"Multi-option question"
  option1
  option2
  option3
```

## Testing

- **Unit Tests**: 120+ tests using Bun test runner
- **Test Database**: Separate test fixtures in `tests/fixtures/`
- **CI**: GitHub Actions runs lint + tests on every push

## Related Documentation

- [browser-commander Architecture](./src/browser-commander/ARCHITECTURE.md)
- [Browser Commander README](./src/browser-commander/README.md)

## Future Improvements

See GitHub issues for planned enhancements:
- [#89](https://github.com/konard/hh-job-application-automation/issues/89) - Migrate to pageTrigger pattern
- [#90](https://github.com/konard/hh-job-application-automation/issues/90) - Split findAndProcessVacancyButton
- [#91](https://github.com/konard/hh-job-application-automation/issues/91) - Add helper unit tests
