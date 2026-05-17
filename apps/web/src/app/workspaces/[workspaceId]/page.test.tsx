import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import WorkspaceDetailPage from "./page";
import { getWorkspace, getWorkspaceMembers } from "@/lib/workspaces-api";
import { getChannels, getArchivedChannels, archiveChannel, restoreChannel } from "@/lib/channels-api";

vi.mock("next/navigation", () => ({
  useParams: () => ({ workspaceId: "ws1" }),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    user: { id: "u1", email: "a@b.com", username: "alice" },
    accessToken: "token",
  }),
}));

vi.mock("@/lib/workspaces-api", () => ({
  getWorkspace: vi.fn(),
  getWorkspaceMembers: vi.fn(),
  addWorkspaceMember: vi.fn(),
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
    { id: "wm1", workspaceId: "ws1", role: "OWNER", joinedAt: "2024-01-01T00:00:00Z", user: { id: "u1", username: "alice" } },
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
