import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotificationPreferencesSection } from "./NotificationPreferencesSection";

const mockGetNotificationPreferences = vi.fn();
const mockUpdateNotificationPreferences = vi.fn();

vi.mock("@/lib/auth-api", () => ({
  getNotificationPreferences: (...args: unknown[]) => mockGetNotificationPreferences(...args),
  updateNotificationPreferences: (...args: unknown[]) => mockUpdateNotificationPreferences(...args),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ accessToken: "token" }),
}));

vi.mock("@/lib/locale", () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));

describe("NotificationPreferencesSection", () => {
  beforeEach(() => {
    mockGetNotificationPreferences.mockReset();
    mockUpdateNotificationPreferences.mockReset();
  });

  it("loads and displays notification preferences", async () => {
    mockGetNotificationPreferences.mockResolvedValue({
      pushNotificationsEnabled: true,
      mentionNotificationsEnabled: false,
      directMessageNotificationsEnabled: true,
      groupMessageNotificationsEnabled: true,
      channelMessageNotificationsEnabled: true,
    });

    render(<NotificationPreferencesSection />);

    await waitFor(() => {
      expect(screen.getByTestId("notification-preference-mentionNotificationsEnabled")).toBeInTheDocument();
    });

    expect(mockGetNotificationPreferences).toHaveBeenCalledWith("token");
  });

  it("calls update API when a toggle is clicked", async () => {
    mockGetNotificationPreferences.mockResolvedValue({
      pushNotificationsEnabled: true,
      mentionNotificationsEnabled: true,
      directMessageNotificationsEnabled: true,
      groupMessageNotificationsEnabled: true,
      channelMessageNotificationsEnabled: true,
    });
    mockUpdateNotificationPreferences.mockResolvedValue({
      pushNotificationsEnabled: false,
      mentionNotificationsEnabled: true,
      directMessageNotificationsEnabled: true,
      groupMessageNotificationsEnabled: true,
      channelMessageNotificationsEnabled: true,
    });

    render(<NotificationPreferencesSection />);

    await waitFor(() => {
      expect(screen.getByTestId("notification-preference-switch-pushNotificationsEnabled")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("notification-preference-switch-pushNotificationsEnabled"));

    await waitFor(() => {
      expect(mockUpdateNotificationPreferences).toHaveBeenCalledWith("token", { pushNotificationsEnabled: false });
    });
  });

  it("displays an error when loading fails", async () => {
    mockGetNotificationPreferences.mockRejectedValue(new Error("Load failed"));

    render(<NotificationPreferencesSection />);

    await waitFor(() => {
      expect(screen.getByText("Load failed")).toBeInTheDocument();
    });
  });
});
