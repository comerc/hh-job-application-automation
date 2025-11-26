/**
 * Universal high-level functions following DRY principles
 * These are pure functions that work with any browser automation engine
 */

/**
 * Wait indefinitely for a URL condition with custom check function
 * @param {Object} options - Configuration options
 * @param {Function} options.getUrl - Function to get current URL
 * @param {Function} options.wait - Wait function
 * @param {Function} options.evaluate - Evaluate function
 * @param {string} options.targetUrl - Target URL to wait for
 * @param {string} options.description - Description for logging
 * @param {Function} options.customCheck - Optional custom check function (async)
 * @param {Function} options.pageClosedCallback - Callback to check if page closed
 * @param {number} options.pollingInterval - Polling interval in ms (default: 1000)
 * @returns {Promise<any>} - Result from customCheck or true if URL matched
 */
export async function waitForUrlCondition(options = {}) {
  const {
    getUrl,
    wait,
    evaluate,
    targetUrl,
    description,
    customCheck,
    pageClosedCallback = () => false,
    pollingInterval = 1000,
  } = options;

  if (description) {
    console.log(`⏳ ${description}...`);
  }

  while (true) {
    if (pageClosedCallback()) {
      return null;
    }

    try {
      // Run custom check if provided
      if (customCheck) {
        const customResult = await customCheck(getUrl());
        if (customResult !== undefined && customResult !== null) {
          return customResult;
        }
      }

      // Check if target URL reached
      const currentUrl = getUrl();
      if (currentUrl.startsWith(targetUrl)) {
        return true;
      }
    } catch (error) {
      if (pageClosedCallback()) {
        return null;
      }

      const isDetachedFrameError = error.message && error.message.includes('detached Frame');
      if (!isDetachedFrameError) {
        console.log(`⚠️  Temporary error while checking URL: ${error.message.substring(0, 100)}... (retrying)`);
      }
    }

    await wait({ ms: pollingInterval, reason: 'polling interval before next URL check' });
  }
}

/**
 * Install click detection listener on page
 * @param {Object} options - Configuration options
 * @param {Function} options.evaluate - Evaluate function
 * @param {string} options.buttonText - Text to detect
 * @param {string} options.storageKey - SessionStorage key to set
 */
export async function installClickListener(options = {}) {
  const { evaluate, buttonText, storageKey } = options;

  await evaluate({
    fn: (text, key) => {
      document.addEventListener('click', (event) => {
        let element = event.target;
        while (element && element !== document.body) {
          const elementText = element.textContent?.trim() || '';
          if (elementText === text ||
              (element.tagName === 'A' || element.tagName === 'BUTTON') && elementText.includes(text)) {
            console.log(`[Click Listener] Detected click on ${text} button!`);
            window.sessionStorage.setItem(key, 'true');
            break;
          }
          element = element.parentElement;
        }
      }, true);
    },
    args: [buttonText, storageKey],
  });
}

/**
 * Check and clear session storage flag
 * @param {Object} options - Configuration options
 * @param {Function} options.evaluate - Evaluate function
 * @param {string} options.storageKey - SessionStorage key
 * @returns {Promise<boolean>} - True if flag was set
 */
export async function checkAndClearFlag(options = {}) {
  const { evaluate, storageKey } = options;

  return await evaluate({
    fn: (key) => {
      const flag = window.sessionStorage.getItem(key);
      if (flag === 'true') {
        window.sessionStorage.removeItem(key);
        return true;
      }
      return false;
    },
    args: [storageKey],
  });
}

/**
 * Find toggle button using multiple strategies
 * @param {Object} options - Configuration options
 * @param {Function} options.count - Count function
 * @param {Function} options.findByText - FindByText function
 * @param {Array<string>} options.dataQaSelectors - Data-qa selectors to try
 * @param {string} options.textToFind - Text to search for
 * @param {Array<string>} options.elementTypes - Element types to search
 * @returns {Promise<string|null>} - Selector or null
 */
export async function findToggleButton(options = {}) {
  const {
    count,
    findByText,
    dataQaSelectors = [],
    textToFind,
    elementTypes = ['button', 'a', 'span'],
  } = options;

  // Try data-qa selectors first
  for (const sel of dataQaSelectors) {
    const elemCount = await count({ selector: sel });
    if (elemCount > 0) {
      return sel;
    }
  }

  // Fallback to text search
  if (textToFind) {
    for (const elementType of elementTypes) {
      const selector = await findByText({
        text: textToFind,
        selector: elementType,
      });
      const elemCount = await count({ selector });
      if (elemCount > 0) {
        return selector;
      }
    }
  }

  return null;
}
