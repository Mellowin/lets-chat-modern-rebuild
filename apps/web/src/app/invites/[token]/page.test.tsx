import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import InviteAcceptPage from "./page";
import { previewInvite, acceptInviteByToken } from "@/lib/invites-api";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ token: "invite-token-123" }),
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/lib/invites-api", () => ({
  previewInvite: vi.fn(),
  acceptInviteByToken: vi.fn(),
}));

const mockUseAuth = vi.fn();

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => mockUseAuth(),
}));

function setAuth(state: { isLoading: boolean; isAuthenticated: boolean; accessToken?: string | null }) {
  mockUseAuth.mockReturnValue({
    isLoading: state.isLoading,
    isAuthenticated: state.isAuthenticated,
    accessToken: state.accessToken || null,
  });
}

describe("InviteAcceptPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockPush.mockReset();
    mockUseAuth.mockReturnValue({ isLoading: false, isAuthenticated: false, accessToken: null });
  });

  it("shows loading state while preview loads", () => {
    vi.mocked(previewInvite).mockImplementation(() => new Promise(() => {}));
    render(<InviteAcceptPage />);
    expect(screen.getByText(/Loading invite/i)).toBeInTheDocument();
  });

  it("renders workspace name and expiry for valid preview", async () => {
    vi.mocked(previewInvite).mockResolvedValue({
      workspaceName: "Test Workspace",
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      valid: true,
    });
    render(<InviteAcceptPage />);

    await waitFor(() => {
      expect(screen.getByText("Test Workspace")).toBeInTheDocument();
    });
    expect(screen.getByText(/Invite expires/i)).toBeInTheDocument();
  });

  it("shows invalid/expired message for invalid preview", async () => {
    vi.mocked(previewInvite).mockResolvedValue({
      workspaceName: null,
      expiresAt: new Date().toISOString(),
      valid: false,
    });
    render(<InviteAcceptPage />);

    await waitFor(() => {
      expect(screen.getByText(/invalid or expired/i)).toBeInTheDocument();
    });
  });

  it("shows error when preview fails", async () => {
    vi.mocked(previewInvite).mockRejectedValue(new Error("Invite not found"));
    render(<InviteAcceptPage />);

    await waitFor(() => {
      expect(screen.getByText(/Invite link is invalid or expired/i)).toBeInTheDocument();
    });
  });

  it("shows sign-in prompt for unauthenticated user", async () => {
    vi.mocked(previewInvite).mockResolvedValue({
      workspaceName: "Test Workspace",
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      valid: true,
    });
    setAuth({ isLoading: false, isAuthenticated: false, accessToken: null });
    render(<InviteAcceptPage />);

    await waitFor(() => {
      expect(screen.getByText(/Sign in to accept/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /Go to login/i })).toBeInTheDocument();
  });

  it("shows Accept button for authenticated user", async () => {
    vi.mocked(previewInvite).mockResolvedValue({
      workspaceName: "Test Workspace",
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      valid: true,
    });
    setAuth({ isLoading: false, isAuthenticated: true, accessToken: "tok" });
    render(<InviteAcceptPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Accept invite/i })).toBeInTheDocument();
    });
  });

  it("calls acceptInviteByToken with token on Accept click", async () => {
    vi.mocked(previewInvite).mockResolvedValue({
      workspaceName: "Test Workspace",
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      valid: true,
    });
    vi.mocked(acceptInviteByToken).mockResolvedValue({ workspaceId: "ws1", role: "MEMBER", joinedAt: new Date().toISOString() });
    setAuth({ isLoading: false, isAuthenticated: true, accessToken: "tok" });
    render(<InviteAcceptPage />);

    const user = userEvent.setup();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Accept invite/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Accept invite/i }));

    await waitFor(() => {
      expect(acceptInviteByToken).toHaveBeenCalledWith("tok", "invite-token-123");
    });
  });

  it("shows success and workspace link after accept", async () => {
    vi.mocked(previewInvite).mockResolvedValue({
      workspaceName: "Test Workspace",
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      valid: true,
    });
    vi.mocked(acceptInviteByToken).mockResolvedValue({ workspaceId: "ws1", role: "MEMBER", joinedAt: new Date().toISOString() });
    setAuth({ isLoading: false, isAuthenticated: true, accessToken: "tok" });
    render(<InviteAcceptPage />);

    const user = userEvent.setup();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Accept invite/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Accept invite/i }));

    await waitFor(() => {
      expect(screen.getByText(/Invite accepted/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /Go to workspace/i })).toHaveAttribute("href", "/workspaces/ws1");
  });

  it("handles already-member success", async () => {
    vi.mocked(previewInvite).mockResolvedValue({
      workspaceName: "Test Workspace",
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      valid: true,
    });
    vi.mocked(acceptInviteByToken).mockResolvedValue({ workspaceId: "ws1", role: "MEMBER", joinedAt: null });
    setAuth({ isLoading: false, isAuthenticated: true, accessToken: "tok" });
    render(<InviteAcceptPage />);

    const user = userEvent.setup();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Accept invite/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Accept invite/i }));

    await waitFor(() => {
      expect(screen.getByText(/Invite accepted/i)).toBeInTheDocument();
    });
  });

  it("shows error when accept fails", async () => {
    vi.mocked(previewInvite).mockResolvedValue({
      workspaceName: "Test Workspace",
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      valid: true,
    });
    vi.mocked(acceptInviteByToken).mockRejectedValue(new Error("Invite expired"));
    setAuth({ isLoading: false, isAuthenticated: true, accessToken: "tok" });
    render(<InviteAcceptPage />);

    const user = userEvent.setup();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Accept invite/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Accept invite/i }));

    await waitFor(() => {
      expect(screen.getByText(/Invite link is invalid or expired/i)).toBeInTheDocument();
    });
  });
});
