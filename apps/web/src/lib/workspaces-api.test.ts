import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getWorkspaces, getWorkspace, createWorkspace } from "./workspaces-api";

const API_BASE = "http://localhost:3001/api/v1";

describe("workspaces-api", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("getWorkspaces", () => {
    it("sends GET /workspaces with Authorization header", async () => {
      const mock = [{ id: "ws1", name: "Acme", slug: "acme", description: null, ownerId: "u1", createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z", deletedAt: null }];
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mock), { status: 200 }));

      const result = await getWorkspaces("token");

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/workspaces`,
        expect.objectContaining({
          method: "GET",
          headers: { Accept: "application/json", Authorization: "Bearer token" },
        }),
      );
      expect(result).toEqual(mock);
    });

    it("throws with backend error message", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ message: "Forbidden" }), { status: 403 }));
      await expect(getWorkspaces("token")).rejects.toThrow("Forbidden");
    });
  });

  describe("getWorkspace", () => {
    it("sends GET /workspaces/:id", async () => {
      const mock = { id: "ws1", name: "Acme", slug: "acme", description: null, ownerId: "u1", createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z", deletedAt: null };
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mock), { status: 200 }));

      const result = await getWorkspace("token", "ws1");

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/workspaces/ws1`,
        expect.objectContaining({ method: "GET" }),
      );
      expect(result).toEqual(mock);
    });
  });

  describe("createWorkspace", () => {
    it("sends POST /workspaces with body", async () => {
      const mock = { id: "ws2", name: "New", slug: "new", description: null, ownerId: "u1", createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z", deletedAt: null };
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mock), { status: 201 }));

      const result = await createWorkspace("token", { name: "New", slug: "new" });

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/workspaces`,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "Content-Type": "application/json" }),
          body: JSON.stringify({ name: "New", slug: "new" }),
        }),
      );
      expect(result).toEqual(mock);
    });

    it("throws with fallback on non-json error", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response("fail", { status: 500, statusText: "Internal Server Error" }));
      await expect(createWorkspace("token", { name: "New", slug: "new" })).rejects.toThrow(
        "Failed to create workspace: 500 Internal Server Error",
      );
    });
  });
});
