import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import WorkspaceMessageSearch from "./WorkspaceMessageSearch";
import * as messagesApi from "@/lib/messages-api";

vi.mock("@/lib/messages-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/messages-api")>();
  return {
    ...actual,
    searchWorkspaceMessages: vi.fn(),
  };
});

describe("WorkspaceMessageSearch", () => {
  const props = {
    workspaceId: "ws-1",
    accessToken: "token",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders search toggle button", () => {
    render(<WorkspaceMessageSearch {...props} />);
    expect(screen.getByTestId("workspace-search-toggle")).toBeInTheDocument();
  });

  it("shows search panel when toggle clicked", () => {
    render(<WorkspaceMessageSearch {...props} />);
    fireEvent.click(screen.getByTestId("workspace-search-toggle"));
    expect(screen.getByTestId("workspace-search-input")).toBeInTheDocument();
  });

  it("does not call API for empty query on submit", () => {
    render(<WorkspaceMessageSearch {...props} />);
    fireEvent.click(screen.getByTestId("workspace-search-toggle"));
    fireEvent.click(screen.getByTestId("workspace-search-submit"));
    expect(messagesApi.searchWorkspaceMessages).not.toHaveBeenCalled();
  });

  it("calls search endpoint with correct params on submit", async () => {
    vi.mocked(messagesApi.searchWorkspaceMessages).mockResolvedValue([]);
    render(<WorkspaceMessageSearch {...props} />);
    fireEvent.click(screen.getByTestId("workspace-search-toggle"));
    fireEvent.change(screen.getByTestId("workspace-search-input"), { target: { value: "hello" } });
    fireEvent.click(screen.getByTestId("workspace-search-submit"));

    await waitFor(() => {
      expect(messagesApi.searchWorkspaceMessages).toHaveBeenCalledWith(
        "token",
        "ws-1",
        "hello",
        { limit: 20 },
      );
    });
  });

  it("renders results with author, channel and content", async () => {
    vi.mocked(messagesApi.searchWorkspaceMessages).mockResolvedValue([
      {
        id: "msg-1",
        content: "Hello world",
        createdAt: "2024-01-01T00:00:00.000Z",
        author: { id: "u1", username: "alice", displayName: "Alice", avatarUrl: null },
        channel: { id: "ch-1", name: "general", slug: "general" },
      },
    ]);
    render(<WorkspaceMessageSearch {...props} />);
    fireEvent.click(screen.getByTestId("workspace-search-toggle"));
    fireEvent.change(screen.getByTestId("workspace-search-input"), { target: { value: "hello" } });
    fireEvent.click(screen.getByTestId("workspace-search-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("workspace-search-result-msg-1")).toBeInTheDocument();
    });
    const result = screen.getByTestId("workspace-search-result-msg-1");
    expect(within(result).getByText("Alice")).toBeInTheDocument();
    expect(result.textContent).toContain("#general");
    expect(result.textContent).toContain("Hello world");
    expect(result.getAttribute("href")).toContain("/workspaces/ws-1/channels/ch-1?message=msg-1");
  });

  it("shows empty state when no results", async () => {
    vi.mocked(messagesApi.searchWorkspaceMessages).mockResolvedValue([]);
    render(<WorkspaceMessageSearch {...props} />);
    fireEvent.click(screen.getByTestId("workspace-search-toggle"));
    fireEvent.change(screen.getByTestId("workspace-search-input"), { target: { value: "xyz" } });
    fireEvent.click(screen.getByTestId("workspace-search-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("workspace-search-empty")).toBeInTheDocument();
    });
  });

  it("shows error message when search fails", async () => {
    vi.mocked(messagesApi.searchWorkspaceMessages).mockRejectedValue(new Error("Network error"));
    render(<WorkspaceMessageSearch {...props} />);
    fireEvent.click(screen.getByTestId("workspace-search-toggle"));
    fireEvent.change(screen.getByTestId("workspace-search-input"), { target: { value: "fail" } });
    fireEvent.click(screen.getByTestId("workspace-search-submit"));

    await waitFor(() => {
      expect(screen.getByText(/Network error/i)).toBeInTheDocument();
    });
  });
});
