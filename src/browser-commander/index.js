/**
 * Browser Commander - Universal browser automation library
 * Supports both Playwright and Puppeteer with a unified API
 * All functions use options objects for easy maintenance
 *
 * Key features:
 * - Automatic network request tracking
 * - Navigation-aware operations (wait for page ready after navigations)
 * - Event-based page lifecycle management
 * - Session management for per-page automation logic
 */

// Import functions needed by makeBrowserCommander
import { createLogger } from './core/logger.js';
import { detectEngine } from './core/engine-detection.js';
import { wait, evaluate, safeEvaluate } from './utilities/wait.js';
import { getUrl, unfocusAddressBar } from './utilities/url.js';
import { waitForUrlStabilization, goto, waitForNavigation, waitForPageReady, waitAfterAction } from './browser/navigation.js';
import { createPlaywrightLocator, getLocatorOrElement, waitForLocatorOrElement, waitForVisible, locator } from './elements/locators.js';
import { querySelector, querySelectorAll, findByText, normalizeSelector, withTextSelectorSupport, waitForSelector } from './elements/selectors.js';
import { isVisible, isEnabled, count } from './elements/visibility.js';
import { textContent, inputValue, getAttribute, getInputValue, logElementInfo } from './elements/content.js';
import { scrollIntoView, needsScrolling, scrollIntoViewIfNeeded } from './interactions/scroll.js';
import { clickElement, clickButton } from './interactions/click.js';
import { checkIfElementEmpty, performFill, fillTextArea } from './interactions/fill.js';
import { waitForUrlCondition, installClickListener, checkAndClearFlag, findToggleButton } from './high-level/universal-logic.js';

// Import new core components
import { createNetworkTracker } from './core/network-tracker.js';
import { createNavigationManager } from './core/navigation-manager.js';
import { createPageSessionFactory } from './core/page-session.js';
import {
  createPageTriggerManager,
  ActionStoppedError,
  isActionStoppedError,
  makeUrlCondition,
  allConditions,
  anyCondition,
  notCondition,
} from './core/page-trigger-manager.js';

// Re-export core utilities
export { CHROME_ARGS, TIMING } from './core/constants.js';
export { isVerboseEnabled, createLogger } from './core/logger.js';
export { disableTranslateInPreferences } from './core/preferences.js';
export { detectEngine } from './core/engine-detection.js';
export { isNavigationError, safeOperation, makeNavigationSafe, withNavigationSafety } from './core/navigation-safety.js';

// Re-export new core components
export { createNetworkTracker } from './core/network-tracker.js';
export { createNavigationManager } from './core/navigation-manager.js';
export { createPageSessionFactory } from './core/page-session.js';

// Page trigger system
export {
  createPageTriggerManager,
  ActionStoppedError,
  isActionStoppedError,
  makeUrlCondition,
  allConditions,
  anyCondition,
  notCondition,
} from './core/page-trigger-manager.js';

// Re-export browser management
export { launchBrowser } from './browser/launcher.js';
export {
  waitForUrlStabilization,
  goto,
  waitForNavigation,
  waitForPageReady,
  waitAfterAction,
  // Navigation verification
  defaultNavigationVerification,
  verifyNavigation,
} from './browser/navigation.js';

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
  // Scroll verification
  defaultScrollVerification,
  verifyScroll,
} from './interactions/scroll.js';

export {
  clickElement,
  clickButton,
  // Click verification
  defaultClickVerification,
  capturePreClickState,
  verifyClick,
} from './interactions/click.js';

export {
  checkIfElementEmpty,
  performFill,
  fillTextArea,
  // Fill verification
  defaultFillVerification,
  verifyFill,
} from './interactions/fill.js';

// Re-export utilities
export { wait, evaluate, safeEvaluate } from './utilities/wait.js';
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
 * @param {boolean} options.enableNetworkTracking - Enable network request tracking (default: true)
 * @param {boolean} options.enableNavigationManager - Enable navigation manager (default: true)
 * @returns {Object} - Browser commander API
 */
export function makeBrowserCommander(options = {}) {
  const {
    page,
    verbose = false,
    enableNetworkTracking = true,
    enableNavigationManager = true,
  } = options;

  if (!page) {
    throw new Error('page is required in options');
  }

  const engine = detectEngine(page);
  const log = createLogger({ verbose });

  // Create NetworkTracker if enabled
  // Use 30 second idle timeout to ensure page is fully loaded
  let networkTracker = null;
  if (enableNetworkTracking) {
    networkTracker = createNetworkTracker({
      page,
      engine,
      log,
      idleTimeout: 30000, // Wait 30 seconds without requests before considering network idle
    });
    networkTracker.startTracking();
  }

  // Create NavigationManager if enabled
  let navigationManager = null;
  let sessionFactory = null;

  // PageTriggerManager (will be initialized after commander is created)
  let pageTriggerManager = null;

  if (enableNavigationManager) {
    navigationManager = createNavigationManager({
      page,
      engine,
      log,
      networkTracker,
    });
    navigationManager.startListening();

    // Create PageSession factory
    sessionFactory = createPageSessionFactory({
      navigationManager,
      networkTracker,
      log,
    });

    // Create PageTriggerManager
    pageTriggerManager = createPageTriggerManager({
      navigationManager,
      log,
    });
  }

  // Create bound helper functions that inject page, engine, log
  // Wait function now automatically gets abort signal from navigation manager
  const waitBound = (opts) => {
    const abortSignal = navigationManager ? navigationManager.getAbortSignal() : null;
    return wait({ ...opts, log, abortSignal: opts.abortSignal || abortSignal });
  };
  const evaluateBound = (opts) => evaluate({ ...opts, page, engine });
  const safeEvaluateBound = (opts) => safeEvaluate({ ...opts, page, engine });
  const getUrlBound = () => getUrl({ page });
  const unfocusAddressBarBound = (opts = {}) => unfocusAddressBar({ ...opts, page });

  // Bound navigation - with NavigationManager integration
  const waitForUrlStabilizationBound = (opts) => waitForUrlStabilization({
    ...opts,
    page,
    log,
    wait: waitBound,
    navigationManager,
  });
  const gotoBound = (opts) => goto({
    ...opts,
    page,
    waitForUrlStabilization: waitForUrlStabilizationBound,
    navigationManager,
  });
  const waitForNavigationBound = (opts) => waitForNavigation({
    ...opts,
    page,
    navigationManager,
  });
  const waitForPageReadyBound = (opts) => waitForPageReady({
    ...opts,
    page,
    navigationManager,
    networkTracker,
    log,
    wait: waitBound,
  });
  const waitAfterActionBound = (opts) => waitAfterAction({
    ...opts,
    page,
    navigationManager,
    networkTracker,
    log,
    wait: waitBound,
  });

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

  // Bound click - now navigation-aware
  const clickElementBound = (opts) => clickElement({ ...opts, engine, log });
  const clickButtonBound = (opts) => clickButton({
    ...opts,
    page,
    engine,
    wait: waitBound,
    log,
    verbose,
    navigationManager,
    networkTracker,
  });

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

  // Cleanup function
  const destroy = async () => {
    if (pageTriggerManager) {
      await pageTriggerManager.destroy();
    }
    if (networkTracker) {
      networkTracker.stopTracking();
    }
    if (navigationManager) {
      navigationManager.stopListening();
    }
    if (sessionFactory) {
      await sessionFactory.endAllSessions();
    }
  };

  // Build commander object
  const commander = {
    // Core properties
    engine,
    page,
    log,

    // Navigation management components
    networkTracker,
    navigationManager,
    sessionFactory,
    pageTriggerManager,

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
    safeEvaluate: safeEvaluateBound,
    waitForSelector: waitForSelectorBound,
    querySelector: querySelectorBound,
    querySelectorAll: querySelectorAllBound,
    waitForUrlStabilization: waitForUrlStabilizationBound,
    goto: gotoBound,
    getUrl: getUrlBound,
    waitForNavigation: waitForNavigationBound,
    waitForPageReady: waitForPageReadyBound,
    waitAfterAction: waitAfterActionBound,
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

    // Lifecycle
    destroy,

    // Convenience methods for page sessions (legacy API)
    createSession: sessionFactory ? (opts) => sessionFactory.createSession(opts) : null,
    getActiveSessions: sessionFactory ? () => sessionFactory.getActiveSessions() : () => [],

    // Subscribe to navigation events (legacy API)
    onNavigationStart: navigationManager ? (fn) => navigationManager.on('onNavigationStart', fn) : () => {},
    onNavigationComplete: navigationManager ? (fn) => navigationManager.on('onNavigationComplete', fn) : () => {},
    onUrlChange: navigationManager ? (fn) => navigationManager.on('onUrlChange', fn) : () => {},
    onPageReady: navigationManager ? (fn) => navigationManager.on('onPageReady', fn) : () => {},

    // Abort handling - check these to stop operations when navigation occurs
    shouldAbort: navigationManager ? () => navigationManager.shouldAbort() : () => false,
    getAbortSignal: navigationManager ? () => navigationManager.getAbortSignal() : () => null,

    // Page Trigger API
    // Register a trigger: commander.pageTrigger({ condition, action, name })
    // condition receives context: { url, commander }
    // action receives context: { url, commander, checkStopped, forEach, wait, onCleanup, ... }
    pageTrigger: pageTriggerManager
      ? (config) => pageTriggerManager.pageTrigger(config)
      : () => { throw new Error('pageTrigger requires enableNavigationManager: true'); },

    // URL condition helpers
    makeUrlCondition,
    allConditions,
    anyCondition,
    notCondition,

    // Error classes for action control flow
    ActionStoppedError,
    isActionStoppedError,
  };

  // Initialize PageTriggerManager with the commander
  if (pageTriggerManager) {
    pageTriggerManager.initialize(commander);
  }

  return commander;
}
