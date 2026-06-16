import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { authFetch, AUTH_EVENTS } from "./auth-fetch";

const API_BASE = "http://localhost:3001/api/v1";

function makeToken(exp: number): string {
  const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ sub: "u1", exp }));
  return `${header}.${payload}.signature`;
}

const validAccessToken = makeToken(Math.floor(Date.now() / 1000) + 3600);
const newAccessToken = makeToken(Math.floor(Date.now() / 1000) + 7200);

describe("authFetch", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("attaches the stored access token when no Authorization header is provided", async () => {
    sessionStorage.setItem("accessToken", validAccessToken);
    sessionStorage.setItem("refreshToken", "rt");
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await authFetch(`${API_BASE}/workspaces/ws1/channels`);

    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE}/workspaces/ws1/channels`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${validAccessToken}`,
        }),
      }),
    );
  });

  it("returns the response directly when status is not 401", async () => {
    sessionStorage.setItem("accessToken", validAccessToken);
    sessionStorage.setItem("refreshToken", "rt");
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify([{ id: "ch1" }]), { status: 200 }));

    const res = await authFetch(`${API_BASE}/workspaces/ws1/channels`);

    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("refreshes token on 401 and retries the original request once", async () => {
    sessionStorage.setItem("accessToken", validAccessToken);
    sessionStorage.setItem("refreshToken", "rt");

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user: { id: "u1", email: "a@b.com", username: "alice" },
            accessToken: newAccessToken,
            refreshToken: "new-rt",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: "ch1" }]), { status: 200 }));

    const res = await authFetch(`${API_BASE}/workspaces/ws1/channels`);

    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sessionStorage.getItem("accessToken")).toBe(newAccessToken);
    expect(sessionStorage.getItem("refreshToken")).toBe("new-rt");

    const lastCall = vi.mocked(fetch).mock.calls[2] as [string, RequestInit];
    expect(lastCall[1].headers).toEqual(
      expect.objectContaining({ Authorization: `Bearer ${newAccessToken}` }),
    );
  });

  it("logs out and returns original 401 when refresh fails", async () => {
    sessionStorage.setItem("accessToken", validAccessToken);
    sessionStorage.setItem("refreshToken", "rt");

    const expiredListener = vi.fn();
    window.addEventListener(AUTH_EVENTS.SESSION_EXPIRED, expiredListener);

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "Invalid refresh token" }), { status: 401 }));

    const res = await authFetch(`${API_BASE}/workspaces/ws1/channels`);

    expect(res.status).toBe(401);
    expect(sessionStorage.getItem("accessToken")).toBeNull();
    expect(sessionStorage.getItem("refreshToken")).toBeNull();
    expect(expiredListener).toHaveBeenCalled();

    window.removeEventListener(AUTH_EVENTS.SESSION_EXPIRED, expiredListener);
  });

  it("does not refresh for the refresh endpoint itself", async () => {
    sessionStorage.setItem("accessToken", validAccessToken);
    sessionStorage.setItem("refreshToken", "rt");

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ user: { id: "u1" }, accessToken: newAccessToken, refreshToken: "new-rt" }), { status: 200 }),
    );

    const res = await authFetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: "rt" }),
    });

    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("runs only one refresh request for concurrent 401s", async () => {
    sessionStorage.setItem("accessToken", validAccessToken);
    sessionStorage.setItem("refreshToken", "rt");

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user: { id: "u1" },
            accessToken: newAccessToken,
            refreshToken: "new-rt",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: "a" }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: "b" }]), { status: 200 }));

    const [res1, res2] = await Promise.all([
      authFetch(`${API_BASE}/workspaces/ws1/channels`),
      authFetch(`${API_BASE}/workspaces/ws2/channels`),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    // Count refresh calls: only one POST /auth/refresh should be made.
    const refreshCalls = vi.mocked(fetch).mock.calls.filter(
      ([url]) => typeof url === "string" && url.includes("/auth/refresh"),
    );
    expect(refreshCalls).toHaveLength(1);
  });

  it("does not retry after a successful refresh returns 401 again", async () => {
    sessionStorage.setItem("accessToken", validAccessToken);
    sessionStorage.setItem("refreshToken", "rt");

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ user: { id: "u1" }, accessToken: newAccessToken, refreshToken: "new-rt" }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 }));

    const res = await authFetch(`${API_BASE}/workspaces/ws1/channels`);

    expect(res.status).toBe(401);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
