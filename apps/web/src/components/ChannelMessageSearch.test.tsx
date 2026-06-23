import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ChannelMessageSearch from "./ChannelMessageSearch";
import * as messagesApi from "@/lib/messages-api";

vi.mock("@/lib/messages-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/messages-api")>();
  return {
    ...actual,
    searchChannelMessages: vi.fn(),
    getMessageContext: vi.fn(),
  };
});

describe("ChannelMessageSearch", () => {
  const props = {
    workspaceId: "ws-1",
    channelId: "ch-1",
    accessToken: "token",
    onJumpToMessage: vi.fn(() => true),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders search toggle button", () => {
    render(<ChannelMessageSearch {...props} />);
    expect(screen.getByTestId("search-toggle-button")).toBeInTheDocument();
  });

  it("shows search panel when toggle clicked", () => {
    render(<ChannelMessageSearch {...props} />);
    fireEvent.click(screen.getByTestId("search-toggle-button"));
    expect(screen.getByTestId("search-input")).toBeInTheDocument();
  });

  it("does not call API for empty query on submit", () => {
    render(<ChannelMessageSearch {...props} />);
    fireEvent.click(screen.getByTestId("search-toggle-button"));
    fireEvent.click(screen.getByTestId("search-submit"));
    expect(messagesApi.searchChannelMessages).not.toHaveBeenCalled();
  });

  it("calls search endpoint with correct params on submit", async () => {
    vi.mocked(messagesApi.searchChannelMessages).mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    render(<ChannelMessageSearch {...props} />);
    fireEvent.click(screen.getByTestId("search-toggle-button"));
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "hello" } });
    fireEvent.click(screen.getByTestId("search-submit"));

    await waitFor(() => {
      expect(messagesApi.searchChannelMessages).toHaveBeenCalledWith(
        "token",
        "ws-1",
        "ch-1",
        "hello",
        { limit: 20 },
      );
    });
  });

  it("shows loading state while searching", async () => {
    vi.mocked(messagesApi.searchChannelMessages).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ items: [], nextCursor: null }), 50)),
    );
    render(<ChannelMessageSearch {...props} />);
    fireEvent.click(screen.getByTestId("search-toggle-button"));
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "test" } });
    fireEvent.click(screen.getByTestId("search-submit"));

    expect(screen.getByTestId("search-submit")).toHaveTextContent("Searching…");
    await waitFor(() => expect(screen.getByTestId("search-submit")).not.toHaveTextContent("Searching…"));
  });

  it("renders results with author and content", async () => {
    vi.mocked(messagesApi.searchChannelMessages).mockResolvedValue({
      items: [
        {
          id: "msg-1",
          channelId: "ch-1",
          content: "Hello world",
          parentId: null,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
          editedAt: null,
          author: { id: "u1", username: "alice", displayName: "Alice", avatarUrl: null },
          reactions: [],
          attachments: [],
        },
      ],
      nextCursor: null,
    });
    render(<ChannelMessageSearch {...props} />);
    fireEvent.click(screen.getByTestId("search-toggle-button"));
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "hello" } });
    fireEvent.click(screen.getByTestId("search-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("search-result-msg-1")).toBeInTheDocument();
    });
    const result = screen.getByTestId("search-result-msg-1");
    expect(within(result).getByText("Alice")).toBeInTheDocument();
    expect(result.textContent).toContain("Hello");
    expect(result.textContent).toContain("world");
  });

  it("shows empty state when no results", async () => {
    vi.mocked(messagesApi.searchChannelMessages).mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    render(<ChannelMessageSearch {...props} />);
    fireEvent.click(screen.getByTestId("search-toggle-button"));
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "xyz" } });
    fireEvent.click(screen.getByTestId("search-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("search-empty")).toBeInTheDocument();
    });
  });

  it("shows error state on API failure", async () => {
    vi.mocked(messagesApi.searchChannelMessages).mockRejectedValue(new Error("Network error"));
    render(<ChannelMessageSearch {...props} />);
    fireEvent.click(screen.getByTestId("search-toggle-button"));
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "fail" } });
    fireEvent.click(screen.getByTestId("search-submit"));

    await waitFor(() => {
      expect(screen.getByText("Search failed")).toBeInTheDocument();
    });
  });

  it("calls load more with cursor", async () => {
    vi.mocked(messagesApi.searchChannelMessages)
      .mockResolvedValueOnce({
        items: [
          {
            id: "msg-1",
            channelId: "ch-1",
            content: "first",
            parentId: null,
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z",
            editedAt: null,
            author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
            reactions: [],
            attachments: [],
          },
        ],
        nextCursor: "cursor-1",
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: "msg-2",
            channelId: "ch-1",
            content: "second",
            parentId: null,
            createdAt: "2024-01-02T00:00:00.000Z",
            updatedAt: "2024-01-02T00:00:00.000Z",
            editedAt: null,
            author: { id: "u2", username: "bob", displayName: null, avatarUrl: null },
            reactions: [],
            attachments: [],
          },
        ],
        nextCursor: null,
      });

    render(<ChannelMessageSearch {...props} />);
    fireEvent.click(screen.getByTestId("search-toggle-button"));
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "test" } });
    fireEvent.click(screen.getByTestId("search-submit"));

    await waitFor(() => expect(screen.getByTestId("search-load-more")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("search-load-more"));

    await waitFor(() => {
      expect(messagesApi.searchChannelMessages).toHaveBeenLastCalledWith(
        "token",
        "ws-1",
        "ch-1",
        "test",
        { cursor: "cursor-1", limit: 20 },
      );
    });
  });

  it("prevents duplicate load-more clicks while loading", async () => {
    vi.mocked(messagesApi.searchChannelMessages).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ items: [], nextCursor: "c1" }), 100)),
    );
    render(<ChannelMessageSearch {...props} />);
    fireEvent.click(screen.getByTestId("search-toggle-button"));
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "test" } });
    fireEvent.click(screen.getByTestId("search-submit"));

    await waitFor(() => expect(screen.getByTestId("search-load-more")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("search-load-more"));
    fireEvent.click(screen.getByTestId("search-load-more"));

    await waitFor(() => expect(messagesApi.searchChannelMessages).toHaveBeenCalledTimes(2));
  });

  it("renders attachment indicator when result has attachments", async () => {
    vi.mocked(messagesApi.searchChannelMessages).mockResolvedValue({
      items: [
        {
          id: "msg-1",
          channelId: "ch-1",
          content: "with file",
          parentId: null,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
          editedAt: null,
          author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
          reactions: [],
          attachments: [
            { id: "a1", fileName: "doc.pdf", mimeType: "application/pdf", sizeBytes: 1234, kind: "file", createdAt: "2024-01-01T00:00:00.000Z" },
          ],
        },
      ],
      nextCursor: null,
    });
    render(<ChannelMessageSearch {...props} />);
    fireEvent.click(screen.getByTestId("search-toggle-button"));
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "file" } });
    fireEvent.click(screen.getByTestId("search-submit"));

    await waitFor(() => {
      expect(screen.getByText(/📎 1/)).toBeInTheDocument();
    });
  });

  it("calls onJumpToMessage when result clicked", async () => {
    vi.mocked(messagesApi.searchChannelMessages).mockResolvedValue({
      items: [
        {
          id: "msg-1",
          channelId: "ch-1",
          content: "hello",
          parentId: null,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
          editedAt: null,
          author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
          reactions: [],
          attachments: [],
        },
      ],
      nextCursor: null,
    });
    render(<ChannelMessageSearch {...props} />);
    fireEvent.click(screen.getByTestId("search-toggle-button"));
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "hello" } });
    fireEvent.click(screen.getByTestId("search-submit"));

    await waitFor(() => expect(screen.getByTestId("search-result-msg-1")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("search-result-msg-1"));
    expect(props.onJumpToMessage).toHaveBeenCalledWith("msg-1");
  });

  it("highlights single match in snippet", async () => {
    vi.mocked(messagesApi.searchChannelMessages).mockResolvedValue({
      items: [
        {
          id: "msg-1",
          channelId: "ch-1",
          content: "Hello world",
          parentId: null,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
          editedAt: null,
          author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
          reactions: [],
          attachments: [],
        },
      ],
      nextCursor: null,
    });
    render(<ChannelMessageSearch {...props} />);
    fireEvent.click(screen.getByTestId("search-toggle-button"));
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "world" } });
    fireEvent.click(screen.getByTestId("search-submit"));

    await waitFor(() => expect(screen.getByTestId("search-result-msg-1")).toBeInTheDocument());
    const result = screen.getByTestId("search-result-msg-1");
    expect(result.querySelector("mark")).toBeInTheDocument();
    expect(result.querySelector("mark")).toHaveTextContent("world");
  });

  it("highlights multiple matches", async () => {
    vi.mocked(messagesApi.searchChannelMessages).mockResolvedValue({
      items: [
        {
          id: "msg-1",
          channelId: "ch-1",
          content: "test test test",
          parentId: null,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
          editedAt: null,
          author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
          reactions: [],
          attachments: [],
        },
      ],
      nextCursor: null,
    });
    render(<ChannelMessageSearch {...props} />);
    fireEvent.click(screen.getByTestId("search-toggle-button"));
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "test" } });
    fireEvent.click(screen.getByTestId("search-submit"));

    await waitFor(() => expect(screen.getByTestId("search-result-msg-1")).toBeInTheDocument());
    const marks = screen.getByTestId("search-result-msg-1").querySelectorAll("mark");
    expect(marks.length).toBe(3);
  });

  it("highlight is case-insensitive", async () => {
    vi.mocked(messagesApi.searchChannelMessages).mockResolvedValue({
      items: [
        {
          id: "msg-1",
          channelId: "ch-1",
          content: "HELLO there",
          parentId: null,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
          editedAt: null,
          author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
          reactions: [],
          attachments: [],
        },
      ],
      nextCursor: null,
    });
    render(<ChannelMessageSearch {...props} />);
    fireEvent.click(screen.getByTestId("search-toggle-button"));
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "hello" } });
    fireEvent.click(screen.getByTestId("search-submit"));

    await waitFor(() => expect(screen.getByTestId("search-result-msg-1")).toBeInTheDocument());
    const mark = screen.getByTestId("search-result-msg-1").querySelector("mark");
    expect(mark).toHaveTextContent("HELLO");
  });

  it("does not crash on query with special regex characters", async () => {
    vi.mocked(messagesApi.searchChannelMessages).mockResolvedValue({
      items: [
        {
          id: "msg-1",
          channelId: "ch-1",
          content: "price is $5.00 [special]",
          parentId: null,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
          editedAt: null,
          author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
          reactions: [],
          attachments: [],
        },
      ],
      nextCursor: null,
    });
    render(<ChannelMessageSearch {...props} />);
    fireEvent.click(screen.getByTestId("search-toggle-button"));
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "$5.00 [" } });
    fireEvent.click(screen.getByTestId("search-submit"));

    await waitFor(() => expect(screen.getByTestId("search-result-msg-1")).toBeInTheDocument());
    expect(screen.getByText(/price is/)).toBeInTheDocument();
  });

  it("shows attachment fallback text for empty content with attachments", async () => {
    vi.mocked(messagesApi.searchChannelMessages).mockResolvedValue({
      items: [
        {
          id: "msg-1",
          channelId: "ch-1",
          content: "",
          parentId: null,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
          editedAt: null,
          author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
          reactions: [],
          attachments: [
            { id: "a1", fileName: "doc.pdf", mimeType: "application/pdf", sizeBytes: 1234, kind: "file", createdAt: "2024-01-01T00:00:00.000Z" },
          ],
        },
      ],
      nextCursor: null,
    });
    render(<ChannelMessageSearch {...props} />);
    fireEvent.click(screen.getByTestId("search-toggle-button"));
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "file" } });
    fireEvent.click(screen.getByTestId("search-submit"));

    await waitFor(() => expect(screen.getByTestId("search-result-msg-1")).toBeInTheDocument());
    expect(screen.getByText("Attachment message")).toBeInTheDocument();
  });

  it("does not show not-loaded warning when jump succeeds", async () => {
    vi.mocked(messagesApi.searchChannelMessages).mockResolvedValue({
      items: [
        {
          id: "msg-1",
          channelId: "ch-1",
          content: "hello",
          parentId: null,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
          editedAt: null,
          author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
          reactions: [],
          attachments: [],
        },
      ],
      nextCursor: null,
    });
    render(<ChannelMessageSearch {...props} />);
    fireEvent.click(screen.getByTestId("search-toggle-button"));
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "hello" } });
    fireEvent.click(screen.getByTestId("search-submit"));

    await waitFor(() => expect(screen.getByTestId("search-result-msg-1")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("search-result-msg-1"));
    expect(screen.queryByTestId("search-not-loaded-msg-1")).not.toBeInTheDocument();
  });

  it("shows not-loaded warning when jump returns false and no onLoadContext", async () => {
    const unloadedProps = { ...props, onJumpToMessage: vi.fn(() => false) };
    vi.mocked(messagesApi.searchChannelMessages).mockResolvedValue({
      items: [
        {
          id: "msg-1",
          channelId: "ch-1",
          content: "hello",
          parentId: null,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
          editedAt: null,
          author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
          reactions: [],
          attachments: [],
        },
      ],
      nextCursor: null,
    });
    render(<ChannelMessageSearch {...unloadedProps} />);
    fireEvent.click(screen.getByTestId("search-toggle-button"));
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "hello" } });
    fireEvent.click(screen.getByTestId("search-submit"));

    await waitFor(() => expect(screen.getByTestId("search-result-msg-1")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("search-result-msg-1"));
    expect(screen.getByTestId("search-not-loaded-msg-1")).toBeInTheDocument();
  });

  it("calls getMessageContext and onLoadContext when jump returns false", async () => {
    const onLoadContext = vi.fn();
    const unloadedProps = { ...props, onJumpToMessage: vi.fn(() => false), onLoadContext };
    const contextResult = {
      target: { id: "msg-1", channelId: "ch-1", content: "hello", parentId: null, createdAt: "2024-01-01T00:00:00.000Z", updatedAt: "2024-01-01T00:00:00.000Z", editedAt: null, author: { id: "u1", username: "alice", displayName: null, avatarUrl: null }, reactions: [], attachments: [] },
      before: [],
      after: [],
      hasMoreBefore: false,
      hasMoreAfter: false,
    };
    vi.mocked(messagesApi.searchChannelMessages).mockResolvedValue({
      items: [contextResult.target],
      nextCursor: null,
    });
    vi.mocked(messagesApi.getMessageContext).mockResolvedValue(contextResult);

    render(<ChannelMessageSearch {...unloadedProps} />);
    fireEvent.click(screen.getByTestId("search-toggle-button"));
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "hello" } });
    fireEvent.click(screen.getByTestId("search-submit"));

    await waitFor(() => expect(screen.getByTestId("search-result-msg-1")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("search-result-msg-1"));

    await waitFor(() => {
      expect(messagesApi.getMessageContext).toHaveBeenCalledWith("token", "ws-1", "ch-1", "msg-1");
    });
    expect(onLoadContext).toHaveBeenCalledWith(expect.objectContaining({ targetId: "msg-1" }));
    expect(screen.queryByTestId("search-not-loaded-msg-1")).not.toBeInTheDocument();
  });

  it("shows context load error when getMessageContext fails", async () => {
    const onLoadContext = vi.fn();
    const unloadedProps = { ...props, onJumpToMessage: vi.fn(() => false), onLoadContext };
    vi.mocked(messagesApi.searchChannelMessages).mockResolvedValue({
      items: [
        {
          id: "msg-1",
          channelId: "ch-1",
          content: "hello",
          parentId: null,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
          editedAt: null,
          author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
          reactions: [],
          attachments: [],
        },
      ],
      nextCursor: null,
    });
    vi.mocked(messagesApi.getMessageContext).mockRejectedValue(new Error("Network error"));

    render(<ChannelMessageSearch {...unloadedProps} />);
    fireEvent.click(screen.getByTestId("search-toggle-button"));
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "hello" } });
    fireEvent.click(screen.getByTestId("search-submit"));

    await waitFor(() => expect(screen.getByTestId("search-result-msg-1")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("search-result-msg-1"));

    await waitFor(() => {
      expect(screen.getByTestId("search-context-error-msg-1")).toBeInTheDocument();
    });
    expect(onLoadContext).not.toHaveBeenCalled();
  });
});
