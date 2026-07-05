/**
 * Simple in-memory, per-key sliding-window rate limiter for write operations
 * (publish/update). Adequate for a single-process self-hosted deployment; if
 * scaled horizontally this would move to a shared store (e.g. Redis).
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly maxPerWindow: number,
    private readonly windowMs: number = 60_000,
  ) {}

  /** Returns true if the action is allowed and records it; false if throttled. */
  take(key: string, now: number = Date.now()): boolean {
    const cutoff = now - this.windowMs;
    const arr = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (arr.length >= this.maxPerWindow) {
      this.hits.set(key, arr);
      return false;
    }
    arr.push(now);
    this.hits.set(key, arr);
    return true;
  }
}

export class PayloadTooLargeError extends Error {
  constructor(public readonly limit: number) {
    super(`HTML exceeds the maximum allowed size of ${limit} bytes`);
    this.name = "PayloadTooLargeError";
  }
}

/** Throws PayloadTooLargeError if the HTML byte length exceeds `maxBytes`. */
export function assertWithinSize(html: string, maxBytes: number): void {
  const bytes = Buffer.byteLength(html, "utf8");
  if (bytes > maxBytes) throw new PayloadTooLargeError(maxBytes);
}
