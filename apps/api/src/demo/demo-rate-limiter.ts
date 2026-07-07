/**
 * Simple in-memory IP rate limiter for demo session creation.
 *
 * This is intentionally conservative: it tracks timestamps per IP and rejects
 * requests that exceed the configured hourly limit. In multi-instance
 * deployments it is per-instance rather than global, which still provides
 * basic abuse protection without requiring shared state.
 */
export class DemoRateLimiter {
  private readonly requests = new Map<string, number[]>();

  constructor(private readonly limitPerHour: number) {}

  isAllowed(ipAddress: string | null | undefined): boolean {
    if (!ipAddress) {
      return false;
    }

    const now = Date.now();
    const windowStart = now - 60 * 60 * 1000;

    const timestamps = this.requests.get(ipAddress) ?? [];
    const recent = timestamps.filter((ts) => ts > windowStart);

    if (recent.length >= this.limitPerHour) {
      this.requests.set(ipAddress, recent);
      return false;
    }

    recent.push(now);
    this.requests.set(ipAddress, recent);
    return true;
  }
}
