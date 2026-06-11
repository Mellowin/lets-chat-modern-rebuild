import { describe, it, expect, vi } from "vitest";
import { getPendingInvites, acceptInvite, declineInvite, previewInvite, acceptInviteByToken } from "./invites-api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";

describe("invites-api", () => {
  const token = "test-token";

  describe("createWorkspaceInvite", () => {
    it("sends POST /workspaces/:id/invites with email", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: "invite-1", workspaceId: "ws1", email: "a@b.com", role: "MEMBER", token: "tok", expiresAt: new Date().toISOString(), createdAt: new Date().toISOString() }),
      });

      await import("./invites-api").then((m) => m.createWorkspaceInvite(token, "ws1", { email: "a@b.com", role: "MEMBER" }));

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/workspaces/ws1/invites"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ email: "a@b.com", role: "MEMBER" }),
        }),
      );
    });

    it("sends POST /workspaces/:id/invites with identifier", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: "invite-1", workspaceId: "ws1", email: "a@b.com", role: "MEMBER", token: "tok", expiresAt: new Date().toISOString(), createdAt: new Date().toISOString() }),
      });

      await import("./invites-api").then((m) => m.createWorkspaceInvite(token, "ws1", { identifier: "bob", role: "MEMBER" }));

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/workspaces/ws1/invites"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ identifier: "bob", role: "MEMBER" }),
        }),
      );
    });

    it("throws on error response", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: () => Promise.resolve({ message: "User not found" }),
      });

      await expect(
        import("./invites-api").then((m) => m.createWorkspaceInvite(token, "ws1", { identifier: "unknown", role: "MEMBER" })),
      ).rejects.toThrow("User not found");
    });
  });

  describe("getPendingInvites", () => {
    it("returns pending invites on success", async () => {
      const invites = [
        {
          id: "invite-1",
          workspace: { id: "ws-1", name: "Test Workspace", slug: "test" },
          invitedBy: { id: "user-1", username: "alice", displayName: "Alice" },
          role: "MEMBER",
          expiresAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
      ];
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(invites),
      });

      const result = await getPendingInvites(token);
      expect(result).toEqual(invites);
      expect(global.fetch).toHaveBeenCalledWith(
        `${API_BASE}/invites/pending`,
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("throws on error response", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: () => Promise.resolve({ message: "Server error" }),
      });

      await expect(getPendingInvites(token)).rejects.toThrow("Server error");
    });
  });

  describe("acceptInvite", () => {
    it("returns result on success", async () => {
      const payload = { workspaceId: "ws-1", role: "MEMBER", joinedAt: new Date().toISOString() };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(payload),
      });

      const result = await acceptInvite(token, "invite-1");
      expect(result).toEqual(payload);
      expect(global.fetch).toHaveBeenCalledWith(
        `${API_BASE}/invites/invite-1/accept`,
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("throws on error response", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        statusText: "Conflict",
        json: () => Promise.resolve({ message: "Already a member" }),
      });

      await expect(acceptInvite(token, "invite-1")).rejects.toThrow("Already a member");
    });
  });

  describe("previewInvite", () => {
    it("returns preview on success", async () => {
      const payload = { workspaceName: "Test Workspace", expiresAt: new Date().toISOString(), valid: true };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(payload),
      });

      const result = await previewInvite("invite-token");
      expect(result).toEqual(payload);
      expect(global.fetch).toHaveBeenCalledWith(
        `${API_BASE}/invites/invite-token/preview`,
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("throws on error response", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: () => Promise.resolve({ message: "Invite not found" }),
      });

      await expect(previewInvite("invite-token")).rejects.toThrow("Invite not found");
    });
  });

  describe("acceptInviteByToken", () => {
    it("returns result on success", async () => {
      const payload = { workspaceId: "ws-1", role: "MEMBER", joinedAt: new Date().toISOString() };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(payload),
      });

      const result = await acceptInviteByToken(token, "invite-token");
      expect(result).toEqual(payload);
      expect(global.fetch).toHaveBeenCalledWith(
        `${API_BASE}/invites/accept`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ token: "invite-token" }),
        }),
      );
    });

    it("throws on error response", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 410,
        statusText: "Gone",
        json: () => Promise.resolve({ message: "Invite expired" }),
      });

      await expect(acceptInviteByToken(token, "invite-token")).rejects.toThrow("Invite expired");
    });
  });

  describe("declineInvite", () => {
    it("returns result on success", async () => {
      const payload = { id: "invite-1", deletedAt: new Date().toISOString() };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(payload),
      });

      const result = await declineInvite(token, "invite-1");
      expect(result).toEqual(payload);
      expect(global.fetch).toHaveBeenCalledWith(
        `${API_BASE}/invites/invite-1/decline`,
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("throws on error response", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: () => Promise.resolve({ message: "Invite not found" }),
      });

      await expect(declineInvite(token, "invite-1")).rejects.toThrow("Invite not found");
    });
  });
});
