// Disable the global throttler guard for e2e tests by default to avoid
// flaky failures when suites make many sequential requests. Individual tests
// that need to verify rate limiting can override this in a dedicated module.
process.env.THROTTLER_ENABLED = 'false';
