import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import AdminReportsPage from "./page";
import { useAuth } from "@/lib/auth-context";
import { listAdminReports, getAdminReport, updateAdminReport } from "@/lib/safety-api";
import { createAuthUser } from "@/test/factories";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/reports",
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/lib/safety-api", () => ({
  listAdminReports: vi.fn(),
  getAdminReport: vi.fn(),
  updateAdminReport: vi.fn(),
}));

function mockAuth(userOverrides?: Partial<ReturnType<typeof useAuth>>) {
  vi.mocked(useAuth).mockReturnValue({
    user: createAuthUser({ role: "ADMIN" }),
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

const sampleReport = {
  id: "r1",
  reporterId: "u2",
  reportedUserId: "u3",
  messageId: null,
  directConversationId: null,
  groupId: null,
  reason: "spam",
  details: "Repeated spam",
  status: "OPEN" as const,
  adminNote: null,
  reviewedAt: null,
  reviewedBy: null,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  reporter: { id: "u2", username: "bob", displayName: null, avatarUrl: null },
  reportedUser: { id: "u3", username: "charlie", displayName: null, avatarUrl: null },
  reviewedByUser: null,
};

describe("AdminReportsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(listAdminReports).mockResolvedValue({ items: [sampleReport], nextCursor: null });
    vi.mocked(getAdminReport).mockResolvedValue(sampleReport);
    vi.mocked(updateAdminReport).mockResolvedValue({ ...sampleReport, status: "REVIEWED" as const, adminNote: "note", reviewedAt: "2024-01-02T00:00:00Z", reviewedBy: "u1" });
  });

  it("shows access denied for non-admin users", () => {
    mockAuth({ user: createAuthUser({ role: "USER" }) });
    render(<AdminReportsPage />);
    expect(screen.getByText(/Access denied/i)).toBeInTheDocument();
  });

  it("renders report list and status filter", async () => {
    mockAuth();
    render(<AdminReportsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("admin-report-card-r1")).toBeInTheDocument();
    });

    expect(screen.getByText(/Moderation reports/i)).toBeInTheDocument();
    expect(screen.getByTestId("admin-report-status-filter")).toBeInTheDocument();
  });

  it("shows empty state when there are no reports", async () => {
    vi.mocked(listAdminReports).mockResolvedValue({ items: [], nextCursor: null });
    mockAuth();
    render(<AdminReportsPage />);

    await waitFor(() => {
      expect(screen.getByText(/No reports found/i)).toBeInTheDocument();
    });
  });

  it("shows error state when loading fails", async () => {
    vi.mocked(listAdminReports).mockRejectedValue(new Error("network error"));
    mockAuth();
    render(<AdminReportsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    });
  });

  it("displays report detail when selecting a report", async () => {
    mockAuth();
    render(<AdminReportsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("admin-report-card-r1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("admin-report-card-r1"));

    await waitFor(() => {
      expect(screen.getByText(/Report on charlie/i)).toBeInTheDocument();
    });
    expect(screen.getByTestId("admin-report-reason")).toHaveTextContent(/spam/i);
    expect(screen.getByTestId("admin-report-details")).toHaveTextContent(/Repeated spam/i);
  });

  it("updates report status and note", async () => {
    mockAuth();
    render(<AdminReportsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("admin-report-card-r1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("admin-report-card-r1"));

    await waitFor(() => {
      expect(screen.getByTestId("admin-report-note-input")).toBeInTheDocument();
    });

    await userEvent.type(screen.getByTestId("admin-report-note-input"), "note");
    await userEvent.click(screen.getByTestId("admin-report-mark-reviewed"));

    await waitFor(() => {
      expect(updateAdminReport).toHaveBeenCalledWith("token", "r1", {
        status: "REVIEWED",
        adminNote: "note",
      });
    });
  });
});
