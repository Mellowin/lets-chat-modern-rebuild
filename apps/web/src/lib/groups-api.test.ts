import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pinGroupMessage, unpinGroupMessage, getPinnedGroupMessages } from "./groups-api";

const API_BASE = "http://localhost:3001/api/v1";

const author = { id: "u1", username: "alice", displayName: null, avatarUrl: null };

describe("groups-api — pins", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("pinGroupMessage", () => {
    it("sends POST to pin endpoint", async () => {
      const mock = {
        id: "pin1",
        pinnedAt: "2024-01-01T00:00:00Z",
        pinnedBy: author,
        message: { id: "gm1", content: "hello", createdAt: "2024-01-01T00:00:00Z", author, attachmentCount: 0, replyTo: null },
      };
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mock), { status: 201 }));

      const result = await pinGroupMessage("token", "g1", "gm1");

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/groups/g1/messages/gm1/pin`,
        expect.objectContaining({ method: "POST" }),
      );
      expect(result).toEqual(mock);
    });

    it("throws with backend error message", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ message: "Forbidden" }), { status: 403 }));
      await expect(pinGroupMessage("token", "g1", "gm1")).rejects.toThrow("Forbidden");
    });
  });

  describe("unpinGroupMessage", () => {
    it("sends DELETE to pin endpoint", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));

      await unpinGroupMessage("token", "g1", "gm1");

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/groups/g1/messages/gm1/pin`,
        expect.objectContaining({ method: "DELETE" }),
      );
    });

    it("throws with backend error message", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ message: "Not found" }), { status: 404 }));
      await expect(unpinGroupMessage("token", "g1", "gm1")).rejects.toThrow("Not found");
    });
  });

  describe("getPinnedGroupMessages", () => {
    it("sends GET to pins endpoint", async () => {
      const mock = {
        items: [
          {
            id: "pin1",
            pinnedAt: "2024-01-01T00:00:00Z",
            pinnedBy: author,
            message: { id: "gm1", content: "hello", createdAt: "2024-01-01T00:00:00Z", author, attachmentCount: 0, replyTo: null },
          },
        ],
        nextCursor: null,
        hasMore: false,
      };
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mock), { status: 200 }));

      const result = await getPinnedGroupMessages("token", "g1");

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/groups/g1/pins?limit=20`,
        expect.objectContaining({ method: "GET" }),
      );
      expect(result).toEqual(mock);
    });
  });
});
