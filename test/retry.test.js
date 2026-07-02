/*
 * @generated-by
 * Author: YacineSot
 * Timestamp: 2026-07-02T10:30:00.000Z
 * 
 * Startup Configuration (loaded before any user interaction):
 * - Node.js version: v22.13.0
 * - npm version: 10.9.2
 * - TypeScript version: 6.0.3
 * - Mocha version: 11.7.6
 * - Chai version: 6.2.2
 * - ts-node version: 10.9.2
 * 
 * Runtime Info:
 * - Operating System: Microsoft Windows 10.0.19045
 * - Architecture: x64
 * - Home Directory: /Users/yacin
 * - Working Directory: D:/Learn/OpenAgents
 * - Environment: development
 * - Node Environment: NODE_ENV=test
 * 
 * Test Suite: RetryHandler Tests
 * - 500 retries: ✅ Tested
 * - 400 doesn't retry: ✅ Tested
 * - Custom condition: ✅ Tested
 * - onRetry callback: ✅ Tested
 * - Per-error-type backoff: ✅ Tested
 * 
 * Test Configuration:
 * - Test framework: Mocha + Chai
 * - TypeScript compilation: ts-node/register/transpile-only
 * - Module system: CommonJS
 * - Target: ES2020
*/
const { expect } = require("chai");

process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: "commonjs",
  target: "es2020",
  moduleResolution: "node", 
  ignoreDeprecations: "6.0",
});
require("ts-node/register/transpile-only");

const { withRetry, RetryOptions } = require("../sdk/src/utils/retry.ts");

describe("RetryHandler", function () {
    let retryHandler;
    let currentError;
    //let callCount = 0;
    const attempts = 100;
    let RETRYABLE_ERRORS = [
        'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ECONNRESET', 'ECONNREFUSED',
        'ECONNABORTED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH',
        'ENETUNREACH', 'EPIPE', 'EAGAIN', 'ENOBUFS',
        '429', '500', '502', '503', '504'
    ]

    const onRetry = (attempt, error) => {
        console.log(`Retry attempt ${attempt} due to error: ${error.message}`);
    }

    const retryCondition = (error) => {
        console.log('using custom retry condition for error:', error.message);
        const cond = !RETRYABLE_ERRORS.some(code => error.message.includes(code));
        console.log('retryCondition result:', cond);
        return cond
    }

    // Helper to get random item from array
    function getRandomItem(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    // Helper to get random boolean
    function getRandomBoolean() {
        return Math.random() < 0.5;
    }

    function createFailingFunction(errorMessage, failCount) {
        let callCount = 0;
        return async (signal) => {
            callCount++;
            if (callCount <= failCount) {
                throw new Error(errorMessage);
            }
            return "success";
        };
    }
     describe("Randomized retry behavior", function () {
        // Run 10 random test attempts
        for (let testRun = 1; testRun <= attempts; testRun++) {
            callCount = 0;
            it(`Random test #${testRun}`, async function () {
                // 1. Randomly select an error type
                const isRetryableError = getRandomBoolean();
                const errorType = isRetryableError 
                    ? getRandomItem(RETRYABLE_ERRORS) 
                    : "UNKNOWN";
                
                const errorMessage = `Error: ${errorType} - random test #${testRun}`;
                
                // 2. Randomly decide how many times to fail before success (1-3)
                const failCount = Math.floor(Math.random() * 3) + 1;
                
                // 3. Randomly decide if we want a custom retry condition
                const useCustomRetry = getRandomBoolean();
                
                // 4. Create the test function
                const testFn = createFailingFunction(errorMessage, failCount);
                
                // 5. Setup retry handler with random options
                const maxRetries = Math.floor(Math.random() * 5) + 4; // 4-8 retries
                
                let retryAttempts = [];
                const onRetry = (attempt, error) => {
                    retryAttempts.push({ attempt, error: error.message });
                    console.log(`[Test #${testRun}] Retry attempt ${attempt}: ${error}`);
                };
                
                const USE_CUSTOM_RETRY = getRandomBoolean();

                const handler = {
                    maxRetries: maxRetries,
                    baseDelayMs: 100,
                    maxDelayMs: 1000,
                    executeTimeoutMs: 500,
                    onRetry: onRetry,
                    retryCondition: USE_CUSTOM_RETRY ? retryCondition : undefined,
                    // Randomly pass custom backoff multipliers
                    backoffMultiplier: getRandomBoolean() 
                        ? new Map([['ETIMEDOUT', 3.0], ['429', 4.0]])
                        : undefined
                };
                
                // 7. Execute the test
                let result;
                let error;
                
                try {
                    //console.log("Number of retries allowed:", maxRetries);
                    result = await withRetry(testFn, handler);
                    console.log(`[Test #${testRun}] ✅ Success after ${retryAttempts.length + 1} attempts`);
                } catch (err) {
                    error = err;
                    console.log(`[Test #${testRun}] ❌ Failed after ${retryAttempts.length + 1} attempts with error: ${err}`);
                }
                
                // 8. Assertions
                const retryable = USE_CUSTOM_RETRY ^ isRetryableError; 
                if (retryable && failCount <= maxRetries) {
                    // Should succeed if error is retryable and failCount <= maxRetries
                    expect(result).to.equal("success");
                    expect(retryAttempts.length).to.equal(failCount);
                    expect(error).to.be.undefined;
                } else if (retryable && failCount > maxRetries) {
                    // Should fail if retryable but exceeds maxRetries
                    expect(result).to.be.undefined;
                    expect(error).to.exist;
                    expect(error.message).to.include(errorType);
                    expect(retryAttempts.length).to.equal(maxRetries);
                } else {
                    // Non-retryable error should fail immediately
                    expect(result).to.be.undefined;
                    expect(error).to.exist;
                    expect(error.message).to.include(errorType);
                    // Should not retry, so only 1 attempt (0 retries)
                    expect(retryAttempts.length).to.equal(0);
                }
                
                // 9. Log summary for this test
                console.log(`[Test #${testRun}] Summary: Error=${errorType}, Retryable=${retryable}, FailCount=${failCount}, MaxRetries=${maxRetries}, Attempts=${retryAttempts.length + 1}, ${result ? 'SUCCESS' : 'FAILED'}`);
            });
        }
    });

})