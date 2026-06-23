import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { PushNotificationsSection } from "./PushNotificationsSection";
import { useAuth } from "@/lib/auth-context";

vi.mock("@/lib/auth-context", () => ({
  useAuth: vi.fn(),
}));

const mockSubscribe = vi.fn();
const mockUnsubscribe = vi.fn();
const mockGetExisting = vi.fn();
const mockIsSupported = vi.fn();
const mockGetPermission = vi.fn();

vi.mock("@/lib/push-subscription", () => ({
  isPushSupported: () => mockIsSupported(),
  getPushPermissionState: () => mockGetPermission(),
  getExistingPushSubscription: () => mockGetExisting(),
  subscribeToPush: (token: string) => mockSubscribe(token),
  unsubscribeFromPush: (token: string) => mockUnsubscribe(token),
}));

function mockAuth(accessToken: string | null = "token") {
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    accessToken,
    refreshToken: null,
    isLoading: false,
    isAuthenticated: !!accessToken,
    loginSuccess: vi.fn(),
    setUser: vi.fn(),
    logout: vi.fn(),
  } as ReturnType<typeof useAuth>);
}

describe("PushNotificationsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSupported.mockReturnValue(true);
    mockGetPermission.mockReturnValue("default");
    mockGetExisting.mockResolvedValue(null);
    mockAuth();
  });

  it("shows unsupported message when push is not supported", async () => {
    mockIsSupported.mockReturnValue(false);

    render(<PushNotificationsSection />);

    expect(
      await screen.findByText(/Push notifications are not supported in this browser/i),
    ).toBeInTheDocument();
  });

  it("shows blocked message when notification permission is denied", async () => {
    mockGetPermission.mockReturnValue("denied");
    mockGetExisting.mockResolvedValue({ endpoint: "x" } as PushSubscription);

    render(<PushNotificationsSection />);

    expect(
      await screen.findByText(/Notifications are blocked for this site/i),
    ).toBeInTheDocument();
  });

  it("shows enable button when not subscribed", async () => {
    render(<PushNotificationsSection />);

    expect(
      await screen.findByRole("button", { name: /Enable notifications/i }),
    ).toBeInTheDocument();
  });

  it("shows disable button when already subscribed", async () => {
    mockGetExisting.mockResolvedValue({ endpoint: "https://push.example/1" } as PushSubscription);

    render(<PushNotificationsSection />);

    expect(
      await screen.findByRole("button", { name: /Disable notifications/i }),
    ).toBeInTheDocument();
  });

  it("subscribes and updates UI on success", async () => {
    mockSubscribe.mockResolvedValue(undefined);
    mockGetExisting.mockResolvedValue(null);

    render(<PushNotificationsSection />);

    const enableBtn = await screen.findByRole("button", { name: /Enable notifications/i });
    await userEvent.click(enableBtn);

    await waitFor(() => {
      expect(mockSubscribe).toHaveBeenCalledWith("token");
    });
    expect(await screen.findByText(/Push notifications enabled/i)).toBeInTheDocument();
  });

  it("shows error when subscription fails", async () => {
    mockSubscribe.mockRejectedValue(new Error("Permission denied"));

    render(<PushNotificationsSection />);

    const enableBtn = await screen.findByRole("button", { name: /Enable notifications/i });
    await userEvent.click(enableBtn);

    expect(await screen.findByText(/Permission denied/i)).toBeInTheDocument();
  });

  it("unsubscribes and updates UI on success", async () => {
    mockUnsubscribe.mockResolvedValue(undefined);
    mockGetExisting.mockResolvedValue({ endpoint: "https://push.example/1" } as PushSubscription);

    render(<PushNotificationsSection />);

    const disableBtn = await screen.findByRole("button", { name: /Disable notifications/i });
    await userEvent.click(disableBtn);

    await waitFor(() => {
      expect(mockUnsubscribe).toHaveBeenCalledWith("token");
    });
    expect(await screen.findByText(/Push notifications disabled/i)).toBeInTheDocument();
  });
});
