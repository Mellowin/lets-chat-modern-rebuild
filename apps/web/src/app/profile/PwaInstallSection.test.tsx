import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import userEvent from "@testing-library/user-event";
import type { JSX } from "react";

function createMatchMedia(matches: boolean) {
  return vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

async function renderSection(): Promise<ReturnType<typeof render>> {
  const { PwaInstallSection } = await import("./PwaInstallSection");
  return render(<PwaInstallSection /> as JSX.Element);
}

describe("PwaInstallSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.stubGlobal("navigator", {
      serviceWorker: {},
      standalone: undefined,
    });
    vi.stubGlobal("matchMedia", createMatchMedia(false));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows unsupported message when service worker is unavailable", async () => {
    vi.stubGlobal("navigator", { serviceWorker: undefined, standalone: undefined });

    await renderSection();

    expect(screen.getByTestId("pwa-unsupported")).toBeInTheDocument();
    expect(screen.getByText(/This browser does not support PWA installation/i)).toBeInTheDocument();
  });

  it("shows installed message when running in standalone mode", async () => {
    vi.stubGlobal("matchMedia", createMatchMedia(true));

    await renderSection();

    expect(screen.getByTestId("pwa-installed")).toBeInTheDocument();
    expect(screen.getByText(/App is installed on this device/i)).toBeInTheDocument();
  });

  it("shows install button after beforeinstallprompt fires", async () => {
    await renderSection();

    const promptMock = vi.fn().mockResolvedValue(undefined);
    const userChoice = Promise.resolve({ outcome: "accepted" as const });
    const event = new Event("beforeinstallprompt", { bubbles: true, cancelable: true });
    Object.assign(event, { prompt: promptMock, userChoice });

    fireEvent(window, event);

    await waitFor(() => {
      expect(screen.getByTestId("pwa-install-button")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("pwa-install-button"));

    await waitFor(() => {
      expect(promptMock).toHaveBeenCalled();
    });
  });

  it("shows manual instructions when no install prompt is available", async () => {
    await renderSection();

    expect(screen.getByTestId("pwa-manual-instructions")).toBeInTheDocument();
    expect(screen.getByText(/Open the browser menu/i)).toBeInTheDocument();
  });

  it("shows dismissed message when user declines install prompt", async () => {
    await renderSection();

    const promptMock = vi.fn().mockResolvedValue(undefined);
    const userChoice = Promise.resolve({ outcome: "dismissed" as const });
    const event = new Event("beforeinstallprompt", { bubbles: true, cancelable: true });
    Object.assign(event, { prompt: promptMock, userChoice });

    fireEvent(window, event);

    await waitFor(() => {
      expect(screen.getByTestId("pwa-install-button")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("pwa-install-button"));

    await waitFor(() => {
      expect(screen.getByText(/Installation dismissed/i)).toBeInTheDocument();
    });
  });
});
