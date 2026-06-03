import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  listDirectConversations,
  createDirectConversation,
  listDirectMessages,
  sendDirectMessage,
  markDirectConversationRead,
  reactToDirectMessage,
  removeDirectMessageReaction,
  updateDirectMessage,
  deleteDirectMessage,
} from "./direct-conversations-api";

const API_BASE = "http://localhost:3001/api/v1";

describe("direct-conversations-api", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const otherParticipant = { id: "u2", username: "bob", displayName: null, avatarUrl: null };
  const author = { id: "u1", username: "alice", displayName: null, avatarUrl: null };

  describe("listDirectConversations", () => {
    it("sends GET /direct-conversations", async () => {
      const mock = [
        {
          id: "dc1",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
          otherParticipant,
          lastMessage: null,
          unreadCount: 0,
        },
      ];
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mock), { status: 200 }));

      const result = await listDirectConversations("token");

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/direct-conversations`,
        expect.objectContaining({ method: "GET" }),
      );
      expect(result).toEqual(mock);
    });

    it("throws with backend error message", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 }));
      await expect(listDirectConversations("token")).rejects.toThrow("Unauthorized");
    });
  });

  describe("createDirectConversation", () => {
    it("sends POST /direct-conversations with usernameOrEmail", async () => {
      const mock = {
        id: "dc1",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant,
        lastMessage: null,
        unreadCount: 0,
      };
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mock), { status: 201 }));

      const result = await createDirectConversation("token", { usernameOrEmail: "bob" });

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/direct-conversations`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ usernameOrEmail: "bob" }),
        }),
      );
      expect(result).toEqual(mock);
    });

    it("throws with fallback on non-json error", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response("fail", { status: 500, statusText: "Internal Server Error" }));
      await expect(createDirectConversation("token", { usernameOrEmail: "bob" })).rejects.toThrow(
        "Failed to start conversation: 500 Internal Server Error",
      );
    });
  });

  describe("listDirectMessages", () => {
    it("sends GET /direct-conversations/:id/messages", async () => {
      const mock = [
        {
          id: "dm1",
          conversationId: "dc1",
          content: "hello",
          parentId: null,
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
          editedAt: null,
          author,
          parent: null,
        },
      ];
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mock), { status: 200 }));

      const result = await listDirectMessages("token", "dc1");

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/direct-conversations/dc1/messages`,
        expect.objectContaining({ method: "GET" }),
      );
      expect(result).toEqual(mock);
    });

    it("throws with backend error message", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ message: "Access denied" }), { status: 403 }));
      await expect(listDirectMessages("token", "dc1")).rejects.toThrow("Access denied");
    });
  });

  describe("sendDirectMessage", () => {
    it("sends POST /direct-conversations/:id/messages with content", async () => {
      const mock = {
        id: "dm1",
        conversationId: "dc1",
        content: "hello",
        parentId: null,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        editedAt: null,
        author,
        parent: null,
      };
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mock), { status: 201 }));

      const result = await sendDirectMessage("token", "dc1", { content: "hello" });

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/direct-conversations/dc1/messages`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ content: "hello" }),
        }),
      );
      expect(result).toEqual(mock);
    });

    it("sends parentId when provided", async () => {
      const mock = {
        id: "dm2",
        conversationId: "dc1",
        content: "reply",
        parentId: "dm1",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        editedAt: null,
        author,
        parent: null,
      };
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mock), { status: 201 }));

      const result = await sendDirectMessage("token", "dc1", { content: "reply", parentId: "dm1" });

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/direct-conversations/dc1/messages`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ content: "reply", parentId: "dm1" }),
        }),
      );
      expect(result).toEqual(mock);
    });

    it("throws with fallback on non-json error", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response("fail", { status: 500, statusText: "Internal Server Error" }));
      await expect(sendDirectMessage("token", "dc1", { content: "x" })).rejects.toThrow(
        "Failed to send message: 500 Internal Server Error",
      );
    });
  });

  describe("reactToDirectMessage", () => {
    it("sends POST /direct-conversations/:id/messages/:msgId/reactions with emoji", async () => {
      const mock = [{ emoji: "👍", count: 1, reactedByMe: true }];
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mock), { status: 201 }));

      const result = await reactToDirectMessage("token", "dc1", "dm1", "👍");

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/direct-conversations/dc1/messages/dm1/reactions`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ emoji: "👍" }),
        }),
      );
      expect(result).toEqual(mock);
    });

    it("throws with fallback on non-json error", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response("fail", { status: 500, statusText: "Internal Server Error" }));
      await expect(reactToDirectMessage("token", "dc1", "dm1", "👍")).rejects.toThrow(
        "Failed to add reaction: 500 Internal Server Error",
      );
    });
  });

  describe("removeDirectMessageReaction", () => {
    it("sends DELETE and returns updated reactions", async () => {
      const mock = [{ emoji: "👍", count: 1, reactedByMe: false }];
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mock), { status: 200 }));

      const result = await removeDirectMessageReaction("token", "dc1", "dm1", "👍");

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/direct-conversations/dc1/messages/dm1/reactions/%F0%9F%91%8D`,
        expect.objectContaining({ method: "DELETE" }),
      );
      expect(result).toEqual(mock);
    });

    it("throws with fallback on non-json error", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response("fail", { status: 500, statusText: "Internal Server Error" }));
      await expect(removeDirectMessageReaction("token", "dc1", "dm1", "👍")).rejects.toThrow(
        "Failed to remove reaction: 500 Internal Server Error",
      );
    });
  });

  describe("updateDirectMessage", () => {
    it("sends PATCH with content", async () => {
      const mock = {
        id: "dm1",
        conversationId: "dc1",
        content: "updated",
        parentId: null,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        editedAt: "2024-01-02T00:00:00Z",
        author,
        parent: null,
        reactions: [],
      };
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mock), { status: 200 }));

      const result = await updateDirectMessage("token", "dc1", "dm1", { content: "updated" });

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/direct-conversations/dc1/messages/dm1`,
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ content: "updated" }),
        }),
      );
      expect(result).toEqual(mock);
    });

    it("throws with backend error message", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ message: "Forbidden" }), { status: 403 }));
      await expect(updateDirectMessage("token", "dc1", "dm1", { content: "x" })).rejects.toThrow("Forbidden");
    });
  });

  describe("markDirectConversationRead", () => {
    it("sends POST /direct-conversations/:id/read", async () => {
      const mock = { ok: true };
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mock), { status: 200 }));

      const result = await markDirectConversationRead("token", "dc1");

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/direct-conversations/dc1/read`,
        expect.objectContaining({ method: "POST" }),
      );
      expect(result).toEqual(mock);
    });

    it("throws with backend error message", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ message: "Access denied" }), { status: 403 }));
      await expect(markDirectConversationRead("token", "dc1")).rejects.toThrow("Access denied");
    });
  });

  describe("deleteDirectMessage", () => {
    it("sends DELETE /direct-conversations/:id/messages/:msgId", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

      const result = await deleteDirectMessage("token", "dc1", "dm1");

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/direct-conversations/dc1/messages/dm1`,
        expect.objectContaining({ method: "DELETE" }),
      );
      expect(result).toEqual({ ok: true });
    });

    it("throws on API error", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ message: "Not found" }), { status: 404 }));
      await expect(deleteDirectMessage("token", "dc1", "dm1")).rejects.toThrow("Not found");
    });
  });
});
