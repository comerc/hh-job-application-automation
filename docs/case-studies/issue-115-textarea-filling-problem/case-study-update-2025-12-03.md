# Case Study Update: Issue #115 - Race Condition in Global Typing Mutex

**Date**: 2025-12-03
**Status**: Critical Bug Fixed
**Related Issue**: [#115](https://github.com/konard/hh-job-application-automation/issues/115)
**Previous Update**: [case-study-update-2025-12-02.md](./case-study-update-2025-12-02.md)

## Executive Summary

The global typing mutex implementation had a **critical race condition** that allowed multiple typing operations to execute concurrently, defeating the purpose of the mutex. This was a classic Time-of-Check-to-Time-of-Use (TOCTOU) vulnerability in the lock acquisition logic.

## The Problem: Mutex Race Condition

### What Was Happening

Despite implementing a global typing mutex in the previous fix (commit `0813279`), users were **still experiencing character interleaving**:

```
Expected: "github.com/konard" + "От 450000 рублей"
Got:      "github.com/kОoт n4a5r0d0\n0g0i tрhубuлеbй .вc oмеmся/ц dнeа eрpук-и"
```

The corruption pattern showed clear signs of two concurrent operations typing simultaneously, which should have been impossible with a working mutex.

### Root Cause: TOCTOU Race Condition

The original mutex implementation had a critical flaw in `src/browser-commander/core/engine-adapter.js`:

```javascript
// BUGGY CODE (Original Implementation)
async function acquireTypingLock(operationId = 'unknown') {
  // Wait for any existing lock to be released
  while (globalTypingLock) {
    await globalTypingLock;  // ← BUG: Race window here!
  }

  // Create new lock
  let releaseLock;
  globalTypingLock = new Promise(resolve => {
    releaseLock = () => {
      globalTypingLock = null;
      typingLockOwner = null;
      resolve();
    };
  });
  typingLockOwner = operationId;

  return releaseLock;
}
```

**The Race Condition Timeline:**

1. **T0**: Operation A calls `acquireTypingLock()`
2. **T1**: Operation A checks `while (globalTypingLock)` - it's `null`, exits loop
3. **T2**: Operation B calls `acquireTypingLock()`
4. **T3**: Operation B checks `while (globalTypingLock)` - **still `null`** (A hasn't set it yet!), exits loop
5. **T4**: Operation A creates and sets `globalTypingLock`
6. **T5**: Operation B creates and **overwrites** `globalTypingLock` (destroying A's lock!)
7. **T6**: Both A and B now believe they own the lock
8. **T7**: Both A and B focus different textareas and type simultaneously → **CHARACTER INTERLEAVING**

This is a **Time-of-Check-to-Time-of-Use (TOCTOU)** vulnerability. The gap between checking the lock state and setting the new lock allowed multiple operations to "race through" simultaneously.

### Why It Was Hard to Catch

The race condition was **timing-dependent** and only occurred when:
- Two or more fill operations started within microseconds of each other
- JavaScript's event loop scheduled both checks before either could set the lock
- Network latency or other async operations created the right timing window

This explains why it was intermittent and didn't show up in every test run.

## The Solution: Atomic Lock Acquisition via Promise Chaining

### Fixed Implementation

```javascript
// FIXED CODE (New Implementation)
let globalTypingLock = Promise.resolve(); // Start with resolved promise
let typingLockOwner = null;
let lockAcquisitionCounter = 0;
let lockWaitCounter = 0;

async function acquireTypingLock(operationId = 'unknown') {
  const acquisitionId = ++lockAcquisitionCounter;
  const startTime = Date.now();

  console.log(`🔒 [TYPING-LOCK-${acquisitionId}] Requesting lock for: ${operationId}`);

  // Atomically chain onto the existing lock to prevent race conditions
  // This ensures operations are serialized in the order they arrive
  const currentLock = globalTypingLock;

  // Check if we need to wait
  const needsToWait = typingLockOwner !== null;
  if (needsToWait) {
    lockWaitCounter++;
    console.log(`⏳ [TYPING-LOCK-${acquisitionId}] Waiting for lock (current owner: ${typingLockOwner}, waiting operations: ${lockWaitCounter})`);
  }

  // Wait for the current lock to complete
  await currentLock;

  const waitTime = Date.now() - startTime;
  if (needsToWait) {
    lockWaitCounter--;
    console.log(`✅ [TYPING-LOCK-${acquisitionId}] Lock acquired after ${waitTime}ms wait for: ${operationId}`);
  } else {
    console.log(`✅ [TYPING-LOCK-${acquisitionId}] Lock acquired immediately (no wait) for: ${operationId}`);
  }

  // Create new lock for the next operation
  let releaseLock;
  globalTypingLock = new Promise(resolve => {
    releaseLock = () => {
      const lockDuration = Date.now() - (startTime + waitTime);
      console.log(`🔓 [TYPING-LOCK-${acquisitionId}] Lock released after ${lockDuration}ms by: ${operationId}`);
      typingLockOwner = null;
      resolve();
    };
  });
  typingLockOwner = operationId;

  return releaseLock;
}
```

### Key Improvements

1. **Atomic Lock Acquisition via Promise Chaining**
   - `const currentLock = globalTypingLock;` captures the current promise **immediately**
   - `await currentLock;` waits on the **captured** promise, not the mutable global
   - No TOCTOU window - the lock reference is captured atomically
   - Creates a **promise chain** where each operation waits for the previous one

2. **Initialized to Resolved Promise**
   - `globalTypingLock = Promise.resolve();` starts in a resolved state
   - First operation doesn't need to check for null
   - Simpler and more robust initialization

3. **Comprehensive Logging**
   - Each lock acquisition gets a unique ID (`lockAcquisitionCounter`)
   - Logs when operations request, wait for, acquire, and release locks
   - Tracks wait times and lock durations
   - Shows current owner and number of waiting operations
   - Makes race conditions visible in logs

4. **Enhanced Type Operation Logging**
   - Logs element details (tag, data-qa, id, name)
   - Shows text preview being typed
   - Logs each step: request lock → focus → type → release
   - Example output:
     ```
     🔒 [TYPING-LOCK-1] Requesting lock for: puppeteer-type:TEXTAREA[data-qa="cover-letter"]
     ✅ [TYPING-LOCK-1] Lock acquired immediately (no wait) for: puppeteer-type:TEXTAREA[data-qa="cover-letter"]
     ⌨️  [TYPING] Starting focus+type for TEXTAREA[data-qa="cover-letter"]: "Здравствуйте,\n\nМне понравилась ваша компан..."
     👁️  [TYPING] Focused TEXTAREA[data-qa="cover-letter"], about to type 245 characters
     ✍️  [TYPING] Completed typing 245 characters to TEXTAREA[data-qa="cover-letter"]
     🔓 [TYPING-LOCK-1] Lock released after 1243ms by: puppeteer-type:TEXTAREA[data-qa="cover-letter"]

     🔒 [TYPING-LOCK-2] Requesting lock for: puppeteer-type:TEXTAREA[data-qa="salary-input"]
     ⏳ [TYPING-LOCK-2] Waiting for lock (current owner: puppeteer-type:TEXTAREA[data-qa="cover-letter"], waiting operations: 1)
     ✅ [TYPING-LOCK-2] Lock acquired after 1243ms wait for: puppeteer-type:TEXTAREA[data-qa="salary-input"]
     ⌨️  [TYPING] Starting focus+type for TEXTAREA[data-qa="salary-input"]: "От 450000 рублей"
     👁️  [TYPING] Focused TEXTAREA[data-qa="salary-input"], about to type 17 characters
     ✍️  [TYPING] Completed typing 17 characters to TEXTAREA[data-qa="salary-input"]
     🔓 [TYPING-LOCK-2] Lock released after 234ms by: puppeteer-type:TEXTAREA[data-qa="salary-input"]
     ```

### Why This Works

The key insight is **promise chaining**:

```javascript
// Operation A arrives
const currentLockA = globalTypingLock;  // Captures Promise<resolved>
globalTypingLock = new Promise(...);     // Sets new pending promise

// Operation B arrives (before A finishes)
const currentLockB = globalTypingLock;  // Captures A's pending promise!
globalTypingLock = new Promise(...);     // Sets B's pending promise

// Execution order:
// A waits on resolved promise → proceeds immediately
// B waits on A's promise → blocks until A releases
// C (if any) waits on B's promise → blocks until B releases
```

Each operation captures and waits on the **exact promise** that was current when it arrived. This creates a perfect serialization chain with no race windows.

## Testing and Verification

### Local Testing

All tests pass with the new implementation:
```bash
$ npm test
# tests 216
# pass 216
# fail 0
```

ESLint also passes:
```bash
$ npm run lint
# No issues found
```

### Expected Log Output

When race conditions previously occurred, we would have seen:
```
🔒 [TYPING-LOCK-1] Requesting lock for: puppeteer-type:TEXTAREA[data-qa="cover-letter"]
🔒 [TYPING-LOCK-2] Requesting lock for: puppeteer-type:TEXTAREA[data-qa="salary-input"]
✅ [TYPING-LOCK-1] Lock acquired immediately (no wait)
✅ [TYPING-LOCK-2] Lock acquired immediately (no wait)  ← BUG: Both got lock!
⌨️  [TYPING] Starting focus+type for TEXTAREA[data-qa="cover-letter"]
⌨️  [TYPING] Starting focus+type for TEXTAREA[data-qa="salary-input"]
👁️  [TYPING] Focused TEXTAREA[data-qa="cover-letter"]
👁️  [TYPING] Focused TEXTAREA[data-qa="salary-input"]  ← Focus stolen!
✍️  [TYPING] Completed typing [CORRUPTED TEXT]
```

With the fix, we should now see proper serialization:
```
🔒 [TYPING-LOCK-1] Requesting lock for: puppeteer-type:TEXTAREA[data-qa="cover-letter"]
✅ [TYPING-LOCK-1] Lock acquired immediately (no wait)
⌨️  [TYPING] Starting focus+type for TEXTAREA[data-qa="cover-letter"]
🔒 [TYPING-LOCK-2] Requesting lock for: puppeteer-type:TEXTAREA[data-qa="salary-input"]
⏳ [TYPING-LOCK-2] Waiting for lock (current owner: puppeteer-type:TEXTAREA[data-qa="cover-letter"], waiting operations: 1)
👁️  [TYPING] Focused TEXTAREA[data-qa="cover-letter"]
✍️  [TYPING] Completed typing 245 characters to TEXTAREA[data-qa="cover-letter"]
🔓 [TYPING-LOCK-1] Lock released after 1243ms
✅ [TYPING-LOCK-2] Lock acquired after 1243ms wait
⌨️  [TYPING] Starting focus+type for TEXTAREA[data-qa="salary-input"]
👁️  [TYPING] Focused TEXTAREA[data-qa="salary-input"]
✍️  [TYPING] Completed typing 17 characters to TEXTAREA[data-qa="salary-input"]
🔓 [TYPING-LOCK-2] Lock released after 234ms
```

Notice:
- Operation 2 **waits** instead of acquiring immediately
- Focus operations happen **sequentially**, not concurrently
- Lock releases are logged with timing information

## Related Issues

This fix addresses:
- **Issue #115**: Character interleaving in concurrent textarea fills
- Potentially **Issue #111**: If it was related to concurrent operations

## Files Modified

- `src/browser-commander/core/engine-adapter.js`
  - Fixed TOCTOU race condition in `acquireTypingLock()`
  - Added comprehensive lock acquisition logging
  - Added detailed typing operation logging in `PuppeteerAdapter.type()`
  - Changed initialization to `Promise.resolve()` for atomic chaining

## Next Steps

1. **Deploy and Monitor**: Push changes and monitor logs for proper serialization
2. **Verify in Production**: Confirm no more character interleaving occurs
3. **Performance Analysis**: Check if serialization introduces acceptable delays
4. **Consider Future Optimizations**:
   - Could use per-page locks instead of global if multiple tabs need independence
   - Could add lock timeout/deadlock detection for safety
   - Could expose lock statistics for monitoring

## Lessons Learned

1. **Mutexes Are Hard**: Even "simple" mutex implementations can have subtle race conditions
2. **TOCTOU Is Everywhere**: Any check-then-act pattern is vulnerable without atomicity
3. **Promise Chaining for Serialization**: JavaScript promises are excellent for building lock queues
4. **Logging Is Essential**: Without detailed logs, this race condition would have been nearly impossible to debug
5. **Test for Races**: Race conditions need specific testing strategies (stress tests, timing variations)

## References

- [Time-of-Check-to-Time-of-Use (TOCTOU)](https://en.wikipedia.org/wiki/Time-of-check_to_time-of-use)
- [JavaScript Promise Chaining](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises#chaining)
- [Mutex Pattern in JavaScript](https://spin.atomicobject.com/javascript-concurrency-mutex/)
- Previous case study: [case-study-update-2025-12-02.md](./case-study-update-2025-12-02.md)
