import { DemoRateLimiter } from './demo-rate-limiter';

describe('DemoRateLimiter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('allows requests up to the configured hourly limit', () => {
    const limiter = new DemoRateLimiter(3);

    expect(limiter.isAllowed('127.0.0.1')).toBe(true);
    expect(limiter.isAllowed('127.0.0.1')).toBe(true);
    expect(limiter.isAllowed('127.0.0.1')).toBe(true);
    expect(limiter.isAllowed('127.0.0.1')).toBe(false);
  });

  it('rejects requests from different IPs independently', () => {
    const limiter = new DemoRateLimiter(2);

    expect(limiter.isAllowed('1.1.1.1')).toBe(true);
    expect(limiter.isAllowed('2.2.2.2')).toBe(true);
    expect(limiter.isAllowed('2.2.2.2')).toBe(true);
    expect(limiter.isAllowed('2.2.2.2')).toBe(false);
    expect(limiter.isAllowed('1.1.1.1')).toBe(true);
  });

  it('rejects requests without an IP address', () => {
    const limiter = new DemoRateLimiter(10);
    expect(limiter.isAllowed(null)).toBe(false);
    expect(limiter.isAllowed(undefined)).toBe(false);
    expect(limiter.isAllowed('')).toBe(false);
  });

  it('resets the sliding window after one hour', () => {
    const limiter = new DemoRateLimiter(1);

    expect(limiter.isAllowed('127.0.0.1')).toBe(true);
    expect(limiter.isAllowed('127.0.0.1')).toBe(false);

    jest.advanceTimersByTime(60 * 60 * 1000 + 1);

    expect(limiter.isAllowed('127.0.0.1')).toBe(true);
  });
});
