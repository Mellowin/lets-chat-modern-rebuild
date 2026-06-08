import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

async function importAvatarUrl(apiBase: string) {
  vi.doMock("./env", () => ({
    getApiBase: () => apiBase,
    getApiOrigin: () => apiBase.replace(/\/api\/v1\/?$/, ""),
  }));
  const { getAvatarUrl } = await import("./avatar-url");
  vi.doUnmock("./env");
  return getAvatarUrl;
}

describe("getAvatarUrl", () => {
  it("returns null for null input", async () => {
    const getAvatarUrl = await importAvatarUrl("http://localhost:3001/api/v1");
    expect(getAvatarUrl(null)).toBeNull();
  });

  it("returns absolute URL as-is", async () => {
    const getAvatarUrl = await importAvatarUrl("http://localhost:3001/api/v1");
    expect(getAvatarUrl("https://cdn.example.com/avatar.png")).toBe(
      "https://cdn.example.com/avatar.png",
    );
  });

  it("prepends API origin to relative URL", async () => {
    const getAvatarUrl = await importAvatarUrl("http://localhost:3001/api/v1");
    expect(getAvatarUrl("/uploads/avatars/u1/test.png")).toBe(
      "http://localhost:3001/uploads/avatars/u1/test.png",
    );
  });

  it("works with API_URL without trailing slash", async () => {
    const getAvatarUrl = await importAvatarUrl("http://api.example.com/api/v1");
    expect(getAvatarUrl("/uploads/avatars/u1/test.png")).toBe(
      "http://api.example.com/uploads/avatars/u1/test.png",
    );
  });

  it("works with API_URL with trailing slash", async () => {
    const getAvatarUrl = await importAvatarUrl("http://api.example.com/api/v1/");
    expect(getAvatarUrl("/uploads/avatars/u1/test.png")).toBe(
      "http://api.example.com/uploads/avatars/u1/test.png",
    );
  });
});
