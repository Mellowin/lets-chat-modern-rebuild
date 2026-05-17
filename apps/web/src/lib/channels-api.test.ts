import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getChannels, getChannel, createChannel, addChannelMember, removeChannelMember, restoreChannel } from "./channels-api";

const API_BASE = "http://localhost:3001/api/v1";

describe("channels-api", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("getChannels", () => {
    it("sends GET /workspaces/:wsId/channels", async () => {
      const mock = [{ id: "ch1", workspaceId: "ws1", name: "general", slug: "general", description: null, type: "PUBLIC" as const, createdById: "u1", createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z", deletedAt: null }];
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mock), { status: 200 }));

      const result = await getChannels("token", "ws1");

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/workspaces/ws1/channels`,
        expect.objectContaining({ method: "GET" }),
      );
      expect(result).toEqual(mock);
    });

    it("throws with backend error message", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ message: "Not found" }), { status: 404 }));
      await expect(getChannels("token", "ws1")).rejects.toThrow("Not found");
    });
  });

  describe("getChannel", () => {
    it("sends GET /workspaces/:wsId/channels/:chId", async () => {
      const mock = { id: "ch1", workspaceId: "ws1", name: "general", slug: "general", description: null, type: "PUBLIC" as const, createdById: "u1", createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z", deletedAt: null };
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mock), { status: 200 }));

      const result = await getChannel("token", "ws1", "ch1");

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/workspaces/ws1/channels/ch1`,
        expect.objectContaining({ method: "GET" }),
      );
      expect(result).toEqual(mock);
    });
  });

  describe("createChannel", () => {
    it("sends POST /workspaces/:wsId/channels with body", async () => {
      const mock = { id: "ch2", workspaceId: "ws1", name: "random", slug: "random", description: "desc", type: "PRIVATE" as const, createdById: "u1", createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z", deletedAt: null };
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mock), { status: 201 }));

      const result = await createChannel("token", "ws1", { name: "random", description: "desc", type: "PRIVATE" });

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/workspaces/ws1/channels`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "random", description: "desc", type: "PRIVATE" }),
        }),
      );
      expect(result).toEqual(mock);
    });

    it("throws with fallback on non-json error", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response("fail", { status: 500, statusText: "Internal Server Error" }));
      await expect(createChannel("token", "ws1", { name: "x" })).rejects.toThrow(
        "Failed to create channel: 500 Internal Server Error",
      );
    });
  });

  describe("addChannelMember", () => {
    it("sends POST /workspaces/:wsId/channels/:chId/members with body", async () => {
      const mock = { id: "cm1", channelId: "ch1", role: "MEMBER" as const, joinedAt: "2024-01-01T00:00:00Z", user: { id: "u2", username: "bob" } };
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mock), { status: 201 }));

      const result = await addChannelMember("token", "ws1", "ch1", { identifier: "bob" });

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/workspaces/ws1/channels/ch1/members`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ identifier: "bob" }),
        }),
      );
      expect(result).toEqual(mock);
    });

    it("throws with backend error message", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ message: "Already a member" }), { status: 409 }));
      await expect(addChannelMember("token", "ws1", "ch1", { identifier: "bob" })).rejects.toThrow("Already a member");
    });
  });

  describe("removeChannelMember", () => {
    it("sends DELETE /workspaces/:wsId/channels/:chId/members/:memberId", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));

      const result = await removeChannelMember("token", "ws1", "ch1", "cm1");

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/workspaces/ws1/channels/ch1/members/cm1`,
        expect.objectContaining({ method: "DELETE" }),
      );
      expect(result).toEqual({ success: true });
    });

    it("throws with backend error message", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ message: "Member not found" }), { status: 404 }));
      await expect(removeChannelMember("token", "ws1", "ch1", "cm1")).rejects.toThrow("Member not found");
    });
  });

  describe("restoreChannel", () => {
    it("sends POST /workspaces/:wsId/channels/:chId/restore", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));

      const result = await restoreChannel("token", "ws1", "ch1");

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/workspaces/ws1/channels/ch1/restore`,
        expect.objectContaining({ method: "POST" }),
      );
      expect(result).toEqual({ success: true });
    });

    it("throws with backend error message", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ message: "Channel is not archived" }), { status: 409 }));
      await expect(restoreChannel("token", "ws1", "ch1")).rejects.toThrow("Channel is not archived");
    });
  });
});
