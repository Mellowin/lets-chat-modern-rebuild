import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  listDirectConversations,
  createDirectConversation,
  listDirectMessages,
  sendDirectMessage,
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

    it("throws with fallback on non-json error", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response("fail", { status: 500, statusText: "Internal Server Error" }));
      await expect(sendDirectMessage("token", "dc1", { content: "x" })).rejects.toThrow(
        "Failed to send message: 500 Internal Server Error",
      );
    });
  });
});
