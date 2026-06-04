import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import Sidebar from "./Sidebar";
import { useAuth } from "@/lib/auth-context";
import { usePathname } from "next/navigation";
import { getWorkspaces } from "@/lib/workspaces-api";
import { getChannels } from "@/lib/channels-api";
import { listDirectConversations } from "@/lib/direct-conversations-api";
import { createWorkspace, createChannel } from "@/test/factories";
import { createSocketMock } from "@/test/socket-mock";

const { socketHandlers, socketOnMock, socketOffMock, socketDisconnectMock, clearSocketHandlers } =
  createSocketMock();

function makeMockSocket() {
  return {
    on: socketOnMock,
    off: socketOffMock,
    disconnect: socketDisconnectMock,
  };
}

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/dashboard"),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/lib/workspaces-api", () => ({
  getWorkspaces: vi.fn(),
}));

vi.mock("@/lib/channels-api", () => ({
  getChannels: vi.fn(),
}));

vi.mock("@/lib/direct-conversations-api", () => ({
  listDirectConversations: vi.fn(),
}));

vi.mock("@/lib/socket-client", () => ({
  createSocket: vi.fn(() => makeMockSocket()),
}));

function mockAuth(userOverrides?: Partial<ReturnType<typeof useAuth>>) {
  vi.mocked(useAuth).mockReturnValue({
    user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: null, avatarUpdatedAt: null, interfaceLanguage: "en" as const, createdAt: "2024-01-01T00:00:00Z" },
    accessToken: "token",
    refreshToken: "rt",
    isLoading: false,
    isAuthenticated: true,
    loginSuccess: vi.fn(),
    setUser: vi.fn(),
    logout: vi.fn(),
    ...userOverrides,
  } as ReturnType<typeof useAuth>);
}

const workspacesData = [
  createWorkspace({ id: "ws1", name: "Testing place", slug: "testing" }),
  createWorkspace({ id: "ws2", name: "Another workspace", slug: "another" }),
];

const channelsWs1 = [
  createChannel({ id: "ch1", name: "Boboski", workspaceId: "ws1", type: "PUBLIC" as const }),
  createChannel({ id: "ch2", name: "ПОПА", workspaceId: "ws1", type: "PRIVATE" as const }),
];

const channelsWs2 = [
  createChannel({ id: "ch3", name: "general", workspaceId: "ws2", type: "PUBLIC" as const }),
];

const directConversationsData = [
  {
    id: "dc1",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    otherParticipant: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
    lastMessage: { id: "dm1", content: "Hey", createdAt: "2024-01-01T00:00:00Z", authorId: "u2" },
    unreadCount: 3,
    isOnline: true,
  },
  {
    id: "dc2",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    otherParticipant: { id: "u3", username: "charlie", displayName: null, avatarUrl: null },
    lastMessage: null,
    unreadCount: 0,
    isOnline: false,
  },
];

function setupDefaultMocks(pathname = "/dashboard") {
  mockAuth();
  vi.mocked(usePathname).mockReturnValue(pathname);
  vi.mocked(getWorkspaces).mockResolvedValue(workspacesData);
  vi.mocked(getChannels).mockImplementation(async (_token, wsId) => {
    if (wsId === "ws1") return channelsWs1;
    if (wsId === "ws2") return channelsWs2;
    return [];
  });
  vi.mocked(listDirectConversations).mockResolvedValue(directConversationsData);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  clearSocketHandlers();
});

describe("Sidebar — structure", () => {
  it("renders Direct section above Workspaces", async () => {
    setupDefaultMocks();
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText("Testing place")).toBeInTheDocument();
    });
    const directSection = screen.getByTestId("sidebar-direct-section");
    const workspacesSection = screen.getByTestId("sidebar-workspaces-section");
    expect(directSection.compareDocumentPosition(workspacesSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("does not render a detached global Channels section", async () => {
    setupDefaultMocks("/workspaces/ws1/channels/ch1");
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText(/Boboski/)).toBeInTheDocument();
    });
    const sectionHeaders = screen.queryAllByText(/Channels/i);
    // "Channels" should only appear as nested inside workspace, not as top-level section header
    // In the new design there is no top-level "Channels" text at all
    expect(sectionHeaders.length).toBe(0);
  });
});

describe("Sidebar — Direct section", () => {
  it("shows Direct link inside Direct section", async () => {
    setupDefaultMocks();
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByTestId("sidebar-direct-link")).toBeInTheDocument();
    });
    expect(screen.getByTestId("sidebar-direct-link")).toHaveAttribute("href", "/direct");
  });

  it("shows direct conversations under Direct section", async () => {
    setupDefaultMocks();
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByTestId("sidebar-direct-conversation-link-dc1")).toBeInTheDocument();
    });
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-direct-conversation-link-dc2")).toHaveAttribute("href", "/direct/dc2");
  });

  it("highlights active direct conversation", async () => {
    setupDefaultMocks("/direct/dc1");
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByTestId("sidebar-direct-conversation-link-dc1")).toBeInTheDocument();
    });
    expect(screen.getByTestId("sidebar-direct-conversation-link-dc1")).toHaveClass("bg-zinc-200");
  });

  it("shows total unread badge on Direct messages link", async () => {
    setupDefaultMocks();
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByTestId("sidebar-direct-unread-badge")).toBeInTheDocument();
    });
  });

  it("does not show 0 badge when unread is 0", async () => {
    setupDefaultMocks();
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText("Direct messages")).toBeInTheDocument();
    });
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("collapses and expands Direct section", async () => {
    setupDefaultMocks();
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText("Direct messages")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("sidebar-direct-toggle"));
    expect(screen.queryByText("Direct messages")).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId("sidebar-direct-toggle"));
    expect(screen.getByText("Direct messages")).toBeInTheDocument();
  });

  it("persists Direct collapsed state via localStorage", async () => {
    setupDefaultMocks();
    const { unmount } = render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText("Direct messages")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("sidebar-direct-toggle"));
    unmount();
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText("Workspaces")).toBeInTheDocument();
    });
    expect(screen.queryByText("Direct messages")).not.toBeInTheDocument();
  });
});

describe("Sidebar — Workspaces section", () => {
  it("lists workspaces", async () => {
    setupDefaultMocks();
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText("Testing place")).toBeInTheDocument();
    });
    expect(screen.getByText("Another workspace")).toBeInTheDocument();
  });

  it("expands active workspace by default and shows its channels", async () => {
    setupDefaultMocks("/workspaces/ws1/channels/ch1");
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText(/Boboski/)).toBeInTheDocument();
    });
    expect(screen.getByTestId("sidebar-workspace-channels-ws1")).toBeInTheDocument();
    expect(screen.getByText(/ПОПА/)).toBeInTheDocument();
  });

  it("highlights active channel", async () => {
    setupDefaultMocks("/workspaces/ws1/channels/ch1");
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByTestId("sidebar-channel-link-ch1")).toBeInTheDocument();
    });
    expect(screen.getByTestId("sidebar-channel-link-ch1")).toHaveClass("bg-zinc-200");
  });

  it("nests channels under their workspace", async () => {
    setupDefaultMocks("/workspaces/ws1/channels/ch1");
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText(/Boboski/)).toBeInTheDocument();
    });
    const wsChannels = screen.getByTestId("sidebar-workspace-channels-ws1");
    expect(wsChannels).toBeInTheDocument();
    expect(wsChannels.textContent).toContain("Boboski");
    expect(wsChannels.textContent).toContain("ПОПА");
  });

  it("toggles workspace channels on click", async () => {
    setupDefaultMocks("/workspaces/ws1/channels/ch1");
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText(/Boboski/)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("sidebar-workspace-toggle-ws1"));
    expect(screen.queryByTestId("sidebar-workspace-channels-ws1")).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId("sidebar-workspace-toggle-ws1"));
    expect(screen.getByTestId("sidebar-workspace-channels-ws1")).toBeInTheDocument();
  });

  it("workspace overview link is reachable", async () => {
    setupDefaultMocks("/workspaces/ws1/channels/ch1");
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText("Overview")).toBeInTheDocument();
    });
    const overviewLink = screen.getByText("Overview").closest("a");
    expect(overviewLink).toHaveAttribute("href", "/workspaces/ws1");
  });

  it("channel links have correct href", async () => {
    setupDefaultMocks("/workspaces/ws1/channels/ch1");
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByTestId("sidebar-channel-link-ch1")).toBeInTheDocument();
    });
    expect(screen.getByTestId("sidebar-channel-link-ch1")).toHaveAttribute("href", "/workspaces/ws1/channels/ch1");
    expect(screen.getByTestId("sidebar-channel-link-ch2")).toHaveAttribute("href", "/workspaces/ws1/channels/ch2");
  });

  it("loads channels on demand when expanding non-active workspace", async () => {
    setupDefaultMocks("/workspaces/ws1/channels/ch1");
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText(/Boboski/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/general/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId("sidebar-workspace-toggle-ws2"));
    await waitFor(() => {
      expect(screen.getByText(/general/)).toBeInTheDocument();
    });
    expect(screen.getByTestId("sidebar-channel-link-ch3")).toHaveAttribute("href", "/workspaces/ws2/channels/ch3");
  });

  it("persists workspace expanded state via localStorage", async () => {
    setupDefaultMocks("/workspaces/ws1/channels/ch1");
    const { unmount } = render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText(/Boboski/)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("sidebar-workspace-toggle-ws2"));
    await waitFor(() => {
      expect(screen.getByText(/general/)).toBeInTheDocument();
    });
    unmount();
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText("Testing place")).toBeInTheDocument();
    });
    expect(screen.getByTestId("sidebar-workspace-channels-ws2")).toBeInTheDocument();
  });

  it("collapses Workspaces section", async () => {
    setupDefaultMocks();
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText("Testing place")).toBeInTheDocument();
    });
    const workspacesToggle = screen.getByText("Workspaces").closest("button");
    await userEvent.click(workspacesToggle!);
    expect(screen.queryByText("Testing place")).not.toBeInTheDocument();
  });
});

describe("Sidebar — events and refresh", () => {
  it("reloads active workspace channels on channels:changed event", async () => {
    setupDefaultMocks("/workspaces/ws1/channels/ch1");
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText(/Boboski/)).toBeInTheDocument();
    });
    vi.mocked(getChannels).mockClear();
    fireEvent(window, new CustomEvent("channels:changed"));
    await waitFor(() => {
      expect(getChannels).toHaveBeenCalledWith("token", "ws1");
    });
  });

  it("reloads direct conversations on direct:conversation:updated socket event", async () => {
    setupDefaultMocks();
    vi.mocked(listDirectConversations)
      .mockResolvedValueOnce(directConversationsData)
      .mockResolvedValueOnce([
        {
          ...directConversationsData[0],
          unreadCount: 5,
        },
        directConversationsData[1],
      ]);

    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByTestId("sidebar-direct-unread-badge")).toBeInTheDocument();
    });

    const handler = socketHandlers["direct:conversation:updated"];
    handler({ id: "dm2", conversationId: "dc1", content: "New", parentId: null, createdAt: "2024-01-02T00:00:00Z", updatedAt: "2024-01-02T00:00:00Z", editedAt: null, author: { id: "u2", username: "bob", displayName: null, avatarUrl: null }, parent: null });

    await waitFor(() => {
      expect(listDirectConversations).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByTestId("sidebar-direct-unread-badge")).toHaveTextContent("5");
  });

  it("reloads workspaces on workspaces:changed event", async () => {
    setupDefaultMocks();
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText("Testing place")).toBeInTheDocument();
    });
    vi.mocked(getWorkspaces).mockClear();
    fireEvent(window, new CustomEvent("workspaces:changed"));
    await waitFor(() => {
      expect(getWorkspaces).toHaveBeenCalledTimes(1);
    });
  });

  it("direct conversations do not render under Workspaces", async () => {
    setupDefaultMocks();
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });
    const workspacesSection = screen.getByTestId("sidebar-workspaces-section");
    expect(workspacesSection.textContent).not.toContain("Bob");
  });
});

describe("Sidebar — socket cleanup", () => {
  it("cleans up socket listener on unmount", async () => {
    setupDefaultMocks();
    vi.mocked(listDirectConversations).mockResolvedValue([]);
    const { unmount } = render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText("Direct messages")).toBeInTheDocument();
    });
    unmount();
    expect(socketOffMock).toHaveBeenCalledWith("direct:conversation:updated", expect.any(Function));
    expect(socketOffMock).toHaveBeenCalledWith("presence:online", expect.any(Function));
    expect(socketOffMock).toHaveBeenCalledWith("presence:offline", expect.any(Function));
    expect(socketDisconnectMock).toHaveBeenCalled();
  });
});

describe("Sidebar — presence updates", () => {
  it("updates online dot when presence:online is received", async () => {
    setupDefaultMocks();
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByTestId("sidebar-direct-conversation-link-dc2")).toBeInTheDocument();
    });
    const dot = screen.getByTestId("sidebar-direct-presence-dot-dc2");
    expect(dot).toHaveClass("bg-zinc-300");
    const handler = socketHandlers["presence:online"];
    handler({ user: { id: "u3", username: "charlie" }, status: "online" });
    await waitFor(() => {
      expect(screen.getByTestId("sidebar-direct-presence-dot-dc2")).toHaveClass("bg-emerald-500");
    });
  });

  it("updates offline dot when presence:offline is received", async () => {
    setupDefaultMocks();
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByTestId("sidebar-direct-conversation-link-dc1")).toBeInTheDocument();
    });
    const dot = screen.getByTestId("sidebar-direct-presence-dot-dc1");
    expect(dot).toHaveClass("bg-emerald-500");
    const handler = socketHandlers["presence:offline"];
    handler({ user: { id: "u2", username: "bob" }, status: "offline" });
    await waitFor(() => {
      expect(screen.getByTestId("sidebar-direct-presence-dot-dc1")).toHaveClass("bg-zinc-300");
    });
  });

  it("presence update does not change unreadCount", async () => {
    setupDefaultMocks();
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByTestId("sidebar-direct-unread-badge")).toBeInTheDocument();
    });
    expect(screen.getByTestId("sidebar-direct-unread-badge")).toHaveTextContent("3");
    const handler = socketHandlers["presence:online"];
    handler({ user: { id: "u3", username: "charlie" }, status: "online" });
    await waitFor(() => {
      expect(screen.getByTestId("sidebar-direct-presence-dot-dc2")).toHaveClass("bg-emerald-500");
    });
    expect(screen.getByTestId("sidebar-direct-unread-badge")).toHaveTextContent("3");
  });

  it("presence update does not reorder direct conversations", async () => {
    setupDefaultMocks();
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByTestId("sidebar-direct-conversation-link-dc1")).toBeInTheDocument();
    });
    const before = screen.getAllByTestId(/sidebar-direct-conversation-link-dc\d/).map((el) => el.getAttribute("data-testid"));
    const handler = socketHandlers["presence:offline"];
    handler({ user: { id: "u2", username: "bob" }, status: "offline" });
    await waitFor(() => {
      expect(screen.getByTestId("sidebar-direct-presence-dot-dc1")).toHaveClass("bg-zinc-300");
    });
    const after = screen.getAllByTestId(/sidebar-direct-conversation-link-dc\d/).map((el) => el.getAttribute("data-testid"));
    expect(after).toEqual(before);
  });

  it("presence update does not remove active direct conversation highlight", async () => {
    setupDefaultMocks("/direct/dc1");
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByTestId("sidebar-direct-conversation-link-dc1")).toBeInTheDocument();
    });
    expect(screen.getByTestId("sidebar-direct-conversation-link-dc1")).toHaveClass("bg-zinc-200");
    const handler = socketHandlers["presence:online"];
    handler({ user: { id: "u3", username: "charlie" }, status: "online" });
    await waitFor(() => {
      expect(screen.getByTestId("sidebar-direct-presence-dot-dc2")).toHaveClass("bg-emerald-500");
    });
    expect(screen.getByTestId("sidebar-direct-conversation-link-dc1")).toHaveClass("bg-zinc-200");
  });

  it("presence event for unrelated user does not change existing conversations", async () => {
    setupDefaultMocks();
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByTestId("sidebar-direct-conversation-link-dc1")).toBeInTheDocument();
    });
    const dot1 = screen.getByTestId("sidebar-direct-presence-dot-dc1");
    const dot2 = screen.getByTestId("sidebar-direct-presence-dot-dc2");
    expect(dot1).toHaveClass("bg-emerald-500");
    expect(dot2).toHaveClass("bg-zinc-300");
    const handler = socketHandlers["presence:online"];
    handler({ user: { id: "u99", username: "stranger" }, status: "online" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(dot1).toHaveClass("bg-emerald-500");
    expect(dot2).toHaveClass("bg-zinc-300");
  });
});

describe("Sidebar — section order", () => {
  it("default order is Direct before Workspaces", async () => {
    setupDefaultMocks();
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText("Testing place")).toBeInTheDocument();
    });
    const directSection = screen.getByTestId("sidebar-direct-section");
    const workspacesSection = screen.getByTestId("sidebar-workspaces-section");
    expect(directSection.compareDocumentPosition(workspacesSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("sidebar-direct-move")).toHaveAttribute("aria-label", "Move down");
    expect(screen.getByTestId("sidebar-workspaces-move")).toHaveAttribute("aria-label", "Move up");
  });

  it("clicking Direct move button puts Workspaces before Direct", async () => {
    setupDefaultMocks();
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText("Testing place")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("sidebar-direct-move"));
    const directSection = screen.getByTestId("sidebar-direct-section");
    const workspacesSection = screen.getByTestId("sidebar-workspaces-section");
    expect(workspacesSection.compareDocumentPosition(directSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("clicking Workspaces move button puts Direct before Workspaces", async () => {
    setupDefaultMocks();
    localStorage.setItem("sidebar:section-order", "workspaces-first");
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText("Testing place")).toBeInTheDocument();
    });
    const directSection = screen.getByTestId("sidebar-direct-section");
    const workspacesSection = screen.getByTestId("sidebar-workspaces-section");
    expect(workspacesSection.compareDocumentPosition(directSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await userEvent.click(screen.getByTestId("sidebar-workspaces-move"));
    await waitFor(() => {
      const directAfter = screen.getByTestId("sidebar-direct-section");
      const workspacesAfter = screen.getByTestId("sidebar-workspaces-section");
      expect(directAfter.compareDocumentPosition(workspacesAfter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  it("persists section order after rerender via localStorage", async () => {
    setupDefaultMocks();
    const { unmount } = render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText("Testing place")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("sidebar-direct-move"));
    unmount();
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText("Testing place")).toBeInTheDocument();
    });
    const directSection = screen.getByTestId("sidebar-direct-section");
    const workspacesSection = screen.getByTestId("sidebar-workspaces-section");
    expect(workspacesSection.compareDocumentPosition(directSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(localStorage.getItem("sidebar:section-order")).toBe("workspaces-first");
  });

  it("falls back to Direct first when localStorage value is invalid", async () => {
    localStorage.setItem("sidebar:section-order", "invalid");
    setupDefaultMocks();
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText("Testing place")).toBeInTheDocument();
    });
    const directSection = screen.getByTestId("sidebar-direct-section");
    const workspacesSection = screen.getByTestId("sidebar-workspaces-section");
    expect(directSection.compareDocumentPosition(workspacesSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("moving sections does not collapse Direct", async () => {
    setupDefaultMocks();
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText("Direct messages")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("sidebar-direct-move"));
    expect(screen.getByText("Direct messages")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("sidebar-workspaces-move"));
    expect(screen.getByText("Direct messages")).toBeInTheDocument();
  });

  it("moving sections does not collapse expanded workspace", async () => {
    setupDefaultMocks("/workspaces/ws1/channels/ch1");
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText(/Boboski/)).toBeInTheDocument();
    });
    expect(screen.getByTestId("sidebar-workspace-channels-ws1")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("sidebar-direct-move"));
    expect(screen.getByTestId("sidebar-workspace-channels-ws1")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("sidebar-workspaces-move"));
    expect(screen.getByTestId("sidebar-workspace-channels-ws1")).toBeInTheDocument();
  });

  it("active direct conversation highlight remains after reorder", async () => {
    setupDefaultMocks("/direct/dc1");
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByTestId("sidebar-direct-conversation-link-dc1")).toBeInTheDocument();
    });
    expect(screen.getByTestId("sidebar-direct-conversation-link-dc1")).toHaveClass("bg-zinc-200");
    await userEvent.click(screen.getByTestId("sidebar-direct-move"));
    expect(screen.getByTestId("sidebar-direct-conversation-link-dc1")).toHaveClass("bg-zinc-200");
  });

  it("active workspace and channel highlight remains after reorder", async () => {
    setupDefaultMocks("/workspaces/ws1/channels/ch1");
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByTestId("sidebar-channel-link-ch1")).toBeInTheDocument();
    });
    expect(screen.getByTestId("sidebar-workspace-toggle-ws1")).toHaveClass("bg-zinc-200");
    expect(screen.getByTestId("sidebar-channel-link-ch1")).toHaveClass("bg-zinc-200");
    await userEvent.click(screen.getByTestId("sidebar-direct-move"));
    expect(screen.getByTestId("sidebar-workspace-toggle-ws1")).toHaveClass("bg-zinc-200");
    expect(screen.getByTestId("sidebar-channel-link-ch1")).toHaveClass("bg-zinc-200");
  });

  it("channels remain nested under workspace after reorder", async () => {
    setupDefaultMocks("/workspaces/ws1/channels/ch1");
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText(/Boboski/)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("sidebar-direct-move"));
    const wsChannels = screen.getByTestId("sidebar-workspace-channels-ws1");
    expect(wsChannels).toBeInTheDocument();
    expect(wsChannels.textContent).toContain("Boboski");
  });

  it("no detached global Channels section appears after reorder", async () => {
    setupDefaultMocks("/workspaces/ws1/channels/ch1");
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText(/Boboski/)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("sidebar-direct-move"));
    const sectionHeaders = screen.queryAllByText(/Channels/i);
    expect(sectionHeaders.length).toBe(0);
  });

  it("reorder button click does not trigger section collapse", async () => {
    setupDefaultMocks();
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText("Direct messages")).toBeInTheDocument();
      expect(screen.getByText("Testing place")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("sidebar-direct-move"));
    expect(screen.getByText("Direct messages")).toBeInTheDocument();
    expect(screen.getByText("Testing place")).toBeInTheDocument();
  });

  it("Direct collapse toggle still works after reorder", async () => {
    setupDefaultMocks();
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText("Direct messages")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("sidebar-direct-move"));
    await userEvent.click(screen.getByTestId("sidebar-direct-toggle"));
    expect(screen.queryByText("Direct messages")).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId("sidebar-direct-toggle"));
    expect(screen.getByText("Direct messages")).toBeInTheDocument();
  });

  it("Workspace collapse toggle still works after reorder", async () => {
    setupDefaultMocks();
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText("Testing place")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("sidebar-direct-move"));
    const workspacesToggle = screen.getByText("Workspaces").closest("button");
    await userEvent.click(workspacesToggle!);
    expect(screen.queryByText("Testing place")).not.toBeInTheDocument();
    await userEvent.click(workspacesToggle!);
    expect(screen.getByText("Testing place")).toBeInTheDocument();
  });
});


describe("Sidebar — localization", () => {
  it("renders en labels when locale is en", async () => {
    localStorage.setItem("lets-chat:locale", "en");
    setupDefaultMocks("/workspaces/ws1/channels/ch1");
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText("Overview")).toBeInTheDocument();
    });
    expect(screen.getByText("Direct")).toBeInTheDocument();
    expect(screen.getByText("Direct messages")).toBeInTheDocument();
    expect(screen.getByText("Workspaces")).toBeInTheDocument();
  });

  it("renders ru labels when locale is ru", async () => {
    localStorage.setItem("lets-chat:locale", "ru");
    setupDefaultMocks("/workspaces/ws1/channels/ch1");
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText("Обзор")).toBeInTheDocument();
    });
    expect(screen.getByText("Личные")).toBeInTheDocument();
    expect(screen.getByText("Личные сообщения")).toBeInTheDocument();
    expect(screen.getByText("Рабочие пространства")).toBeInTheDocument();
  });

  it("renders uk labels when locale is uk", async () => {
    localStorage.setItem("lets-chat:locale", "uk");
    setupDefaultMocks("/workspaces/ws1/channels/ch1");
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText("Огляд")).toBeInTheDocument();
    });
    expect(screen.getByText("Особисті")).toBeInTheDocument();
    expect(screen.getByText("Особисті повідомлення")).toBeInTheDocument();
    expect(screen.getByText("Робочі простори")).toBeInTheDocument();
  });

  it("shows localized unknown user fallback", async () => {
    localStorage.setItem("lets-chat:locale", "ru");
    setupDefaultMocks();
    vi.mocked(listDirectConversations).mockResolvedValue([
      {
        id: "dc3",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: null,
        lastMessage: null,
        unreadCount: 0,
        isOnline: false,
      },
    ]);
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText("Неизвестно")).toBeInTheDocument();
    });
  });

  it("shows localized loading text for workspaces", async () => {
    localStorage.setItem("lets-chat:locale", "uk");
    setupDefaultMocks();
    vi.mocked(getWorkspaces).mockImplementation(() => new Promise(() => {}));
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText("Завантаження…")).toBeInTheDocument();
    });
  });

  it("shows localized error text for workspaces", async () => {
    localStorage.setItem("lets-chat:locale", "uk");
    setupDefaultMocks();
    vi.mocked(getWorkspaces).mockRejectedValue(new Error("fail"));
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText("Не вдалося завантажити робочі простори")).toBeInTheDocument();
    });
  });

  it("shows localized empty text for workspaces", async () => {
    localStorage.setItem("lets-chat:locale", "uk");
    setupDefaultMocks();
    vi.mocked(getWorkspaces).mockResolvedValue([]);
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText("Робочих просторів ще немає")).toBeInTheDocument();
    });
  });

  it("shows localized loading text for channels", async () => {
    localStorage.setItem("lets-chat:locale", "uk");
    setupDefaultMocks("/workspaces/ws1/channels/ch1");
    vi.mocked(getChannels).mockImplementation(() => new Promise(() => {}));
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText("Testing place")).toBeInTheDocument();
    });
    expect(screen.getByText("Завантаження…")).toBeInTheDocument();
  });

  it("shows localized error text for channels", async () => {
    localStorage.setItem("lets-chat:locale", "uk");
    setupDefaultMocks("/workspaces/ws1/channels/ch1");
    vi.mocked(getChannels).mockRejectedValue(new Error("fail"));
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText("Не вдалося завантажити канали")).toBeInTheDocument();
    });
  });

  it("shows localized empty text for channels", async () => {
    localStorage.setItem("lets-chat:locale", "uk");
    setupDefaultMocks("/workspaces/ws1/channels/ch1");
    vi.mocked(getChannels).mockResolvedValue([]);
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText("Каналів ще немає")).toBeInTheDocument();
    });
  });

  it("shows localized public/private badges in ru", async () => {
    localStorage.setItem("lets-chat:locale", "ru");
    setupDefaultMocks("/workspaces/ws1/channels/ch1");
    render(<Sidebar />);
    await waitFor(() => {
      expect(screen.getByText(/Boboski/)).toBeInTheDocument();
    });
    expect(screen.getByText("Публ.")).toBeInTheDocument();
    expect(screen.getByText("Прив.")).toBeInTheDocument();
  });
});


describe("Sidebar — unauthenticated localization", () => {
  it("shows localized unauth fallback in en", async () => {
    localStorage.setItem("lets-chat:locale", "en");
    mockAuth({ isAuthenticated: false, isLoading: false, accessToken: null, user: null });
    render(<Sidebar />);
    expect(screen.getByText("Workspace")).toBeInTheDocument();
    expect(screen.getByText("Sign in to see your workspaces")).toBeInTheDocument();
  });

  it("shows localized unauth fallback in ru", async () => {
    localStorage.setItem("lets-chat:locale", "ru");
    mockAuth({ isAuthenticated: false, isLoading: false, accessToken: null, user: null });
    render(<Sidebar />);
    expect(screen.getByText("Рабочее пространство")).toBeInTheDocument();
    expect(screen.getByText("Войдите, чтобы видеть свои рабочие пространства")).toBeInTheDocument();
  });

  it("shows localized unauth fallback in uk", async () => {
    localStorage.setItem("lets-chat:locale", "uk");
    mockAuth({ isAuthenticated: false, isLoading: false, accessToken: null, user: null });
    render(<Sidebar />);
    expect(screen.getByText("Робочий простір")).toBeInTheDocument();
    expect(screen.getByText("Увійдіть, щоб бачити свої робочі простори")).toBeInTheDocument();
  });
});
