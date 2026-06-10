import { describe, it, expect, vi, afterEach } from "vitest";
import {
  fetchWithTimeout,
  ApiTimeoutError,
  isApiTimeoutError,
  DEFAULT_API_TIMEOUT_MS,
} from "./fetch-timeout";

describe("fetchWithTimeout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns response when fetch resolves before timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response('"ok"', { status: 200 })),
    );

    const result = await fetchWithTimeout("http://example.com/test");

    expect(result.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      "http://example.com/test",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("throws ApiTimeoutError when fetch does not resolve in time", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, options) => {
        return new Promise((_resolve, reject) => {
          if (options?.signal?.aborted) {
            const err = new Error("The operation was aborted.");
            err.name = "AbortError";
            reject(err);
            return;
          }
          options?.signal?.addEventListener("abort", () => {
            const err = new Error("The operation was aborted.");
            err.name = "AbortError";
            reject(err);
          });
        });
      }),
    );

    await expect(
      fetchWithTimeout("http://example.com/test", {}, 10),
    ).rejects.toThrow(ApiTimeoutError);
  });

  it("exposes isApiTimeoutError guard", () => {
    expect(isApiTimeoutError(new ApiTimeoutError())).toBe(true);
    expect(isApiTimeoutError(new Error("other"))).toBe(false);
    expect(isApiTimeoutError("string")).toBe(false);
    expect(isApiTimeoutError(null)).toBe(false);
  });

  it("has a 15-second default timeout", () => {
    expect(DEFAULT_API_TIMEOUT_MS).toBe(15_000);
  });

  it("passes through non-timeout fetch errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );

    await expect(
      fetchWithTimeout("http://example.com/test", {}, 5000),
    ).rejects.toThrow("Failed to fetch");
  });
});
