import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { login, register, getMe, logout, updateDisplayName, uploadAvatar, isTokenExpired } from "./auth-api";

const API_BASE = "http://localhost:3001/api/v1";

describe("auth-api", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeToken(exp: number): string {
    const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" }));
    const payload = btoa(JSON.stringify({ sub: "u1", exp }));
    return `${header}.${payload}.signature`;
  }

  describe("isTokenExpired", () => {
    it("returns false for a token expiring in the future", () => {
      const token = makeToken(Math.floor(Date.now() / 1000) + 3600);
      expect(isTokenExpired(token)).toBe(false);
    });

    it("returns true for an expired token", () => {
      const token = makeToken(Math.floor(Date.now() / 1000) - 3600);
      expect(isTokenExpired(token)).toBe(true);
    });

    it("returns true for a malformed token", () => {
      expect(isTokenExpired("not-a-jwt")).toBe(true);
    });

    it("uses buffer seconds when checking expiry", () => {
      const token = makeToken(Math.floor(Date.now() / 1000) + 30);
      expect(isTokenExpired(token, 60)).toBe(true);
      expect(isTokenExpired(token, 0)).toBe(false);
    });
  });

  describe("login", () => {
    it("sends POST /auth/login with body", async () => {
      const mockResult = {
        user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: null, avatarUpdatedAt: null, createdAt: "2024-01-01T00:00:00Z" },
        accessToken: "at",
        refreshToken: "rt",
      };
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockResult), { status: 200 }),
      );

      const result = await login({ email: "a@b.com", password: "secret" });

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/auth/login`,
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ email: "a@b.com", password: "secret" }),
        }),
      );
      expect(result).toEqual(mockResult);
    });

    it("throws with backend error message", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Invalid credentials" }), { status: 401 }),
      );

      await expect(login({ email: "a@b.com", password: "wrong" })).rejects.toThrow(
        "Invalid credentials",
      );
    });

    it("throws with fallback on non-json error", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response("oops", { status: 500, statusText: "Internal Server Error" }));

      await expect(login({ email: "a@b.com", password: "secret" })).rejects.toThrow(
        "Login failed: 500 Internal Server Error",
      );
    });
  });

  describe("register", () => {
    it("sends POST /auth/register with body", async () => {
      const mockResult = {
        user: { id: "u2", email: "b@c.com", username: "bob", displayName: "Bob", avatarUrl: null, avatarUpdatedAt: null, createdAt: "2024-01-01T00:00:00Z" },
        accessToken: "at2",
        refreshToken: "rt2",
      };
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockResult), { status: 200 }),
      );

      const result = await register({ email: "b@c.com", username: "bob", password: "secret" });

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/auth/register`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ email: "b@c.com", username: "bob", password: "secret" }),
        }),
      );
      expect(result).toEqual(mockResult);
    });

    it("throws with backend error message", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Email taken" }), { status: 409 }),
      );

      await expect(register({ email: "a@b.com", username: "alice", password: "secret" })).rejects.toThrow(
        "Email taken",
      );
    });
  });

  describe("getMe", () => {
    it("sends GET /auth/me with Authorization Bearer token", async () => {
      const mockUser = { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: null, avatarUpdatedAt: null, createdAt: "2024-01-01T00:00:00Z" };
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockUser), { status: 200 }),
      );

      const result = await getMe("my-token");

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/auth/me`,
        expect.objectContaining({
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: "Bearer my-token",
          },
        }),
      );
      expect(result).toEqual(mockUser);
    });

    it("throws on 401", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 }),
      );

      await expect(getMe("bad-token")).rejects.toThrow("Unauthorized");
    });
  });

  describe("logout", () => {
    it("sends POST /auth/logout with refreshToken", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );

      const result = await logout("refresh-123");

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/auth/logout`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ refreshToken: "refresh-123" }),
        }),
      );
      expect(result).toEqual({ success: true });
    });

    it("throws with backend error message", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Invalid token" }), { status: 400 }),
      );

      await expect(logout("bad")).rejects.toThrow("Invalid token");
    });
  });

  describe("updateDisplayName", () => {
    it("sends PATCH /auth/me with displayName and Authorization header", async () => {
      const mockUser = { id: "u1", email: "a@b.com", username: "alice", displayName: "Alice", avatarUrl: null, avatarUpdatedAt: null, createdAt: "2024-01-01T00:00:00Z" };
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockUser), { status: 200 }),
      );

      const result = await updateDisplayName("my-token", "Alice");

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/auth/me`,
        expect.objectContaining({
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: "Bearer my-token",
          },
          body: JSON.stringify({ displayName: "Alice" }),
        }),
      );
      expect(result).toEqual(mockUser);
    });

    it("throws with backend error message", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Too long" }), { status: 400 }),
      );

      await expect(updateDisplayName("token", "a".repeat(81))).rejects.toThrow("Too long");
    });
  });

  describe("uploadAvatar", () => {
    it("sends PATCH /auth/me/avatar/upload with FormData and Authorization header", async () => {
      const mockUser = { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: "/uploads/avatars/u1/test.png", avatarUpdatedAt: "2024-01-01T00:00:00Z", createdAt: "2024-01-01T00:00:00Z" };
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockUser), { status: 200 }),
      );

      const file = new File(["png"], "avatar.png", { type: "image/png" });
      const result = await uploadAvatar("my-token", file);

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/auth/me/avatar/upload`,
        expect.objectContaining({
          method: "PATCH",
          headers: {
            Accept: "application/json",
            Authorization: "Bearer my-token",
          },
          body: expect.any(FormData),
        }),
      );

      const call = vi.mocked(fetch).mock.calls[0] as [string, { body: FormData }];
      const formData = call[1].body;
      expect(formData.get("avatar")).toBe(file);
      expect(result).toEqual(mockUser);
    });

    it("throws with backend error message", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Too large" }), { status: 400 }),
      );

      const file = new File(["png"], "avatar.png", { type: "image/png" });
      await expect(uploadAvatar("token", file)).rejects.toThrow("Too large");
    });
  });
});
