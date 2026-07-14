import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getMessages, createMessage, updateMessage, deleteMessage, presignAttachmentUpload, uploadAttachmentToPresignedUrl, getAttachmentDownloadUrl, fetchAttachmentFile, getAttachmentFileObjectUrl, getMessageContext, pinMessage, unpinMessage, getPinnedMessages } from "./messages-api";

const API_BASE = "http://localhost:3001/api/v1";
const author = { id: "u1", username: "alice", displayName: null, avatarUrl: null };

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
      const mock = { items: [{ id: "m1", channelId: "ch1", content: "hello", parentId: null, createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z", editedAt: null, author }], nextCursor: null, hasMore: false };
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mock), { status: 200 }));

      const result = await getMessages("token", "ws1", "ch1");

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/workspaces/ws1/channels/ch1/messages?limit=50`,
        expect.objectContaining({ method: "GET" }),
      );
      expect(result).toEqual(mock);
    });

    it("sends GET with cursor when provided", async () => {
      const mock = { items: [{ id: "m2", channelId: "ch1", content: "older", parentId: null, createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z", editedAt: null, author }], nextCursor: null, hasMore: false };
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mock), { status: 200 }));

      await getMessages("token", "ws1", "ch1", { cursor: "2024-01-01T00:00:00Z:m1" });

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/workspaces/ws1/channels/ch1/messages?limit=50&cursor=2024-01-01T00%3A00%3A00Z%3Am1`,
        expect.objectContaining({ method: "GET" }),
      );
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

  describe("presignAttachmentUpload", () => {
    it("sends POST to presign endpoint", async () => {
      const mock = {
        uploadUrl: "http://minio/upload",
        storageKey: "attachments/u1/uuid-file.png",
        fileName: "file.png",
        mimeType: "image/png",
        sizeBytes: 1234,
        kind: "image",
        expiresInSeconds: 300,
      };
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mock), { status: 201 }));

      const result = await presignAttachmentUpload("token", "ws1", "ch1", {
        filename: "file.png",
        mimeType: "image/png",
        sizeBytes: 1234,
      });

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/workspaces/ws1/channels/ch1/messages/attachments/presign`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ filename: "file.png", mimeType: "image/png", sizeBytes: 1234 }),
        }),
      );
      expect(result).toEqual(mock);
    });

    it("throws with backend error message", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ message: "Bad request" }), { status: 400 }));
      await expect(presignAttachmentUpload("token", "ws1", "ch1", { filename: "x", mimeType: "image/png", sizeBytes: 1 })).rejects.toThrow("Bad request");
    });
  });

  describe("uploadAttachmentToPresignedUrl", () => {
    it("sends PUT with file and Content-Type", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 200 }));
      const file = new File(["content"], "test.txt", { type: "text/plain" });

      await uploadAttachmentToPresignedUrl("http://minio/upload", file);

      expect(fetch).toHaveBeenCalledWith("http://minio/upload", expect.objectContaining({
        method: "PUT",
        headers: { "Content-Type": "text/plain" },
        body: file,
      }));
    });

    it("throws on non-2xx response", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 403, statusText: "Forbidden" }));
      const file = new File(["content"], "test.txt", { type: "text/plain" });

      await expect(uploadAttachmentToPresignedUrl("http://minio/upload", file)).rejects.toThrow("Upload failed: 403 Forbidden");
    });
  });

  describe("getAttachmentDownloadUrl", () => {
    it("sends GET to download-url endpoint", async () => {
      const mock = {
        downloadUrl: "http://minio/download",
        expiresInSeconds: 300,
        fileName: "doc.pdf",
        mimeType: "application/pdf",
        sizeBytes: 5678,
        kind: "file",
        createdAt: "2024-01-01T00:00:00Z",
      };
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mock), { status: 200 }));

      const result = await getAttachmentDownloadUrl("token", "ws1", "ch1", "m1", "a1");

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/workspaces/ws1/channels/ch1/messages/m1/attachments/a1/download-url`,
        expect.objectContaining({ method: "GET" }),
      );
      expect(result).toEqual(mock);
    });

    it("throws with backend error message", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ message: "Not found" }), { status: 404 }));
      await expect(getAttachmentDownloadUrl("token", "ws1", "ch1", "m1", "a1")).rejects.toThrow("Not found");
    });
  });

  describe("fetchAttachmentFile", () => {
    it("fetches file with Authorization header", async () => {
      const blob = new Blob(["image"], { type: "image/png" });
      const response = new Response(null, { status: 200 });
      response.blob = async () => blob;
      vi.mocked(fetch).mockResolvedValueOnce(response);

      const result = await fetchAttachmentFile("token", "ws1", "ch1", "m1", "a1");

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/workspaces/ws1/channels/ch1/messages/m1/attachments/a1/file`,
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({ Authorization: "Bearer token" }),
        }),
      );
      expect(result).toBeInstanceOf(Blob);
    });

    it("throws with backend error message", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ message: "Not found" }), { status: 404 }));
      await expect(fetchAttachmentFile("token", "ws1", "ch1", "m1", "a1")).rejects.toThrow("Not found");
    });
  });

  describe("getAttachmentFileObjectUrl", () => {
    it("returns a blob object URL", async () => {
      const blob = new Blob(["image"], { type: "image/png" });
      const response = new Response(null, { status: 200 });
      response.blob = async () => blob;
      vi.mocked(fetch).mockResolvedValueOnce(response);
      URL.createObjectURL = vi.fn(() => "blob:mock-url");

      const result = await getAttachmentFileObjectUrl("token", "ws1", "ch1", "m1", "a1");

      expect(result).toBe("blob:mock-url");
      expect(URL.createObjectURL).toHaveBeenCalled();
    });
  });

  describe("getMessageContext", () => {
    it("sends GET to context endpoint without query params", async () => {
      const mock = {
        target: { id: "m2", channelId: "ch1", content: "target", parentId: null, createdAt: "2024-01-01T00:00:02Z", updatedAt: "2024-01-01T00:00:02Z", editedAt: null, author },
        before: [{ id: "m1", channelId: "ch1", content: "before", parentId: null, createdAt: "2024-01-01T00:00:01Z", updatedAt: "2024-01-01T00:00:01Z", editedAt: null, author }],
        after: [],
        hasMoreBefore: false,
        hasMoreAfter: false,
      };
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mock), { status: 200 }));

      const result = await getMessageContext("token", "ws1", "ch1", "m2");

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/workspaces/ws1/channels/ch1/messages/m2/context`,
        expect.objectContaining({ method: "GET" }),
      );
      expect(result).toEqual(mock);
    });

    it("sends GET with before and after params", async () => {
      const mock = {
        target: { id: "m2", channelId: "ch1", content: "target", parentId: null, createdAt: "2024-01-01T00:00:02Z", updatedAt: "2024-01-01T00:00:02Z", editedAt: null, author },
        before: [],
        after: [{ id: "m3", channelId: "ch1", content: "after", parentId: null, createdAt: "2024-01-01T00:00:03Z", updatedAt: "2024-01-01T00:00:03Z", editedAt: null, author }],
        hasMoreBefore: false,
        hasMoreAfter: true,
      };
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mock), { status: 200 }));

      const result = await getMessageContext("token", "ws1", "ch1", "m2", { before: 5, after: 5 });

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/workspaces/ws1/channels/ch1/messages/m2/context?before=5&after=5`,
        expect.objectContaining({ method: "GET" }),
      );
      expect(result).toEqual(mock);
    });

    it("throws with backend error message", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ message: "Not found" }), { status: 404 }));
      await expect(getMessageContext("token", "ws1", "ch1", "m2")).rejects.toThrow("Not found");
    });
  });
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pinMessage", () => {
  it("sends POST to pin endpoint", async () => {
    const mock = {
      id: "pin1",
      pinnedAt: "2024-01-01T00:00:00Z",
      pinnedBy: { id: "u1", username: "alice", displayName: null },
      message: { id: "m1", content: "hello", createdAt: "2024-01-01T00:00:00Z", author, attachmentCount: 0, replyTo: null },
    };
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mock), { status: 201 }));

    const result = await pinMessage("token", "ws1", "ch1", "m1");

    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE}/workspaces/ws1/channels/ch1/messages/m1/pin`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(result).toEqual(mock);
  });

  it("throws with backend error message", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ message: "Forbidden" }), { status: 403 }));
    await expect(pinMessage("token", "ws1", "ch1", "m1")).rejects.toThrow("Forbidden");
  });
});

describe("unpinMessage", () => {
  it("sends DELETE to pin endpoint", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));

    await unpinMessage("token", "ws1", "ch1", "m1");

    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE}/workspaces/ws1/channels/ch1/messages/m1/pin`,
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("throws with backend error message", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ message: "Not found" }), { status: 404 }));
    await expect(unpinMessage("token", "ws1", "ch1", "m1")).rejects.toThrow("Not found");
  });
});

describe("getPinnedMessages", () => {
  it("sends GET to pins endpoint", async () => {
    const mock = {
      items: [
        {
          id: "pin1",
          pinnedAt: "2024-01-01T00:00:00Z",
          pinnedBy: { id: "u1", username: "alice", displayName: null },
          message: { id: "m1", content: "hello", createdAt: "2024-01-01T00:00:00Z", author, attachmentCount: 0, replyTo: null },
        },
      ],
      nextCursor: null,
      hasMore: false,
    };
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mock), { status: 200 }));

    const result = await getPinnedMessages("token", "ws1", "ch1");

    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE}/workspaces/ws1/channels/ch1/pins?limit=20`,
      expect.objectContaining({ method: "GET" }),
    );
    expect(result).toEqual(mock);
  });

  it("passes cursor and custom limit", async () => {
    const mock = { items: [], nextCursor: null, hasMore: false };
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(mock), { status: 200 }));

    await getPinnedMessages("token", "ws1", "ch1", { limit: 10, cursor: "abc" });

    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE}/workspaces/ws1/channels/ch1/pins?limit=10&cursor=abc`,
      expect.objectContaining({ method: "GET" }),
    );
  });
});
