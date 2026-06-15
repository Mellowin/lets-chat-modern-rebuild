import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GlobalMessageSearch from "./GlobalMessageSearch";
import { useAuth } from "@/lib/auth-context";
import { searchGlobalMessages } from "@/lib/messages-api";

vi.mock("@/lib/auth-context", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/lib/messages-api", () => ({
  searchGlobalMessages: vi.fn(),
}));

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

function mockAuth(overrides?: Partial<ReturnType<typeof useAuth>>) {
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    accessToken: "token",
    refreshToken: null,
    isLoading: false,
    isAuthenticated: true,
    loginSuccess: vi.fn(),
    setUser: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useAuth>);
}

function makeChannelResult(id: string, content: string) {
  return {
    id,
    content,
    createdAt: "2024-01-02T00:00:00Z",
    author: { id: "u1", username: "alice", displayName: "Alice", avatarUrl: null },
    source: {
      type: "CHANNEL" as const,
      workspaceId: "ws-1",
      workspaceName: "Workspace A",
      channelId: "ch-1",
      channelName: "general",
      channelSlug: "general",
    },
  };
}

function makeDirectResult(id: string, content: string) {
  return {
    id,
    content,
    createdAt: "2024-01-01T00:00:00Z",
    author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
    source: {
      type: "DIRECT" as const,
      conversationId: "conv-1",
      otherParticipant: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockAuth();
});

describe("GlobalMessageSearch", () => {
  it("renders open button", () => {
    render(<GlobalMessageSearch />);
    expect(screen.getByTestId("global-search-open-button")).toBeInTheDocument();
  });

  it("opens modal when button is clicked", async () => {
    render(<GlobalMessageSearch />);
    await userEvent.click(screen.getByTestId("global-search-open-button"));
    expect(screen.getByTestId("global-search-modal")).toBeInTheDocument();
    expect(screen.getByTestId("global-search-input")).toBeInTheDocument();
  });

  it("performs search and shows mixed results with source labels", async () => {
    vi.mocked(searchGlobalMessages).mockResolvedValueOnce({
      items: [makeChannelResult("msg-1", "куку"), makeDirectResult("dm-1", "привет")],
      nextCursor: null,
    });

    render(<GlobalMessageSearch />);
    await userEvent.click(screen.getByTestId("global-search-open-button"));
    await userEvent.type(screen.getByTestId("global-search-input"), "к");
    await userEvent.click(screen.getByTestId("global-search-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("global-search-result-msg-1")).toBeInTheDocument();
    });
    expect(screen.getByTestId("global-search-result-dm-1")).toBeInTheDocument();
    expect(screen.getByText("Workspace A / general")).toBeInTheDocument();
    expect(screen.getAllByText("Bob").length).toBeGreaterThanOrEqual(1);
  });

  it("navigates to channel message on channel result click", async () => {
    vi.mocked(searchGlobalMessages).mockResolvedValueOnce({
      items: [makeChannelResult("msg-1", "hello")],
      nextCursor: null,
    });

    render(<GlobalMessageSearch />);
    await userEvent.click(screen.getByTestId("global-search-open-button"));
    await userEvent.type(screen.getByTestId("global-search-input"), "hello");
    await userEvent.click(screen.getByTestId("global-search-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("global-search-result-msg-1")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("global-search-result-msg-1"));

    expect(mockPush).toHaveBeenCalledWith("/workspaces/ws-1/channels/ch-1?message=msg-1");
  });

  it("navigates to DM on direct result click", async () => {
    vi.mocked(searchGlobalMessages).mockResolvedValueOnce({
      items: [makeDirectResult("dm-1", "hello")],
      nextCursor: null,
    });

    render(<GlobalMessageSearch />);
    await userEvent.click(screen.getByTestId("global-search-open-button"));
    await userEvent.type(screen.getByTestId("global-search-input"), "hello");
    await userEvent.click(screen.getByTestId("global-search-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("global-search-result-dm-1")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("global-search-result-dm-1"));

    expect(mockPush).toHaveBeenCalledWith("/direct/conv-1?message=dm-1");
  });

  it("shows empty state when no results", async () => {
    vi.mocked(searchGlobalMessages).mockResolvedValueOnce({ items: [], nextCursor: null });

    render(<GlobalMessageSearch />);
    await userEvent.click(screen.getByTestId("global-search-open-button"));
    await userEvent.type(screen.getByTestId("global-search-input"), "zzz");
    await userEvent.click(screen.getByTestId("global-search-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("global-search-empty")).toBeInTheDocument();
    });
  });

  it("shows error state on search failure", async () => {
    vi.mocked(searchGlobalMessages).mockRejectedValueOnce(new Error("Server error"));

    render(<GlobalMessageSearch />);
    await userEvent.click(screen.getByTestId("global-search-open-button"));
    await userEvent.type(screen.getByTestId("global-search-input"), "test");
    await userEvent.click(screen.getByTestId("global-search-submit"));

    await waitFor(() => {
      expect(screen.getByText(/Server error/i)).toBeInTheDocument();
    });
  });

  it("loads more results when load more is clicked", async () => {
    vi.mocked(searchGlobalMessages)
      .mockResolvedValueOnce({
        items: [makeChannelResult("msg-1", "hello")],
        nextCursor: "cursor-1",
      })
      .mockResolvedValueOnce({
        items: [makeChannelResult("msg-2", "hello again")],
        nextCursor: null,
      });

    render(<GlobalMessageSearch />);
    await userEvent.click(screen.getByTestId("global-search-open-button"));
    await userEvent.type(screen.getByTestId("global-search-input"), "hello");
    await userEvent.click(screen.getByTestId("global-search-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("global-search-result-msg-1")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("global-search-load-more"));

    await waitFor(() => {
      expect(screen.getByTestId("global-search-result-msg-2")).toBeInTheDocument();
    });
    expect(searchGlobalMessages).toHaveBeenLastCalledWith("token", "hello", {
      cursor: "cursor-1",
      limit: 20,
    });
  });
});
