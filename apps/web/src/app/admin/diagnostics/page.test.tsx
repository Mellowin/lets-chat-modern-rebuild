import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminDiagnosticsPage from "./page";
import { useAuth } from "@/lib/auth-context";
import {
  getAdminDiagnosticsHealth,
  getAdminDiagnosticsConfig,
} from "@/lib/safety-api";

vi.mock("@/lib/auth-context", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/lib/safety-api", () => ({
  getAdminDiagnosticsHealth: vi.fn(),
  getAdminDiagnosticsConfig: vi.fn(),
}));

function mockAuth(role: string | null) {
  vi.mocked(useAuth).mockReturnValue({
    user: role
      ? {
          id: "u1",
          email: "a@b.com",
          username: "alice",
          displayName: null,
          avatarUrl: null,
          avatarUpdatedAt: null,
          interfaceLanguage: "en",
          role,
          createdAt: "2024-01-01T00:00:00Z",
          pushNotificationsEnabled: true,
          mentionNotificationsEnabled: true,
          directMessageNotificationsEnabled: true,
          groupMessageNotificationsEnabled: true,
          channelMessageNotificationsEnabled: true,
      contactPrivacySetting: "EVERYONE",
        }
      : null,
    accessToken: "token",
    refreshToken: null,
    isLoading: false,
    isAuthenticated: true,
    loginSuccess: vi.fn(),
    setUser: vi.fn(),
    logout: vi.fn(),
  } as unknown as ReturnType<typeof useAuth>);
}

function makeHealth(
  status: "ok" | "degraded" = "ok",
): Awaited<ReturnType<typeof getAdminDiagnosticsHealth>> {
  return {
    status,
    timestamp: "2024-01-01T00:00:00Z",
    uptime: 123,
    environment: "test",
    version: "0.0.1",
    requestId: "req-1",
    checks: {
      api: { status: "ok" },
      database: { status: "ok" },
      redis: { status: "not_configured" },
      push: { status: "not_configured" },
      attachments: { status: "ok" },
      mail: { status: "not_configured" },
    },
  };
}

function makeConfig(): Awaited<ReturnType<typeof getAdminDiagnosticsConfig>> {
  return {
    push: false,
    pwa: true,
    attachments: true,
    email: false,
    redis: false,
    rateLimit: false,
    websocket: true,
    adminModeration: true,
    messageSearch: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AdminDiagnosticsPage", () => {
  it("renders access denied for regular users", () => {
    mockAuth("USER");
    render(<AdminDiagnosticsPage />);
    expect(screen.getByText("Access denied")).toBeInTheDocument();
  });

  it("renders loading state while auth is loading", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      accessToken: null,
      refreshToken: null,
      isLoading: true,
      isAuthenticated: false,
      loginSuccess: vi.fn(),
      setUser: vi.fn(),
      logout: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>);
    render(<AdminDiagnosticsPage />);
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders health cards and config cards for admin", async () => {
    mockAuth("ADMIN");
    vi.mocked(getAdminDiagnosticsHealth).mockResolvedValue(makeHealth());
    vi.mocked(getAdminDiagnosticsConfig).mockResolvedValue(makeConfig());

    render(<AdminDiagnosticsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("diagnostics-health-section")).toBeInTheDocument();
    });
    expect(screen.getByTestId("diagnostics-check-database")).toBeInTheDocument();
    expect(screen.getByTestId("diagnostics-config-section")).toBeInTheDocument();
    expect(screen.getByText("Message search")).toBeInTheDocument();
    expect(screen.getByText(/req-1/)).toBeInTheDocument();
  });

  it("refresh button reloads diagnostics", async () => {
    mockAuth("ADMIN");
    vi.mocked(getAdminDiagnosticsHealth).mockResolvedValue(makeHealth());
    vi.mocked(getAdminDiagnosticsConfig).mockResolvedValue(makeConfig());

    render(<AdminDiagnosticsPage />);
    await waitFor(() => {
      expect(screen.getByTestId("diagnostics-health-section")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("diagnostics-refresh-button"));

    await waitFor(() => {
      expect(getAdminDiagnosticsHealth).toHaveBeenCalledTimes(2);
    });
    expect(getAdminDiagnosticsConfig).toHaveBeenCalledTimes(2);
  });

  it("renders error state when API fails", async () => {
    mockAuth("ADMIN");
    vi.mocked(getAdminDiagnosticsHealth).mockRejectedValue(new Error("Server error"));
    vi.mocked(getAdminDiagnosticsConfig).mockRejectedValue(new Error("Server error"));

    render(<AdminDiagnosticsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("diagnostics-error")).toBeInTheDocument();
    });
  });

  it("does not render secrets in the UI", async () => {
    mockAuth("ADMIN");
    vi.mocked(getAdminDiagnosticsHealth).mockResolvedValue(makeHealth());
    vi.mocked(getAdminDiagnosticsConfig).mockResolvedValue(makeConfig());

    render(<AdminDiagnosticsPage />);
    await waitFor(() => {
      expect(screen.getByTestId("diagnostics-health-section")).toBeInTheDocument();
    });

    expect(screen.queryByText(/DATABASE_URL/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/JWT_SECRET/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/RESEND/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/S3_SECRET/i)).not.toBeInTheDocument();
  });
});
