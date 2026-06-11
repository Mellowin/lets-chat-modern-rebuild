import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import WorkspaceInvitesSection from "./WorkspaceInvitesSection";
import {
  createWorkspaceInvite,
  listWorkspaceInvites,
  revokeWorkspaceInvite,
} from "@/lib/invites-api";

vi.mock("@/lib/invites-api", () => ({
  createWorkspaceInvite: vi.fn(),
  listWorkspaceInvites: vi.fn(),
  revokeWorkspaceInvite: vi.fn(),
}));

const mockPublicInvite = {
  id: "inv-1",
  workspaceId: "ws1",
  email: null,
  role: "MEMBER" as const,
  status: "PENDING" as const,
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
  usedAt: null,
  deletedAt: null,
  maxUses: 10,
  usesCount: 2,
  createdAt: new Date().toISOString(),
};

const mockTargetedInvite = {
  id: "inv-2",
  workspaceId: "ws1",
  email: "bob@example.com",
  role: "ADMIN" as const,
  status: "PENDING" as const,
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
  usedAt: null,
  deletedAt: null,
  maxUses: null,
  usesCount: 0,
  createdAt: new Date().toISOString(),
};

const mockUsedInvite = {
  id: "inv-3",
  workspaceId: "ws1",
  email: null,
  role: "MEMBER" as const,
  status: "USED" as const,
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
  usedAt: new Date().toISOString(),
  deletedAt: null,
  maxUses: 1,
  usesCount: 1,
  createdAt: new Date().toISOString(),
};

describe("WorkspaceInvitesSection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(listWorkspaceInvites).mockResolvedValue([]);
  });

  it("does not render when canManage is false", () => {
    const { container } = render(
      <WorkspaceInvitesSection workspaceId="ws1" accessToken="tok" canManage={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("loads and displays active invites", async () => {
    vi.mocked(listWorkspaceInvites).mockResolvedValue([mockPublicInvite, mockTargetedInvite]);
    render(<WorkspaceInvitesSection workspaceId="ws1" accessToken="tok" canManage />);

    await waitFor(() => {
      expect(screen.getByText("Public invite link")).toBeInTheDocument();
    });
    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
  });

  it("shows past invites", async () => {
    vi.mocked(listWorkspaceInvites).mockResolvedValue([mockUsedInvite]);
    render(<WorkspaceInvitesSection workspaceId="ws1" accessToken="tok" canManage />);

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("USED"))).toBeInTheDocument();
    });
  });

  it("creates a public invite link", async () => {
    vi.mocked(createWorkspaceInvite).mockResolvedValue({
      id: "inv-new",
      workspaceId: "ws1",
      email: null,
      role: "MEMBER",
      token: "abc123",
      expiresAt: new Date().toISOString(),
      maxUses: 10,
      createdAt: new Date().toISOString(),
    });
    render(<WorkspaceInvitesSection workspaceId="ws1" accessToken="tok" canManage />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Create invite link/i }));

    await waitFor(() => {
      expect(createWorkspaceInvite).toHaveBeenCalledWith("tok", "ws1", {
        role: "MEMBER",
        maxUses: 10,
      });
    });
    await waitFor(() => {
      expect(screen.getByDisplayValue(/\/invites\/abc123/)).toBeInTheDocument();
    });
  });

  it("creates a targeted invite by email", async () => {
    vi.mocked(createWorkspaceInvite).mockResolvedValue({
      id: "inv-new",
      workspaceId: "ws1",
      email: "bob@example.com",
      role: "ADMIN",
      token: "tok456",
      expiresAt: new Date().toISOString(),
      maxUses: null,
      createdAt: new Date().toISOString(),
    });
    render(<WorkspaceInvitesSection workspaceId="ws1" accessToken="tok" canManage />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Targeted invite/i }));
    await user.type(screen.getByPlaceholderText(/Invite by email or username/i), "bob@example.com");
    await user.click(screen.getByRole("button", { name: /Add member/i }));

    await waitFor(() => {
      expect(createWorkspaceInvite).toHaveBeenCalledWith("tok", "ws1", {
        email: "bob@example.com",
        role: "MEMBER",
      });
    });
  });

  it("revokes an active invite", async () => {
    vi.mocked(listWorkspaceInvites).mockResolvedValue([mockPublicInvite]);
    vi.mocked(revokeWorkspaceInvite).mockResolvedValue({ id: mockPublicInvite.id, deletedAt: new Date().toISOString() });
    render(<WorkspaceInvitesSection workspaceId="ws1" accessToken="tok" canManage />);

    const user = userEvent.setup();
    await waitFor(() => {
      expect(screen.getByText("Revoke")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Revoke"));

    await waitFor(() => {
      expect(revokeWorkspaceInvite).toHaveBeenCalledWith("tok", "ws1", mockPublicInvite.id);
    });
  });

  it("shows permission error on 403", async () => {
    vi.mocked(listWorkspaceInvites).mockRejectedValue(new Error("403 Forbidden"));
    render(<WorkspaceInvitesSection workspaceId="ws1" accessToken="tok" canManage />);

    await waitFor(() => {
      expect(screen.getByText(/You don’t have permission to manage invites/i)).toBeInTheDocument();
    });
  });

  it("shows empty state when no invites", async () => {
    vi.mocked(listWorkspaceInvites).mockResolvedValue([]);
    render(<WorkspaceInvitesSection workspaceId="ws1" accessToken="tok" canManage />);

    await waitFor(() => {
      expect(screen.getByText(/No invites yet/i)).toBeInTheDocument();
    });
  });
});
