import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getMessages, createMessage, updateMessage, deleteMessage } from "./messages-api";

const API_BASE = "http://localhost:3001/api/v1";

describe("messages-api", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const author = { id: "u1", username: "alice", displayName: null, avatarUrl: null };

  describe("getMessages", () => {
    it("sends GET with limit=50", async () => {
      const mock = [{ id: "m1", channelId: "ch1", content: "hello", parentId: null, createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z", editedAt: null, author }];
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mock), { status: 200 }));

      const result = await getMessages("token", "ws1", "ch1");

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/workspaces/ws1/channels/ch1/messages?limit=50`,
        expect.objectContaining({ method: "GET" }),
      );
      expect(result).toEqual(mock);
    });

    it("throws with backend error message", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ message: "Forbidden" }), { status: 403 }));
      await expect(getMessages("token", "ws1", "ch1")).rejects.toThrow("Forbidden");
    });
  });

  describe("createMessage", () => {
    it("sends POST with content", async () => {
      const mock = { id: "m1", channelId: "ch1", content: "hello", parentId: null, createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z", editedAt: null, author };
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mock), { status: 201 }));

      const result = await createMessage("token", "ws1", "ch1", { content: "hello" });

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/workspaces/ws1/channels/ch1/messages`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ content: "hello" }),
        }),
      );
      expect(result).toEqual(mock);
    });

    it("throws with fallback on non-json error", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response("fail", { status: 500, statusText: "Internal Server Error" }));
      await expect(createMessage("token", "ws1", "ch1", { content: "x" })).rejects.toThrow(
        "Failed to send message: 500 Internal Server Error",
      );
    });
  });

  describe("updateMessage", () => {
    it("sends PATCH with content", async () => {
      const mock = { id: "m1", channelId: "ch1", content: "updated", parentId: null, createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-02T00:00:00Z", editedAt: "2024-01-02T00:00:00Z", author };
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mock), { status: 200 }));

      const result = await updateMessage("token", "ws1", "ch1", "m1", { content: "updated" });

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/workspaces/ws1/channels/ch1/messages/m1`,
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ content: "updated" }),
        }),
      );
      expect(result).toEqual(mock);
    });

    it("throws with backend error message", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ message: "Edit window expired" }), { status: 422 }));
      await expect(updateMessage("token", "ws1", "ch1", "m1", { content: "x" })).rejects.toThrow("Edit window expired");
    });
  });

  describe("deleteMessage", () => {
    it("sends DELETE and handles 204", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));

      await deleteMessage("token", "ws1", "ch1", "m1");

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/workspaces/ws1/channels/ch1/messages/m1`,
        expect.objectContaining({ method: "DELETE" }),
      );
    });

    it("throws with backend error message", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ message: "Not found" }), { status: 404 }));
      await expect(deleteMessage("token", "ws1", "ch1", "m1")).rejects.toThrow("Not found");
    });
  });
});
