/**
 * Browser Commander - Universal browser automation library
 * Supports both Playwright and Puppeteer with a unified API
 * All functions use options objects for easy maintenance
 */

// Import functions needed by makeBrowserCommander
import { createLogger } from './core/logger.js';
import { detectEngine } from './core/engine-detection.js';
import { wait, evaluate } from './utilities/wait.js';
import { getUrl, unfocusAddressBar } from './utilities/url.js';
import { waitForUrlStabilization, goto, waitForNavigation } from './browser/navigation.js';
import { createPlaywrightLocator, getLocatorOrElement, waitForLocatorOrElement, waitForVisible, locator } from './elements/locators.js';
import { querySelector, querySelectorAll, findByText, normalizeSelector, withTextSelectorSupport, waitForSelector } from './elements/selectors.js';
import { isVisible, isEnabled, count } from './elements/visibility.js';
import { textContent, inputValue, getAttribute, getInputValue, logElementInfo } from './elements/content.js';
import { scrollIntoView, needsScrolling, scrollIntoViewIfNeeded } from './interactions/scroll.js';
import { clickElement, clickButton } from './interactions/click.js';
import { checkIfElementEmpty, performFill, fillTextArea } from './interactions/fill.js';
import { waitForUrlCondition, installClickListener, checkAndClearFlag, findToggleButton } from './high-level/universal-logic.js';

// Re-export core utilities
export { CHROME_ARGS, TIMING } from './core/constants.js';
export { isVerboseEnabled, createLogger } from './core/logger.js';
export { disableTranslateInPreferences } from './core/preferences.js';
export { detectEngine } from './core/engine-detection.js';

// Re-export browser management
export { launchBrowser } from './browser/launcher.js';
export { waitForUrlStabilization, goto, waitForNavigation } from './browser/navigation.js';

// Re-export element operations
export {
  createPlaywrightLocator,
  getLocatorOrElement,
  waitForLocatorOrElement,
  waitForVisible,
  locator,
} from './elements/locators.js';

export {
  querySelector,
  querySelectorAll,
  findByText,
  normalizeSelector,
  withTextSelectorSupport,
  waitForSelector,
} from './elements/selectors.js';

export { isVisible, isEnabled, count } from './elements/visibility.js';

export {
  textContent,
  inputValue,
  getAttribute,
  getInputValue,
  logElementInfo,
} from './elements/content.js';

// Re-export interactions
export {
  scrollIntoView,
  needsScrolling,
  scrollIntoViewIfNeeded,
} from './interactions/scroll.js';

export { clickElement, clickButton } from './interactions/click.js';

export {
  checkIfElementEmpty,
  performFill,
  fillTextArea,
} from './interactions/fill.js';

// Re-export utilities
export { wait, evaluate } from './utilities/wait.js';
export { getUrl, unfocusAddressBar } from './utilities/url.js';

// Re-export high-level universal logic
export {
  waitForUrlCondition,
  installClickListener,
  checkAndClearFlag,
  findToggleButton,
} from './high-level/universal-logic.js';

/**
 * Create a browser commander instance for a specific page
 * @param {Object} options - Configuration options
 * @param {Object} options.page - Playwright or Puppeteer page object
 * @param {boolean} options.verbose - Enable verbose logging
 * @returns {Object} - Browser commander API
 */
export function makeBrowserCommander(options = {}) {
  const { page, verbose = false } = options;

  if (!page) {
    throw new Error('page is required in options');
  }

  const engine = detectEngine(page);
  const log = createLogger({ verbose });

  // Create bound helper functions that inject page, engine, log
  const waitBound = (opts) => wait({ ...opts, log });
  const evaluateBound = (opts) => evaluate({ ...opts, page, engine });
  const getUrlBound = () => getUrl({ page });
  const unfocusAddressBarBound = (opts = {}) => unfocusAddressBar({ ...opts, page });

  // Bound navigation
  const waitForUrlStabilizationBound = (opts) => waitForUrlStabilization({ ...opts, page, log, wait: waitBound });
  const gotoBound = (opts) => goto({ ...opts, page, waitForUrlStabilization: waitForUrlStabilizationBound });
  const waitForNavigationBound = (opts) => waitForNavigation({ ...opts, page });

  // Bound locators
  const createPlaywrightLocatorBound = (opts) => createPlaywrightLocator({ ...opts, page });
  const getLocatorOrElementBound = (opts) => getLocatorOrElement({ ...opts, page, engine });
  const waitForLocatorOrElementBound = (opts) => waitForLocatorOrElement({ ...opts, page, engine });
  const waitForVisibleBound = (opts) => waitForVisible({ ...opts, engine });
  const locatorBound = (opts) => locator({ ...opts, page, engine });

  // Bound selectors
  const querySelectorBound = (opts) => querySelector({ ...opts, page, engine });
  const querySelectorAllBound = (opts) => querySelectorAll({ ...opts, page, engine });
  const findByTextBound = (opts) => findByText({ ...opts, engine });
  const normalizeSelectorBound = (opts) => normalizeSelector({ ...opts, page });
  const waitForSelectorBound = (opts) => waitForSelector({ ...opts, page, engine });

  // Bound visibility
  const isVisibleBound = (opts) => isVisible({ ...opts, page, engine });
  const isEnabledBound = (opts) => isEnabled({ ...opts, page, engine });
  const countBound = (opts) => count({ ...opts, page, engine });

  // Bound content
  const textContentBound = (opts) => textContent({ ...opts, page, engine });
  const inputValueBound = (opts) => inputValue({ ...opts, page, engine });
  const getAttributeBound = (opts) => getAttribute({ ...opts, page, engine });
  const getInputValueBound = (opts) => getInputValue({ ...opts, page, engine });
  const logElementInfoBound = (opts) => logElementInfo({ ...opts, page, engine, log });

  // Bound scroll
  const scrollIntoViewBound = (opts) => scrollIntoView({ ...opts, page, engine });
  const needsScrollingBound = (opts) => needsScrolling({ ...opts, page, engine });
  const scrollIntoViewIfNeededBound = (opts) => scrollIntoViewIfNeeded({ ...opts, page, engine, wait: waitBound, log });

  // Bound click
  const clickElementBound = (opts) => clickElement({ ...opts, engine, log });
  const clickButtonBound = (opts) => clickButton({ ...opts, page, engine, wait: waitBound, log, verbose });

  // Bound fill
  const checkIfElementEmptyBound = (opts) => checkIfElementEmpty({ ...opts, page, engine });
  const performFillBound = (opts) => performFill({ ...opts, page, engine });
  const fillTextAreaBound = (opts) => fillTextArea({ ...opts, page, engine, wait: waitBound, log });

  // Bound high-level
  const waitForUrlConditionBound = (opts) => waitForUrlCondition({ ...opts, getUrl: getUrlBound, wait: waitBound, evaluate: evaluateBound });
  const installClickListenerBound = (opts) => installClickListener({ ...opts, evaluate: evaluateBound });
  const checkAndClearFlagBound = (opts) => checkAndClearFlag({ ...opts, evaluate: evaluateBound });
  const findToggleButtonBound = (opts) => findToggleButton({ ...opts, count: countBound, findByText: findByTextBound });

  // Wrap functions with text selector support
  const fillTextAreaWrapped = withTextSelectorSupport(fillTextAreaBound, engine, page);
  const clickButtonWrapped = withTextSelectorSupport(clickButtonBound, engine, page);
  const getAttributeWrapped = withTextSelectorSupport(getAttributeBound, engine, page);
  const isVisibleWrapped = withTextSelectorSupport(isVisibleBound, engine, page);
  const isEnabledWrapped = withTextSelectorSupport(isEnabledBound, engine, page);
  const textContentWrapped = withTextSelectorSupport(textContentBound, engine, page);
  const inputValueWrapped = withTextSelectorSupport(inputValueBound, engine, page);

  return {
    // Core properties
    engine,
    page,
    log,

    // Helper functions (now public)
    createPlaywrightLocator: createPlaywrightLocatorBound,
    getLocatorOrElement: getLocatorOrElementBound,
    waitForLocatorOrElement: waitForLocatorOrElementBound,
    scrollIntoView: scrollIntoViewBound,
    scrollIntoViewIfNeeded: scrollIntoViewIfNeededBound,
    needsScrolling: needsScrollingBound,
    checkIfElementEmpty: checkIfElementEmptyBound,
    performFill: performFillBound,
    logElementInfo: logElementInfoBound,
    normalizeSelector: normalizeSelectorBound,
    withTextSelectorSupport: (fn) => withTextSelectorSupport(fn, engine, page),
    waitForVisible: waitForVisibleBound,
    clickElement: clickElementBound,
    getInputValue: getInputValueBound,
    unfocusAddressBar: unfocusAddressBarBound,

    // Main API functions
    wait: waitBound,
    fillTextArea: fillTextAreaWrapped,
    clickButton: clickButtonWrapped,
    evaluate: evaluateBound,
    waitForSelector: waitForSelectorBound,
    querySelector: querySelectorBound,
    querySelectorAll: querySelectorAllBound,
    waitForUrlStabilization: waitForUrlStabilizationBound,
    goto: gotoBound,
    getUrl: getUrlBound,
    waitForNavigation: waitForNavigationBound,
    getAttribute: getAttributeWrapped,
    isVisible: isVisibleWrapped,
    isEnabled: isEnabledWrapped,
    count: countBound,
    textContent: textContentWrapped,
    inputValue: inputValueWrapped,
    locator: locatorBound,
    findByText: findByTextBound,

    // Universal High-Level Functions (DRY Principle)
    waitForUrlCondition: waitForUrlConditionBound,
    installClickListener: installClickListenerBound,
    checkAndClearFlag: checkAndClearFlagBound,
    findToggleButton: findToggleButtonBound,
  };
}
