/**
 * Retry utility with exponential backoff for unreliable RPC calls.
 * 
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
 * Project Context:
 * - Retry utility testing with exponential backoff
 * - Testing error codes: ETIMEDOUT, ECONNRESET, ECONNREFUSED, 429, 500, 502, 503, 504, etc.
 * - Test run: Random 100 attempts with configurable retry conditions
 * 
 * Dependencies:
 * - chai@4.3.10
 * - mocha@10.2.0
 * - ts-node@10.9.2
 * - typescript@5.3.3
 * 
 * Test Configuration:
 * - Test framework: Mocha + Chai
 * - TypeScript compilation: ts-node/register/transpile-only
 * - Module system: CommonJS
 * - Target: ES2020
 */

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  executeTimeoutMs?: number;
  onRetry?: (attempt: number, error: Error) => void;
  retryCondition?: (error: Error) => boolean;
  backoffMultiplier?: Map<string, number>;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, "onRetry" | "retryCondition" | "backoffMultiplier">> = {
  maxRetries: 10, // setting default maxRetries to 10 to avoid infinite retries
  baseDelayMs: 500,
  maxDelayMs: 30_000,
  executeTimeoutMs: 30_000,
};

export class RetryHandler {
  private options: Required<Omit<RetryOptions, "onRetry" | "retryCondition" | "backoffMultiplier">>;
  private onRetry?: (attempt: number, error: Error) => void;
  private retryCondition = isRetryable;
  // Map to store the backoff multipliers for specific error codes
  private backoffMultiplier: Map<string, number> = new Map([
    ['ETIMEDOUT', 2.0],
    ['ESOCKETTIMEDOUT', 2.0],
    ['ECONNRESET', 1.5],
    ['ECONNREFUSED', 1.5],
    ['ECONNABORTED', 1.5],
    ['ENOTFOUND', 2.0],
    ['EAI_AGAIN', 2.0],
    ['EHOSTUNREACH', 1.5],
    ['ENETUNREACH', 1.5],
    ['EPIPE', 1.5],
    ['EAGAIN', 1.5],
    ['ENOBUFS', 1.5],
    ['429', 3.0],
    ['500', 1.5],
    ['502', 1.5],
    ['503', 2.0],
    ['504', 1.5]
  ]);
  private consecutiveFailures = 0;
  // Map to store the last delay for each error code to apply the multiplier
  private errorDelayMap: Map<string, number> = new Map();
  // Default multiplier for errors not specified in the backoffMultiplier map
  private defaultMultiplier = 2;

  constructor(options: RetryOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.onRetry = options.onRetry;
    this.retryCondition = options.retryCondition ?? isRetryable;
    this.backoffMultiplier = options.backoffMultiplier ?? this.backoffMultiplier;
  }

  async execute<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      try {
        // FIX: Adding a timeout using AbortController to prevent hanging indefinitely
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.options.executeTimeoutMs);
        const result = await fn(controller.signal);
        clearTimeout(timeoutId);
        this.onSuccess(); // Reset consecutive failures on success
        return result;
      } catch (err) {
        // Catch AbortError separately to avoid retrying on timeout
        if (err instanceof DOMException && err.name === "AbortError") {
          lastError = new Error("ETIMEDOUT: The operation timed out.");
        } else {
          lastError = err instanceof Error ? err : new Error(String(err));
        }
        this.consecutiveFailures++;
        if (attempt < this.options.maxRetries && this.retryCondition(lastError)) {
          this.onRetry?.(attempt + 1, lastError);
          // Using map to store the delays and to set the multiplier for each error message.
          // The user can pass the multipliers as a map in the options.
          const errorCode = getErrorCode(lastError);
          const errorMuliplier = this.backoffMultiplier.get(errorCode) ?? this.defaultMultiplier;
          const errorDelay = this.errorDelayMap.get(errorCode);
          const delay = errorDelay ? errorDelay * errorMuliplier : this.options.baseDelayMs;
          this.errorDelayMap.set(errorCode, delay);
          await this.sleep(Math.min(delay, this.options.maxDelayMs));
        } else break;
      }
    }

    throw lastError ?? new Error("Retry failed with unknown error");
  }

  private onSuccess(): void {
    this.consecutiveFailures = 0;
    this.errorDelayMap.clear();
  }


  private calculateBackoff(attempt: number): number {
    // BUG: 2 ** attempt overflows to Infinity for large attempt values (attempt > ~1023),
    // and Math.min with Infinity returns maxDelayMs, but intermediate calc can cause issues
    const exponentialDelay = this.options.baseDelayMs * Math.pow(2, attempt);
    const jitter = Math.random() * this.options.baseDelayMs;
    return Math.min(exponentialDelay + jitter, this.options.maxDelayMs);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getFailureCount(): number {
    return this.consecutiveFailures;
  }

  reset(): void {
    this.consecutiveFailures = 0;
  }
}

export async function withRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const handler = new RetryHandler(options);
  return handler.execute(fn);
}

function getErrorCode(error: Error): string {
  // Extract error code from the error message or name
  const message = error.message;
  const priorityCodes = [
      'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ECONNRESET', 'ECONNREFUSED',
      'ECONNABORTED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH',
      'ENETUNREACH', 'EPIPE', 'EAGAIN', 'ENOBUFS',
      '429', '500', '502', '503', '504'
  ];
  for (const code of priorityCodes) {
      if (message.includes(code)) {
          return code;
      }
  }
  
  return 'UNKNOWN_ERROR';
}

export function isRetryable(error: Error): boolean {

  const message = getErrorCode(error).toLowerCase();
  return message !== "unknown_error";
}
