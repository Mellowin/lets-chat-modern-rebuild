import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import WorkspaceDetailPage from "./page";
import { getWorkspace, getWorkspaceMembers, addWorkspaceMember, leaveWorkspace, removeWorkspaceMember } from "@/lib/workspaces-api";
import { createWorkspaceInvite } from "@/lib/invites-api";
import { getChannels, getArchivedChannels, archiveChannel, restoreChannel } from "@/lib/channels-api";

const routerPushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ workspaceId: "ws1" }),
  useRouter: () => ({ push: routerPushMock }),
}));

const mockAuthUser = { id: "u1", email: "a@b.com", username: "alice" };

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    get user() { return mockAuthUser; },
    accessToken: "token",
  }),
}));

vi.mock("@/lib/workspaces-api", () => ({
  getWorkspace: vi.fn(),
  getWorkspaceMembers: vi.fn(),
  addWorkspaceMember: vi.fn(),
  leaveWorkspace: vi.fn(),
  removeWorkspaceMember: vi.fn(),
}));

vi.mock("@/lib/invites-api", () => ({
  createWorkspaceInvite: vi.fn(),
}));

vi.mock("@/lib/channels-api", () => ({
  getChannels: vi.fn(),
  getArchivedChannels: vi.fn(),
  createChannel: vi.fn(),
  archiveChannel: vi.fn(),
  restoreChannel: vi.fn(),
}));

function mockWorkspaceData({ archived = [] as unknown[] } = {}) {
  vi.mocked(getWorkspace).mockResolvedValue({
    id: "ws1",
    name: "Test Workspace",
    slug: "test-workspace",
    description: null,
    ownerId: "u1",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    deletedAt: null,
  });
  vi.mocked(getChannels).mockResolvedValue([]);
  vi.mocked(getWorkspaceMembers).mockResolvedValue([
    { id: "wm1", workspaceId: "ws1", role: "OWNER", joinedAt: "2024-01-01T00:00:00Z", user: { id: "u1", username: "alice", displayName: "Alice" } },
  ]);
  vi.mocked(getArchivedChannels).mockResolvedValue(archived as ReturnType<typeof getArchivedChannels> extends Promise<infer T> ? T : never);
}

describe("WorkspaceDetailPage — archived channels", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows archived channels list with Restore button for creator", async () => {
    mockWorkspaceData({
      archived: [
        { id: "ch-arch", workspaceId: "ws1", name: "old-general", slug: "old-general-slug", description: null, type: "PUBLIC", createdById: "u1", createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z", deletedAt: "2024-02-01T00:00:00Z" },
      ],
    });

    render(<WorkspaceDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Archived channels")).toBeInTheDocument();
    });

    expect(screen.getByText("old-general")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Restore/i })).toBeInTheDocument();
  });

  it("hides Restore button when user is not the creator", async () => {
    mockWorkspaceData({
      archived: [
        { id: "ch-arch", workspaceId: "ws1", name: "old-general", slug: "old-general-slug", description: null, type: "PUBLIC", createdById: "u2", createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z", deletedAt: "2024-02-01T00:00:00Z" },
      ],
    });

    render(<WorkspaceDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("old-general")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /Restore/i })).not.toBeInTheDocument();
  });

  it("shows 'No archived channels' when empty", async () => {
    mockWorkspaceData({ archived: [] });

    render(<WorkspaceDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/No archived channels/i)).toBeInTheDocument();
    });
  });

  it("moves channel to archived list immediately after Archive confirm", async () => {
    mockWorkspaceData({ archived: [] });
    vi.mocked(getChannels).mockResolvedValue([
      { id: "ch1", workspaceId: "ws1", name: "general", slug: "general-slug", description: null, type: "PUBLIC", createdById: "u1", createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z", deletedAt: null },
    ]);

    vi.mocked(archiveChannel).mockResolvedValueOnce({ success: true });

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<WorkspaceDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Archive/i })).toBeInTheDocument();
    });

    // Set up refresh mocks after initial load
    vi.mocked(getChannels).mockResolvedValueOnce([]);
    vi.mocked(getArchivedChannels).mockResolvedValueOnce([
      { id: "ch1", workspaceId: "ws1", name: "general", slug: "general-slug", description: null, type: "PUBLIC", createdById: "u1", createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z", deletedAt: "2024-02-01T00:00:00Z" },
    ]);

    await userEvent.click(screen.getByRole("button", { name: /Archive/i }));

    await waitFor(() => {
      expect(archiveChannel).toHaveBeenCalledWith("token", "ws1", "ch1");
    });

    // Active channels should be empty
    expect(screen.getByText(/No channels yet/i)).toBeInTheDocument();
    // Archived channels should show the moved channel
    expect(screen.getByText("general")).toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  it("restores channel and refreshes both lists on confirm", async () => {
    mockWorkspaceData({
      archived: [
        { id: "ch-arch", workspaceId: "ws1", name: "old-general", slug: "old-general-slug", description: null, type: "PUBLIC", createdById: "u1", createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z", deletedAt: "2024-02-01T00:00:00Z" },
      ],
    });

    vi.mocked(restoreChannel).mockResolvedValueOnce({ success: true });

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<WorkspaceDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Restore/i })).toBeInTheDocument();
    });

    // Set up refresh mocks after initial load so they apply to the restore refresh
    vi.mocked(getChannels).mockResolvedValueOnce([
      { id: "ch-arch", workspaceId: "ws1", name: "old-general", slug: "old-general-slug", description: null, type: "PUBLIC", createdById: "u1", createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z", deletedAt: null },
    ]);
    vi.mocked(getArchivedChannels).mockResolvedValueOnce([]);

    await userEvent.click(screen.getByRole("button", { name: /Restore/i }));

    await waitFor(() => {
      expect(restoreChannel).toHaveBeenCalledWith("token", "ws1", "ch-arch");
    });

    confirmSpy.mockRestore();
  });

  it("does not restore if user cancels confirm", async () => {
    mockWorkspaceData({
      archived: [
        { id: "ch-arch", workspaceId: "ws1", name: "old-general", slug: "old-general-slug", description: null, type: "PUBLIC", createdById: "u1", createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z", deletedAt: "2024-02-01T00:00:00Z" },
      ],
    });

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<WorkspaceDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Restore/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Restore/i }));

    expect(restoreChannel).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it("shows error on restore failure", async () => {
    mockWorkspaceData({
      archived: [
        { id: "ch-arch", workspaceId: "ws1", name: "old-general", slug: "old-general-slug", description: null, type: "PUBLIC", createdById: "u1", createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z", deletedAt: "2024-02-01T00:00:00Z" },
      ],
    });

    vi.mocked(restoreChannel).mockRejectedValueOnce(new Error("Only owner can restore channel"));

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<WorkspaceDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Restore/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Restore/i }));

    expect(await screen.findByText(/Only owner can restore channel/i)).toBeInTheDocument();

    confirmSpy.mockRestore();
  });
});

describe("WorkspaceDetailPage — members", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows displayName with @username when displayName is present", async () => {
    mockWorkspaceData({ archived: [] });
    vi.mocked(getWorkspaceMembers).mockResolvedValue([
      { id: "wm1", workspaceId: "ws1", role: "OWNER", joinedAt: "2024-01-01T00:00:00Z", user: { id: "u1", username: "alice", displayName: "Alice" } },
    ]);

    render(<WorkspaceDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });
    expect(screen.getByText("@alice")).toBeInTheDocument();
  });

  it("falls back to @username when displayName is absent", async () => {
    mockWorkspaceData({ archived: [] });
    vi.mocked(getWorkspaceMembers).mockResolvedValue([
      { id: "wm1", workspaceId: "ws1", role: "OWNER", joinedAt: "2024-01-01T00:00:00Z", user: { id: "u1", username: "alice" } },
    ]);

    render(<WorkspaceDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("@alice")).toBeInTheDocument();
    });
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
  });
});

describe("WorkspaceDetailPage — add member / invite", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuthUser.id = "u1";
    mockAuthUser.email = "a@b.com";
    mockAuthUser.username = "alice";
  });

  it("OWNER sees role select with MEMBER default", async () => {
    mockWorkspaceData({ archived: [] });

    render(<WorkspaceDetailPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Username or email/i)).toBeInTheDocument();
    });

    const select = screen.getByDisplayValue("MEMBER");
    expect(select).toBeInTheDocument();
  });

  it("OWNER can select ADMIN for email invite", async () => {
    mockWorkspaceData({ archived: [] });
    vi.mocked(createWorkspaceInvite).mockResolvedValue({
      id: "invite-1",
      workspaceId: "ws1",
      email: "bob@example.com",
      role: "ADMIN",
      token: "token123",
      expiresAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });

    render(<WorkspaceDetailPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Username or email/i)).toBeInTheDocument();
    });

    await userEvent.selectOptions(screen.getByDisplayValue("MEMBER"), "ADMIN");
    await userEvent.type(screen.getByPlaceholderText(/Username or email/i), "bob@example.com");
    await userEvent.click(screen.getByRole("button", { name: /Add member/i }));

    await waitFor(() => {
      expect(createWorkspaceInvite).toHaveBeenCalledWith("token", "ws1", { email: "bob@example.com", role: "ADMIN" });
    });
  });

  it("OWNER can select ADMIN for username add", async () => {
    mockWorkspaceData({ archived: [] });
    vi.mocked(addWorkspaceMember).mockResolvedValue({
      id: "wm2",
      workspaceId: "ws1",
      role: "ADMIN",
      joinedAt: new Date().toISOString(),
      user: { id: "u2", username: "bob" },
    });

    render(<WorkspaceDetailPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Username or email/i)).toBeInTheDocument();
    });

    await userEvent.selectOptions(screen.getByDisplayValue("MEMBER"), "ADMIN");
    await userEvent.type(screen.getByPlaceholderText(/Username or email/i), "bob");
    await userEvent.click(screen.getByRole("button", { name: /Add member/i }));

    await waitFor(() => {
      expect(addWorkspaceMember).toHaveBeenCalledWith("token", "ws1", { identifier: "bob", role: "ADMIN" });
    });
  });

  it("ADMIN does not see role select", async () => {
    mockAuthUser.id = "u2";
    mockAuthUser.email = "b@b.com";
    mockAuthUser.username = "bob";
    mockWorkspaceData({ archived: [] });
    vi.mocked(getWorkspaceMembers).mockResolvedValue([
      { id: "wm1", workspaceId: "ws1", role: "OWNER", joinedAt: "2024-01-01T00:00:00Z", user: { id: "u1", username: "alice", displayName: "Alice" } },
      { id: "wm2", workspaceId: "ws1", role: "ADMIN", joinedAt: "2024-01-01T00:00:00Z", user: { id: "u2", username: "bob", displayName: "Bob" } },
    ]);

    render(<WorkspaceDetailPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Username or email/i)).toBeInTheDocument();
    });

    expect(screen.queryByDisplayValue("MEMBER")).not.toBeInTheDocument();
  });

  it("ADMIN add/invite sends role MEMBER", async () => {
    mockAuthUser.id = "u2";
    mockAuthUser.email = "b@b.com";
    mockAuthUser.username = "bob";
    mockWorkspaceData({ archived: [] });
    vi.mocked(getWorkspaceMembers).mockResolvedValue([
      { id: "wm1", workspaceId: "ws1", role: "OWNER", joinedAt: "2024-01-01T00:00:00Z", user: { id: "u1", username: "alice", displayName: "Alice" } },
      { id: "wm2", workspaceId: "ws1", role: "ADMIN", joinedAt: "2024-01-01T00:00:00Z", user: { id: "u2", username: "bob", displayName: "Bob" } },
    ]);
    vi.mocked(addWorkspaceMember).mockResolvedValue({
      id: "wm3",
      workspaceId: "ws1",
      role: "MEMBER",
      joinedAt: new Date().toISOString(),
      user: { id: "u3", username: "charlie" },
    });

    render(<WorkspaceDetailPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Username or email/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Username or email/i), "charlie");
    await userEvent.click(screen.getByRole("button", { name: /Add member/i }));

    await waitFor(() => {
      expect(addWorkspaceMember).toHaveBeenCalledWith("token", "ws1", { identifier: "charlie", role: "MEMBER" });
    });
  });

  it("calls createWorkspaceInvite for email input and shows Invitation sent", async () => {
    mockWorkspaceData({ archived: [] });
    vi.mocked(createWorkspaceInvite).mockResolvedValue({
      id: "invite-1",
      workspaceId: "ws1",
      email: "bob@example.com",
      role: "MEMBER",
      token: "token123",
      expiresAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });

    render(<WorkspaceDetailPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Username or email/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Username or email/i), "bob@example.com");
    await userEvent.click(screen.getByRole("button", { name: /Add member/i }));

    await waitFor(() => {
      expect(createWorkspaceInvite).toHaveBeenCalledWith("token", "ws1", { email: "bob@example.com", role: "MEMBER" });
    });
    expect(addWorkspaceMember).not.toHaveBeenCalled();
    expect(screen.getByText(/Invitation sent/i)).toBeInTheDocument();
  });

  it("calls addWorkspaceMember for username input and shows Member added", async () => {
    mockWorkspaceData({ archived: [] });
    vi.mocked(addWorkspaceMember).mockResolvedValue({
      id: "wm2",
      workspaceId: "ws1",
      role: "MEMBER",
      joinedAt: new Date().toISOString(),
      user: { id: "u2", username: "bob" },
    });

    render(<WorkspaceDetailPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Username or email/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Username or email/i), "bob");
    await userEvent.click(screen.getByRole("button", { name: /Add member/i }));

    await waitFor(() => {
      expect(addWorkspaceMember).toHaveBeenCalledWith("token", "ws1", { identifier: "bob", role: "MEMBER" });
    });
    expect(createWorkspaceInvite).not.toHaveBeenCalled();
    expect(screen.getByText(/Member added/i)).toBeInTheDocument();
  });

  it("shows error when email invite fails", async () => {
    mockWorkspaceData({ archived: [] });
    vi.mocked(createWorkspaceInvite).mockRejectedValue(new Error("Cannot invite existing member"));

    render(<WorkspaceDetailPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Username or email/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Username or email/i), "bob@example.com");
    await userEvent.click(screen.getByRole("button", { name: /Add member/i }));

    expect(await screen.findByText(/Cannot invite existing member/i)).toBeInTheDocument();
  });

  it("shows 'Invitation already sent' for duplicate email invite", async () => {
    mockWorkspaceData({ archived: [] });
    vi.mocked(createWorkspaceInvite).mockRejectedValue(new Error("Invitation already sent"));

    render(<WorkspaceDetailPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Username or email/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Username or email/i), "bob@example.com");
    await userEvent.click(screen.getByRole("button", { name: /Add member/i }));

    expect(await screen.findByText(/Invitation already sent/i)).toBeInTheDocument();
    // Should not append anything to members list
    expect(screen.getAllByText("Alice").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("bob@example.com")).not.toBeInTheDocument();
  });

  it("shows 'Already a member of this workspace' for existing member email", async () => {
    mockWorkspaceData({ archived: [] });
    vi.mocked(createWorkspaceInvite).mockRejectedValue(new Error("Already a member of this workspace"));

    render(<WorkspaceDetailPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Username or email/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Username or email/i), "bob@example.com");
    await userEvent.click(screen.getByRole("button", { name: /Add member/i }));

    expect(await screen.findByText(/Already a member of this workspace/i)).toBeInTheDocument();
    // Should not append anything to members list
    expect(screen.getAllByText("Alice").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("bob@example.com")).not.toBeInTheDocument();
  });

  it("shows error when username add fails", async () => {
    mockWorkspaceData({ archived: [] });
    vi.mocked(addWorkspaceMember).mockRejectedValue(new Error("User not found"));

    render(<WorkspaceDetailPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Username or email/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Username or email/i), "unknown");
    await userEvent.click(screen.getByRole("button", { name: /Add member/i }));

    expect(await screen.findByText(/User not found/i)).toBeInTheDocument();
  });

  it("does not append member to list on email invite success", async () => {
    mockWorkspaceData({ archived: [] });
    vi.mocked(createWorkspaceInvite).mockResolvedValue({
      id: "invite-1",
      workspaceId: "ws1",
      email: "bob@example.com",
      role: "MEMBER",
      token: "token123",
      expiresAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    vi.mocked(getWorkspaceMembers).mockResolvedValue([
      { id: "wm1", workspaceId: "ws1", role: "OWNER", joinedAt: "2024-01-01T00:00:00Z", user: { id: "u1", username: "alice", displayName: "Alice" } },
    ]);

    render(<WorkspaceDetailPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Username or email/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Username or email/i), "bob@example.com");
    await userEvent.click(screen.getByRole("button", { name: /Add member/i }));

    await waitFor(() => {
      expect(screen.getByText(/Invitation sent/i)).toBeInTheDocument();
    });

    // Should still only show alice, not bob
    expect(screen.getAllByText("Alice").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("bob@example.com")).not.toBeInTheDocument();
  });
});

describe("WorkspaceDetailPage — remove member", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuthUser.id = "u1";
    mockAuthUser.email = "a@b.com";
    mockAuthUser.username = "alice";
  });

  function mockWorkspaceWithMembers(members: unknown[]) {
    mockWorkspaceData({ archived: [] });
    vi.mocked(getWorkspaceMembers).mockResolvedValue(members as Awaited<ReturnType<typeof getWorkspaceMembers>>);
  }

  it("OWNER sees Remove button for MEMBER", async () => {
    mockWorkspaceWithMembers([
      { id: "wm1", workspaceId: "ws1", role: "OWNER", joinedAt: "2024-01-01T00:00:00Z", user: { id: "u1", username: "alice", displayName: "Alice" } },
      { id: "wm2", workspaceId: "ws1", role: "MEMBER", joinedAt: "2024-01-01T00:00:00Z", user: { id: "u2", username: "bob", displayName: "Bob" } },
    ]);

    render(<WorkspaceDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });

    const removeButtons = screen.getAllByRole("button", { name: /Remove/i });
    expect(removeButtons).toHaveLength(1);
  });

  it("OWNER sees Remove button for ADMIN", async () => {
    mockWorkspaceWithMembers([
      { id: "wm1", workspaceId: "ws1", role: "OWNER", joinedAt: "2024-01-01T00:00:00Z", user: { id: "u1", username: "alice", displayName: "Alice" } },
      { id: "wm2", workspaceId: "ws1", role: "ADMIN", joinedAt: "2024-01-01T00:00:00Z", user: { id: "u2", username: "bob", displayName: "Bob" } },
    ]);

    render(<WorkspaceDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });

    const removeButtons = screen.getAllByRole("button", { name: /Remove/i });
    expect(removeButtons).toHaveLength(1);
  });

  it("OWNER does not see Remove button for self", async () => {
    mockWorkspaceWithMembers([
      { id: "wm1", workspaceId: "ws1", role: "OWNER", joinedAt: "2024-01-01T00:00:00Z", user: { id: "u1", username: "alice", displayName: "Alice" } },
    ]);

    render(<WorkspaceDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /Remove/i })).not.toBeInTheDocument();
  });

  it("ADMIN sees Remove button for MEMBER", async () => {
    mockAuthUser.id = "u2";
    mockAuthUser.email = "b@b.com";
    mockAuthUser.username = "bob";
    mockWorkspaceWithMembers([
      { id: "wm1", workspaceId: "ws1", role: "OWNER", joinedAt: "2024-01-01T00:00:00Z", user: { id: "u1", username: "alice", displayName: "Alice" } },
      { id: "wm2", workspaceId: "ws1", role: "ADMIN", joinedAt: "2024-01-01T00:00:00Z", user: { id: "u2", username: "bob", displayName: "Bob" } },
      { id: "wm3", workspaceId: "ws1", role: "MEMBER", joinedAt: "2024-01-01T00:00:00Z", user: { id: "u3", username: "charlie", displayName: "Charlie" } },
    ]);

    render(<WorkspaceDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Charlie")).toBeInTheDocument();
    });

    const removeButtons = screen.getAllByRole("button", { name: /Remove/i });
    expect(removeButtons).toHaveLength(1);
  });

  it("ADMIN does not see Remove button for ADMIN", async () => {
    mockAuthUser.id = "u2";
    mockAuthUser.email = "b@b.com";
    mockAuthUser.username = "bob";
    mockWorkspaceWithMembers([
      { id: "wm1", workspaceId: "ws1", role: "OWNER", joinedAt: "2024-01-01T00:00:00Z", user: { id: "u1", username: "alice", displayName: "Alice" } },
      { id: "wm2", workspaceId: "ws1", role: "ADMIN", joinedAt: "2024-01-01T00:00:00Z", user: { id: "u2", username: "bob", displayName: "Bob" } },
    ]);

    render(<WorkspaceDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /Remove/i })).not.toBeInTheDocument();
  });

  it("ADMIN does not see Remove button for OWNER", async () => {
    mockAuthUser.id = "u2";
    mockAuthUser.email = "b@b.com";
    mockAuthUser.username = "bob";
    mockWorkspaceWithMembers([
      { id: "wm1", workspaceId: "ws1", role: "OWNER", joinedAt: "2024-01-01T00:00:00Z", user: { id: "u1", username: "alice", displayName: "Alice" } },
      { id: "wm2", workspaceId: "ws1", role: "ADMIN", joinedAt: "2024-01-01T00:00:00Z", user: { id: "u2", username: "bob", displayName: "Bob" } },
    ]);

    render(<WorkspaceDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /Remove/i })).not.toBeInTheDocument();
  });

  it("ADMIN does not see Remove button for self", async () => {
    mockAuthUser.id = "u2";
    mockAuthUser.email = "b@b.com";
    mockAuthUser.username = "bob";
    mockWorkspaceWithMembers([
      { id: "wm1", workspaceId: "ws1", role: "OWNER", joinedAt: "2024-01-01T00:00:00Z", user: { id: "u1", username: "alice", displayName: "Alice" } },
      { id: "wm2", workspaceId: "ws1", role: "ADMIN", joinedAt: "2024-01-01T00:00:00Z", user: { id: "u2", username: "bob", displayName: "Bob" } },
    ]);

    render(<WorkspaceDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /Remove/i })).not.toBeInTheDocument();
  });

  it("MEMBER sees no Remove buttons", async () => {
    mockAuthUser.id = "u3";
    mockAuthUser.email = "c@c.com";
    mockAuthUser.username = "charlie";
    mockWorkspaceWithMembers([
      { id: "wm1", workspaceId: "ws1", role: "OWNER", joinedAt: "2024-01-01T00:00:00Z", user: { id: "u1", username: "alice", displayName: "Alice" } },
      { id: "wm2", workspaceId: "ws1", role: "MEMBER", joinedAt: "2024-01-01T00:00:00Z", user: { id: "u3", username: "charlie", displayName: "Charlie" } },
    ]);

    render(<WorkspaceDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /Remove/i })).not.toBeInTheDocument();
  });

  it("cancel confirm does not call API", async () => {
    mockWorkspaceWithMembers([
      { id: "wm1", workspaceId: "ws1", role: "OWNER", joinedAt: "2024-01-01T00:00:00Z", user: { id: "u1", username: "alice", displayName: "Alice" } },
      { id: "wm2", workspaceId: "ws1", role: "MEMBER", joinedAt: "2024-01-01T00:00:00Z", user: { id: "u2", username: "bob", displayName: "Bob" } },
    ]);

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<WorkspaceDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Remove/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Remove/i }));

    expect(removeWorkspaceMember).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("success removes member from list and shows Member removed", async () => {
    mockWorkspaceWithMembers([
      { id: "wm1", workspaceId: "ws1", role: "OWNER", joinedAt: "2024-01-01T00:00:00Z", user: { id: "u1", username: "alice", displayName: "Alice" } },
      { id: "wm2", workspaceId: "ws1", role: "MEMBER", joinedAt: "2024-01-01T00:00:00Z", user: { id: "u2", username: "bob", displayName: "Bob" } },
    ]);

    vi.mocked(removeWorkspaceMember).mockResolvedValue({ success: true });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<WorkspaceDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Remove/i }));

    await waitFor(() => {
      expect(removeWorkspaceMember).toHaveBeenCalledWith("token", "ws1", "wm2");
    });

    expect(screen.queryByText("Bob")).not.toBeInTheDocument();
    expect(screen.getByText(/Member removed/i)).toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  it("backend error shows inline error and keeps member in list", async () => {
    mockWorkspaceWithMembers([
      { id: "wm1", workspaceId: "ws1", role: "OWNER", joinedAt: "2024-01-01T00:00:00Z", user: { id: "u1", username: "alice", displayName: "Alice" } },
      { id: "wm2", workspaceId: "ws1", role: "MEMBER", joinedAt: "2024-01-01T00:00:00Z", user: { id: "u2", username: "bob", displayName: "Bob" } },
    ]);

    vi.mocked(removeWorkspaceMember).mockRejectedValue(new Error("Cannot remove workspace owner"));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<WorkspaceDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Remove/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Remove/i }));

    expect(await screen.findByText(/Cannot remove workspace owner/i)).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();

    confirmSpy.mockRestore();
  });
});

describe("WorkspaceDetailPage — leave workspace", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    routerPushMock.mockClear();
  });

  function mockWorkspaceWithRole(role: "OWNER" | "ADMIN" | "MEMBER") {
    mockWorkspaceData({ archived: [] });
    vi.mocked(getWorkspaceMembers).mockResolvedValue([
      { id: "wm1", workspaceId: "ws1", role, joinedAt: "2024-01-01T00:00:00Z", user: { id: "u1", username: "alice", displayName: "Alice" } },
    ]);
  }

  it("shows Leave workspace button for MEMBER", async () => {
    mockWorkspaceWithRole("MEMBER");

    render(<WorkspaceDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Leave workspace/i })).toBeInTheDocument();
    });
  });

  it("shows Leave workspace button for ADMIN", async () => {
    mockWorkspaceWithRole("ADMIN");

    render(<WorkspaceDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Leave workspace/i })).toBeInTheDocument();
    });
  });

  it("does not show Leave workspace button for OWNER", async () => {
    mockWorkspaceWithRole("OWNER");

    render(<WorkspaceDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /Leave workspace/i })).not.toBeInTheDocument();
  });

  it("does not call API when user cancels confirm", async () => {
    mockWorkspaceWithRole("MEMBER");
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<WorkspaceDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Leave workspace/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Leave workspace/i }));

    expect(leaveWorkspace).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("calls leaveWorkspace, dispatches event, and redirects on success", async () => {
    mockWorkspaceWithRole("MEMBER");
    vi.mocked(leaveWorkspace).mockResolvedValue({ success: true });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const dispatchSpy = vi.spyOn(window, "dispatchEvent").mockImplementation(() => true);

    render(<WorkspaceDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Leave workspace/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Leave workspace/i }));

    await waitFor(() => {
      expect(leaveWorkspace).toHaveBeenCalledWith("token", "ws1");
    });
    expect(dispatchSpy).toHaveBeenCalledWith(expect.any(Event));
    expect(routerPushMock).toHaveBeenCalledWith("/dashboard");

    confirmSpy.mockRestore();
    dispatchSpy.mockRestore();
  });

  it("shows error when leave fails", async () => {
    mockWorkspaceWithRole("MEMBER");
    vi.mocked(leaveWorkspace).mockRejectedValue(new Error("Owner cannot leave workspace"));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<WorkspaceDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Leave workspace/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Leave workspace/i }));

    expect(await screen.findByText(/Owner cannot leave workspace/i)).toBeInTheDocument();

    confirmSpy.mockRestore();
  });
});
