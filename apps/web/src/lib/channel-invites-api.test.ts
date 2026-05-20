import { describe, it, expect, vi } from "vitest";
import {
  createChannelInvite,
  getPendingChannelInvites,
  acceptChannelInvite,
  declineChannelInvite,
} from "./channel-invites-api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";

describe("channel-invites-api", () => {
  const token = "test-token";

  describe("createChannelInvite", () => {
    it("sends POST /workspaces/:id/channels/:id/invites with email", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: "invite-1",
            workspaceId: "ws1",
            channelId: "ch1",
            email: "a@b.com",
            role: "MEMBER",
            token: "tok",
            expiresAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          }),
      });

      await createChannelInvite(token, "ws1", "ch1", { email: "a@b.com", role: "MEMBER" });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/workspaces/ws1/channels/ch1/invites"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ email: "a@b.com", role: "MEMBER" }),
        }),
      );
    });

    it("sends POST /workspaces/:id/channels/:id/invites with identifier", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: "invite-1",
            workspaceId: "ws1",
            channelId: "ch1",
            email: "a@b.com",
            role: "MEMBER",
            token: "tok",
            expiresAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          }),
      });

      await createChannelInvite(token, "ws1", "ch1", { identifier: "bob", role: "MEMBER" });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/workspaces/ws1/channels/ch1/invites"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ identifier: "bob", role: "MEMBER" }),
        }),
      );
    });

    it("encodes workspaceId and channelId", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: "invite-1",
            workspaceId: "ws 1",
            channelId: "ch 1",
            email: "a@b.com",
            role: "MEMBER",
            token: "tok",
            expiresAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          }),
      });

      await createChannelInvite(token, "ws 1", "ch 1", { email: "a@b.com", role: "MEMBER" });

      expect(global.fetch).toHaveBeenCalledWith(
        `${API_BASE}/workspaces/ws%201/channels/ch%201/invites`,
        expect.anything(),
      );
    });

    it("throws backend error message on failure", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: () => Promise.resolve({ message: "Channel not found" }),
      });

      await expect(
        createChannelInvite(token, "ws1", "ch1", { email: "a@b.com", role: "MEMBER" }),
      ).rejects.toThrow("Channel not found");
    });
  });

  describe("getPendingChannelInvites", () => {
    it("returns pending channel invites on success", async () => {
      const invites = [
        {
          id: "invite-1",
          role: "MEMBER" as const,
          workspace: { id: "ws-1", name: "Test Workspace", slug: "test" },
          channel: { id: "ch-1", name: "general", slug: "general" },
          invitedBy: { id: "user-1", username: "alice", displayName: "Alice" },
          expiresAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
      ];
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(invites),
      });

      const result = await getPendingChannelInvites(token);
      expect(result).toEqual(invites);
      expect(global.fetch).toHaveBeenCalledWith(
        `${API_BASE}/channel-invites/pending`,
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

      await expect(getPendingChannelInvites(token)).rejects.toThrow("Server error");
    });
  });

  describe("acceptChannelInvite", () => {
    it("returns result on success", async () => {
      const payload = {
        channelId: "ch-1",
        workspaceId: "ws-1",
        role: "MEMBER",
        joinedAt: new Date().toISOString(),
      };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(payload),
      });

      const result = await acceptChannelInvite(token, "invite-1");
      expect(result).toEqual(payload);
      expect(global.fetch).toHaveBeenCalledWith(
        `${API_BASE}/channel-invites/invite-1/accept`,
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("encodes inviteId", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            channelId: "ch-1",
            workspaceId: "ws-1",
            role: "MEMBER",
            joinedAt: new Date().toISOString(),
          }),
      });

      await acceptChannelInvite(token, "invite 1");

      expect(global.fetch).toHaveBeenCalledWith(
        `${API_BASE}/channel-invites/invite%201/accept`,
        expect.anything(),
      );
    });

    it("throws on error response", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        statusText: "Conflict",
        json: () => Promise.resolve({ message: "Already a member" }),
      });

      await expect(acceptChannelInvite(token, "invite-1")).rejects.toThrow("Already a member");
    });
  });

  describe("declineChannelInvite", () => {
    it("returns result on success", async () => {
      const payload = { id: "invite-1", deletedAt: new Date().toISOString() };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(payload),
      });

      const result = await declineChannelInvite(token, "invite-1");
      expect(result).toEqual(payload);
      expect(global.fetch).toHaveBeenCalledWith(
        `${API_BASE}/channel-invites/invite-1/decline`,
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

      await expect(declineChannelInvite(token, "invite-1")).rejects.toThrow("Invite not found");
    });
  });
});
