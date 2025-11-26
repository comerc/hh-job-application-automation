# Browser Commander

A universal browser automation library that supports both Playwright and Puppeteer with a unified API. The key focus is on **stoppable page handlers** - ensuring automation logic is properly mounted/unmounted during page navigation.

## Core Concept: Page State Machine

Browser Commander manages the browser as a state machine with two states:

```
┌─────────────────┐                      ┌─────────────────┐
│                 │   navigation start   │                 │
│  WORKING STATE  │ ─────────────────►   │  LOADING STATE  │
│  (handler runs) │                      │  (wait only)    │
│                 │   ◄─────────────────  │                 │
└─────────────────┘     page ready       └─────────────────┘
```

**LOADING STATE**: Page is loading. Only waiting/tracking operations are allowed. No automation logic runs.

**WORKING STATE**: Page is fully loaded (30 seconds of network idle). Page handlers can safely interact with DOM.

## Quick Start

```javascript
import { launchBrowser, makeBrowserCommander } from './browser-commander/index.js';

// 1. Launch browser
const { browser, page } = await launchBrowser({ engine: 'playwright' });

// 2. Create commander
const commander = makeBrowserCommander({ page, verbose: true });

// 3. Register page handler with URL matcher
commander.pageHandler({
  name: 'example-handler',
  urlMatcher: (url) => url.includes('example.com'),
  handler: async (ctx) => {
    // ctx.commander has all methods, but they throw HandlerStoppedError if navigation happens
    // ctx.checkStopped() - call in loops to check if should stop
    // ctx.abortSignal - use with fetch() for cancellation
    // ctx.onCleanup(fn) - register cleanup when handler stops

    console.log(`Processing: ${ctx.url}`);

    // Safe iteration - stops if navigation detected
    await ctx.forEach(['item1', 'item2'], async (item) => {
      await ctx.commander.clickButton({ selector: `[data-id="${item}"]` });
    });
  },
});

// 4. Navigate - handler auto-starts when page is ready
await commander.goto({ url: 'https://example.com' });

// 5. Cleanup
await commander.destroy();
await browser.close();
```

## Page Handler Lifecycle

### The Guarantee

When navigation is detected:
1. **Handler is signaled to stop** (AbortController.abort())
2. **Wait for handler to finish** (up to 10 seconds for graceful cleanup)
3. **Only then start waiting for page load**

This ensures:
- No DOM operations on stale/loading pages
- Handlers can do proper cleanup (clear intervals, save state)
- No race conditions between handler and navigation

### Lifecycle Flow

```
URL Change Detected
       │
       ▼
┌──────────────────────────────────┐
│ 1. Signal handler to stop        │  ◄── AbortController.abort()
│ 2. Wait for handler to finish    │  ◄── Max 10 seconds
│ 3. Run cleanup callbacks         │  ◄── ctx.onCleanup()
└──────────────────────────────────┘
       │
       ▼
   LOADING STATE
       │
       ▼
┌──────────────────────────────────┐
│ 1. Wait for URL stabilization    │  ◄── No more redirects (1s)
│ 2. Wait for network idle         │  ◄── 30 seconds no requests
└──────────────────────────────────┘
       │
       ▼
   WORKING STATE
       │
       ▼
┌──────────────────────────────────┐
│ 1. Find matching handler         │  ◄── urlMatcher(url)
│ 2. Start handler                 │  ◄── handler(ctx)
└──────────────────────────────────┘
```

## Handler Context API

When your handler is called, it receives a context object with these properties:

```javascript
commander.pageHandler({
  name: 'my-handler',
  urlMatcher: (url) => url.includes('/checkout'),
  handler: async (ctx) => {
    // Current URL
    ctx.url;  // 'https://example.com/checkout'

    // Handler name (for debugging)
    ctx.handlerName;  // 'my-handler'

    // Check if handler should stop
    ctx.isStopped();  // Returns true if navigation detected

    // Throw HandlerStoppedError if stopped (use in manual loops)
    ctx.checkStopped();

    // AbortSignal - use with fetch() or other cancellable APIs
    ctx.abortSignal;

    // Safe wait (throws if stopped during wait)
    await ctx.wait(1000);

    // Safe iteration (checks stopped between items)
    await ctx.forEach(items, async (item) => {
      await ctx.commander.clickButton({ selector: item.selector });
    });

    // Register cleanup (runs when handler stops)
    ctx.onCleanup(() => {
      console.log('Cleaning up...');
    });

    // Commander with all methods wrapped to throw on stop
    await ctx.commander.fillTextArea({ selector: 'input', text: 'hello' });

    // Raw commander (use carefully - does not auto-throw)
    ctx.rawCommander;
  },
});
```

## HandlerStoppedError

When navigation is detected, all `ctx.commander` methods throw `HandlerStoppedError`:

```javascript
handler: async (ctx) => {
  try {
    await ctx.commander.clickButton({ selector: 'button' });
  } catch (error) {
    if (commander.isHandlerStoppedError(error)) {
      // Navigation happened - clean up and return
      console.log('Navigation detected, stopping');
      return;
    }
    throw error;  // Re-throw other errors
  }
}
```

The error is automatically caught by the PageHandlerManager, so you usually don't need to catch it unless you need custom cleanup logic.

## URL Matching

The `urlMatcher` function determines which pages your handler runs on:

```javascript
// Simple string check
urlMatcher: (url) => url.includes('/checkout')

// Multiple pages
urlMatcher: (url) => url.includes('/cart') || url.includes('/checkout')

// Regex
urlMatcher: (url) => /\/product\/\d+/.test(url)

// Complex logic
urlMatcher: (url) => {
  const parsed = new URL(url);
  return parsed.pathname.startsWith('/admin') && parsed.searchParams.has('edit');
}
```

### Handler Priority

If multiple handlers match, the highest priority runs:

```javascript
// Higher priority runs first
commander.pageHandler({
  name: 'specific-checkout',
  priority: 10,  // Higher priority
  urlMatcher: (url) => url.includes('/checkout/payment'),
  handler: handlePaymentPage,
});

commander.pageHandler({
  name: 'general-checkout',
  priority: 0,   // Default priority
  urlMatcher: (url) => url.includes('/checkout'),
  handler: handleCheckoutPage,
});
```

## Returning to a Page

If navigation brings you back to a matching URL, the handler restarts:

```javascript
// Handler registered for /search
commander.pageHandler({
  urlMatcher: (url) => url.includes('/search'),
  handler: async (ctx) => {
    console.log('Search handler started');
    // ... do work
  },
});

// Navigate to search -> handler starts
await commander.goto({ url: '/search' });

// Navigate away -> handler stops
await commander.goto({ url: '/product/123' });

// Navigate back -> handler restarts (new instance)
await commander.goto({ url: '/search' });
```

## Unregistering Handlers

`pageHandler` returns an unregister function:

```javascript
const unregister = commander.pageHandler({
  name: 'temp-handler',
  urlMatcher: (url) => url.includes('/temp'),
  handler: async (ctx) => { /* ... */ },
});

// Later: remove the handler
unregister();
```

## Architecture

### File Structure

```
browser-commander/
├── index.js                    # Main entry, makeBrowserCommander()
├── core/
│   ├── page-handler-manager.js # Handler lifecycle management
│   ├── navigation-manager.js   # URL changes, abort signals
│   ├── network-tracker.js      # HTTP request tracking
│   ├── page-session.js         # Per-page context (legacy)
│   ├── navigation-safety.js    # Handle navigation errors
│   ├── constants.js            # CHROME_ARGS, TIMING
│   ├── logger.js               # Logging utilities
│   ├── engine-detection.js     # Detect Playwright/Puppeteer
│   └── preferences.js          # Chrome preferences
├── browser/
│   ├── launcher.js             # Browser launch
│   └── navigation.js           # goto, waitForNavigation
├── elements/
│   ├── locators.js             # Element location
│   ├── selectors.js            # querySelector, findByText
│   ├── visibility.js           # isVisible, isEnabled
│   └── content.js              # textContent, getAttribute
├── interactions/
│   ├── click.js                # clickButton, clickElement
│   ├── fill.js                 # fillTextArea
│   └── scroll.js               # scrollIntoView
├── utilities/
│   ├── wait.js                 # wait(), evaluate()
│   └── url.js                  # getUrl
└── high-level/
    └── universal-logic.js      # High-level utilities
```

### Component Relationships

```
┌─────────────────────────────────────────────────────────────────┐
│                      BrowserCommander                           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐  │
│  │ NetworkTracker  │  │NavigationManager│  │PageHandlerMgr  │  │
│  │                 │  │                 │  │                │  │
│  │ - Track HTTP    │◄─│ - URL changes   │◄─│ - Register     │  │
│  │ - Wait idle     │  │ - Abort signals │  │ - Start/Stop   │  │
│  │ - 30s threshold │  │ - Events        │  │ - Lifecycle    │  │
│  └─────────────────┘  └─────────────────┘  └────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Network Idle Detection

The library waits for **30 seconds of zero pending HTTP requests** before considering a page fully loaded:

```javascript
// NetworkTracker created with 30s idle timeout
networkTracker = createNetworkTracker({
  idleTimeout: 30000,  // 30 seconds without requests = idle
});
```

This ensures:
- All lazy-loaded content is fetched
- All analytics scripts complete
- All async JavaScript executes
- SPAs fully hydrate

## API Reference

### makeBrowserCommander(options)

```javascript
const commander = makeBrowserCommander({
  page,                          // Required: Playwright/Puppeteer page
  verbose: false,                // Enable debug logging
  enableNetworkTracking: true,   // Track HTTP requests
  enableNavigationManager: true, // Enable navigation events
});
```

### commander.pageHandler(config)

```javascript
const unregister = commander.pageHandler({
  name: 'handler-name',                    // For debugging
  urlMatcher: (url) => boolean,            // When to run
  handler: async (ctx) => void,            // What to do
  priority: 0,                             // Higher runs first
});
```

### commander.goto(options)

```javascript
await commander.goto({
  url: 'https://example.com',
  waitUntil: 'domcontentloaded',  // Playwright/Puppeteer option
  timeout: 60000,
});
```

### commander.clickButton(options)

```javascript
await commander.clickButton({
  selector: 'button.submit',
  scrollIntoView: true,
  waitForNavigation: true,
});
```

### commander.fillTextArea(options)

```javascript
await commander.fillTextArea({
  selector: 'textarea.message',
  text: 'Hello world',
  checkEmpty: true,
});
```

### commander.destroy()

```javascript
await commander.destroy();  // Stop handlers, cleanup
```

## Best Practices

### 1. Use ctx.forEach for Loops

```javascript
// BAD: Won't stop on navigation
for (const item of items) {
  await ctx.commander.click({ selector: item });
}

// GOOD: Stops immediately on navigation
await ctx.forEach(items, async (item) => {
  await ctx.commander.click({ selector: item });
});
```

### 2. Use ctx.checkStopped for Complex Logic

```javascript
handler: async (ctx) => {
  while (hasMorePages) {
    ctx.checkStopped();  // Throws if navigation detected

    await processPage(ctx);
    hasMorePages = await ctx.commander.isVisible({ selector: '.next' });
  }
}
```

### 3. Register Cleanup for Resources

```javascript
handler: async (ctx) => {
  const intervalId = setInterval(updateStatus, 1000);

  ctx.onCleanup(() => {
    clearInterval(intervalId);
    console.log('Interval cleared');
  });

  // ... rest of handler
}
```

### 4. Use ctx.abortSignal with Fetch

```javascript
handler: async (ctx) => {
  const response = await fetch(url, {
    signal: ctx.abortSignal,  // Cancels on navigation
  });
}
```

## Debugging

Enable verbose mode for detailed logs:

```javascript
const commander = makeBrowserCommander({ page, verbose: true });
```

Log symbols:
- `📋` Handler registration/lifecycle
- `🚀` Handler starting
- `🛑` Handler stopping
- `✅` Handler completed
- `❌` Handler error
- `📤` Request started
- `📥` Request ended
- `🔗` URL change
- `🌐` Network idle

## Migration from Legacy API

The old `onPageReady` callback API still works but `pageHandler` is recommended:

```javascript
// OLD (still works, but less control)
commander.onPageReady(async ({ url }) => {
  if (url.includes('/checkout')) {
    await handleCheckout(commander);
  }
});

// NEW (recommended)
commander.pageHandler({
  name: 'checkout',
  urlMatcher: (url) => url.includes('/checkout'),
  handler: async (ctx) => {
    await handleCheckout(ctx);
  },
});
```

Key differences:
- `pageHandler` guarantees handler stops before navigation
- `pageHandler` provides `ctx.checkStopped()` for loops
- `pageHandler` wraps commander methods to auto-throw on stop
- `pageHandler` supports cleanup callbacks
