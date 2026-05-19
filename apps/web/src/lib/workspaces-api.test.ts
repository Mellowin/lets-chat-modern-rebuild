import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getWorkspaces, getWorkspace, createWorkspace, leaveWorkspace, removeWorkspaceMember, restoreWorkspace, listArchivedWorkspaces, type Workspace } from "./workspaces-api";

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

  describe("leaveWorkspace", () => {
    it("sends POST /workspaces/:id/leave with Authorization header", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));

      const result = await leaveWorkspace("token", "ws1");

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/workspaces/ws1/leave`,
        expect.objectContaining({
          method: "POST",
          headers: { Accept: "application/json", Authorization: "Bearer token" },
        }),
      );
      expect(result).toEqual({ success: true });
    });

    it("throws with backend error message", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Owner cannot leave workspace" }), { status: 403 }),
      );
      await expect(leaveWorkspace("token", "ws1")).rejects.toThrow("Owner cannot leave workspace");
    });
  });

  describe("removeWorkspaceMember", () => {
    it("sends DELETE /workspaces/:id/members/:memberId with Authorization header", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));

      const result = await removeWorkspaceMember("token", "ws1", "m1");

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/workspaces/ws1/members/m1`,
        expect.objectContaining({
          method: "DELETE",
          headers: { Accept: "application/json", Authorization: "Bearer token" },
        }),
      );
      expect(result).toEqual({ success: true });
    });

    it("throws with backend error message for owner removal", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Cannot remove workspace owner" }), { status: 400 }),
      );
      await expect(removeWorkspaceMember("token", "ws1", "m1")).rejects.toThrow("Cannot remove workspace owner");
    });

    it("throws with backend error message for admin removing admin", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Admin can only remove members" }), { status: 403 }),
      );
      await expect(removeWorkspaceMember("token", "ws1", "m1")).rejects.toThrow("Admin can only remove members");
    });
  });

  describe("restoreWorkspace", () => {
    it("sends POST /workspaces/:id/restore with Authorization header", async () => {
      const mock: Workspace = { id: "ws1", name: "Restored", slug: "restored", description: null, ownerId: "u1", createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z", deletedAt: null };
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mock), { status: 200 }));

      const result = await restoreWorkspace("token", "ws1");

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/workspaces/ws1/restore`,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Accept: "application/json",
            Authorization: "Bearer token",
            "Content-Type": "application/json",
          }),
        }),
      );
      expect(result.deletedAt).toBeNull();
    });

    it("throws with backend error message 'Workspace is not archived'", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Workspace is not archived" }), { status: 409 }),
      );
      await expect(restoreWorkspace("token", "ws1")).rejects.toThrow("Workspace is not archived");
    });

    it("throws with backend error message 'Only owner can restore workspace'", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Only owner can restore workspace" }), { status: 403 }),
      );
      await expect(restoreWorkspace("token", "ws1")).rejects.toThrow("Only owner can restore workspace");
    });
  });

  describe("listArchivedWorkspaces", () => {
    it("sends GET /workspaces/archived with Authorization header", async () => {
      const mock: Workspace[] = [
        { id: "ws1", name: "Old", slug: "old", description: null, ownerId: "u1", createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z", deletedAt: "2024-06-01T00:00:00Z" },
      ];
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mock), { status: 200 }));

      const result = await listArchivedWorkspaces("token");

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/workspaces/archived`,
        expect.objectContaining({
          method: "GET",
          headers: { Accept: "application/json", Authorization: "Bearer token" },
        }),
      );
      expect(result).toEqual(mock);
    });

    it("throws with backend error message", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 }),
      );
      await expect(listArchivedWorkspaces("token")).rejects.toThrow("Unauthorized");
    });
  });
});
