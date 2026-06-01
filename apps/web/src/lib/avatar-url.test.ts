import { describe, it, expect, beforeEach } from "vitest";
import { getAvatarUrl } from "./avatar-url";

describe("getAvatarUrl", () => {
  const originalEnv = process.env.NEXT_PUBLIC_API_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3001/api/v1";
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_URL = originalEnv;
  });

  it("returns null for null input", () => {
    expect(getAvatarUrl(null)).toBeNull();
  });

  it("returns absolute URL as-is", () => {
    expect(getAvatarUrl("https://cdn.example.com/avatar.png")).toBe(
      "https://cdn.example.com/avatar.png",
    );
  });

  it("prepends API origin to relative URL", () => {
    expect(getAvatarUrl("/uploads/avatars/u1/test.png")).toBe(
      "http://localhost:3001/uploads/avatars/u1/test.png",
    );
  });

  it("works with API_URL without trailing slash", () => {
    process.env.NEXT_PUBLIC_API_URL = "http://api.example.com/api/v1";
    expect(getAvatarUrl("/uploads/avatars/u1/test.png")).toBe(
      "http://api.example.com/uploads/avatars/u1/test.png",
    );
  });

  it("works with API_URL with trailing slash", () => {
    process.env.NEXT_PUBLIC_API_URL = "http://api.example.com/api/v1/";
    expect(getAvatarUrl("/uploads/avatars/u1/test.png")).toBe(
      "http://api.example.com/uploads/avatars/u1/test.png",
    );
  });
});
