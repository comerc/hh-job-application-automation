/**
 * PageHandlerManager - Manages stoppable page handlers with proper lifecycle
 *
 * Key guarantees:
 * 1. Only one handler runs at a time
 * 2. Handler is fully stopped before page loading starts
 * 3. Handler can gracefully cleanup on stop
 * 4. All commander operations throw HandlerStoppedError when stopped
 */

/**
 * Error thrown when handler is stopped (navigation detected)
 * Handlers can catch this to do cleanup, but should re-throw or return
 */
export class HandlerStoppedError extends Error {
  constructor(message = 'Handler stopped due to navigation') {
    super(message);
    this.name = 'HandlerStoppedError';
    this.isHandlerStopped = true;
  }
}

/**
 * Check if error is a HandlerStoppedError
 * @param {Error} error - Error to check
 * @returns {boolean}
 */
export function isHandlerStoppedError(error) {
  return error && (error.isHandlerStopped === true || error.name === 'HandlerStoppedError');
}

/**
 * Create a PageHandlerManager instance
 * @param {Object} options - Configuration options
 * @param {Object} options.navigationManager - NavigationManager instance
 * @param {Function} options.log - Logger instance
 * @returns {Object} - PageHandlerManager API
 */
export function createPageHandlerManager(options = {}) {
  const {
    navigationManager,
    log,
  } = options;

  if (!navigationManager) {
    throw new Error('navigationManager is required');
  }

  // Registered handlers
  const handlers = [];

  // Current handler state
  let currentHandler = null;
  let currentAbortController = null;
  let handlerPromise = null;
  let handlerStopPromise = null;
  let handlerStopResolve = null;
  let isHandlerRunning = false;
  let isStopping = false;

  /**
   * Register a page handler
   * @param {Object} config - Handler configuration
   * @param {Function} config.urlMatcher - Function (url) => boolean, returns true if handler should run
   * @param {Function} config.handler - Async function (context) => void, the handler logic
   * @param {string} config.name - Handler name for debugging
   * @param {number} config.priority - Priority (higher runs first if multiple match), default 0
   * @returns {Function} - Unregister function
   */
  function pageHandler(config) {
    const {
      urlMatcher,
      handler,
      name = 'unnamed',
      priority = 0,
    } = config;

    if (typeof urlMatcher !== 'function') {
      throw new Error('urlMatcher must be a function');
    }
    if (typeof handler !== 'function') {
      throw new Error('handler must be a function');
    }

    const handlerConfig = {
      urlMatcher,
      handler,
      name,
      priority,
    };

    handlers.push(handlerConfig);

    // Sort by priority (descending)
    handlers.sort((a, b) => b.priority - a.priority);

    log.debug(() => `📋 Registered page handler: "${name}" (priority: ${priority})`);

    // Return unregister function
    return () => {
      const index = handlers.indexOf(handlerConfig);
      if (index !== -1) {
        handlers.splice(index, 1);
        log.debug(() => `📋 Unregistered page handler: "${name}"`);
      }
    };
  }

  /**
   * Find matching handler for URL
   * @param {string} url - URL to match
   * @returns {Object|null} - Matching handler config or null
   */
  function findMatchingHandler(url) {
    for (const config of handlers) {
      try {
        if (config.urlMatcher(url)) {
          return config;
        }
      } catch (e) {
        log.debug(() => `⚠️  Error in urlMatcher for "${config.name}": ${e.message}`);
      }
    }
    return null;
  }

  /**
   * Stop current handler and wait for it to finish
   * @returns {Promise<void>}
   */
  async function stopCurrentHandler() {
    if (!isHandlerRunning) {
      return;
    }

    if (isStopping) {
      // Already stopping, wait for it
      if (handlerStopPromise) {
        await handlerStopPromise;
      }
      return;
    }

    isStopping = true;
    log.debug(() => `🛑 Stopping handler "${currentHandler?.name}"...`);

    // Create promise that resolves when handler actually stops
    handlerStopPromise = new Promise(resolve => {
      handlerStopResolve = resolve;
    });

    // Abort the handler
    if (currentAbortController) {
      currentAbortController.abort();
    }

    // Wait for handler to finish (with timeout)
    const timeoutMs = 10000; // 10 second max wait
    const timeoutPromise = new Promise(resolve => {
      setTimeout(() => {
        log.debug(() => `⚠️  Handler "${currentHandler?.name}" did not stop gracefully within ${timeoutMs}ms`);
        resolve();
      }, timeoutMs);
    });

    await Promise.race([handlerPromise, timeoutPromise]);

    // Cleanup
    isHandlerRunning = false;
    isStopping = false;
    currentHandler = null;
    currentAbortController = null;
    handlerPromise = null;

    // Resolve the stop promise
    if (handlerStopResolve) {
      handlerStopResolve();
      handlerStopResolve = null;
      handlerStopPromise = null;
    }

    log.debug(() => '✅ Handler stopped');
  }

  /**
   * Start handler for URL
   * @param {string} url - URL to start handler for
   * @param {Object} commander - BrowserCommander instance
   */
  async function startHandler(url, commander) {
    // Find matching handler
    const matchingHandler = findMatchingHandler(url);
    if (!matchingHandler) {
      log.debug(() => `📋 No handler registered for: ${url}`);
      return;
    }

    log.debug(() => `🚀 Starting handler "${matchingHandler.name}" for: ${url}`);

    // Setup abort controller
    currentAbortController = new AbortController();
    currentHandler = matchingHandler;
    isHandlerRunning = true;

    // Create handler context
    const context = createHandlerContext({
      url,
      abortSignal: currentAbortController.signal,
      commander,
      handlerName: matchingHandler.name,
    });

    // Run handler
    handlerPromise = (async () => {
      try {
        await matchingHandler.handler(context);
        log.debug(() => `✅ Handler "${matchingHandler.name}" completed normally`);
      } catch (error) {
        if (isHandlerStoppedError(error)) {
          log.debug(() => `🛑 Handler "${matchingHandler.name}" stopped (caught HandlerStoppedError)`);
        } else if (error.name === 'AbortError') {
          log.debug(() => `🛑 Handler "${matchingHandler.name}" aborted`);
        } else {
          log.debug(() => `❌ Handler "${matchingHandler.name}" error: ${error.message}`);
          console.error(`Handler "${matchingHandler.name}" error:`, error);
        }
      } finally {
        // Only clear if this is still the current handler
        if (currentHandler === matchingHandler) {
          isHandlerRunning = false;
          currentHandler = null;
          currentAbortController = null;
        }
      }
    })();
  }

  /**
   * Create handler context with abort-aware commander wrapper
   * @param {Object} options
   * @returns {Object} - Handler context
   */
  function createHandlerContext(options) {
    const { url, abortSignal, commander, handlerName } = options;

    /**
     * Check if stopped and throw if so
     */
    function checkStopped() {
      if (abortSignal.aborted) {
        throw new HandlerStoppedError(`Handler "${handlerName}" stopped`);
      }
    }

    /**
     * Wrap async function to check abort before and after
     */
    function wrapAsync(fn) {
      return async (...args) => {
        checkStopped();
        const result = await fn(...args);
        checkStopped();
        return result;
      };
    }

    /**
     * Create abort-aware loop helper
     * Use this instead of for/while loops for stoppability
     */
    async function forEach(items, callback) {
      for (let i = 0; i < items.length; i++) {
        checkStopped();
        await callback(items[i], i, items);
      }
    }

    /**
     * Wait with abort support
     */
    async function wait(ms) {
      checkStopped();
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(resolve, ms);
        abortSignal.addEventListener('abort', () => {
          clearTimeout(timeout);
          reject(new HandlerStoppedError());
        }, { once: true });
      });
    }

    /**
     * Register cleanup callback (called when handler stops)
     */
    const cleanupCallbacks = [];
    function onCleanup(callback) {
      cleanupCallbacks.push(callback);
      abortSignal.addEventListener('abort', async () => {
        try {
          await callback();
        } catch (e) {
          log.debug(() => `⚠️  Cleanup error: ${e.message}`);
        }
      }, { once: true });
    }

    // Wrap all commander methods to be abort-aware
    const wrappedCommander = {};
    for (const [key, value] of Object.entries(commander)) {
      if (typeof value === 'function' && key !== 'destroy' && key !== 'pageHandler') {
        wrappedCommander[key] = wrapAsync(value);
      } else {
        wrappedCommander[key] = value;
      }
    }

    return {
      // URL this handler is running for
      url,

      // Abort signal - use with fetch() or custom abort logic
      abortSignal,

      // Check if handler should stop
      isStopped: () => abortSignal.aborted,

      // Throw if stopped - call this in loops
      checkStopped,

      // Abort-aware iteration helper
      forEach,

      // Abort-aware wait
      wait,

      // Register cleanup callback
      onCleanup,

      // Wrapped commander - all methods throw HandlerStoppedError if stopped
      commander: wrappedCommander,

      // Original commander (use carefully)
      rawCommander: commander,

      // Handler name for debugging
      handlerName,
    };
  }

  /**
   * Handle navigation start - stop current handler first
   */
  async function onNavigationStart() {
    await stopCurrentHandler();
  }

  /**
   * Handle page ready - start matching handler
   */
  async function onPageReady({ url }, commander) {
    await startHandler(url, commander);
  }

  /**
   * Check if a handler is currently running
   */
  function isRunning() {
    return isHandlerRunning;
  }

  /**
   * Get current handler name
   */
  function getCurrentHandlerName() {
    return currentHandler?.name || null;
  }

  /**
   * Initialize - connect to navigation manager
   * @param {Object} commander - BrowserCommander instance
   */
  function initialize(commander) {
    // Stop handler before navigation starts
    navigationManager.on('onBeforeNavigate', onNavigationStart);

    // Start handler when page is ready
    navigationManager.on('onPageReady', (event) => onPageReady(event, commander));

    log.debug(() => '📋 PageHandlerManager initialized');
  }

  /**
   * Cleanup
   */
  async function destroy() {
    await stopCurrentHandler();
    handlers.length = 0;
    navigationManager.off('onBeforeNavigate', onNavigationStart);
    log.debug(() => '📋 PageHandlerManager destroyed');
  }

  return {
    pageHandler,
    stopCurrentHandler,
    isRunning,
    getCurrentHandlerName,
    initialize,
    destroy,

    // Export error class and checker
    HandlerStoppedError,
    isHandlerStoppedError,
  };
}
