import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Header from "./Header";
import { useAuth } from "@/lib/auth-context";

vi.mock("@/lib/auth-context", () => ({
  useAuth: vi.fn(),
}));

function mockAuth(overrides?: Partial<ReturnType<typeof useAuth>>) {
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    accessToken: null,
    refreshToken: null,
    isLoading: false,
    isAuthenticated: false,
    loginSuccess: vi.fn(),
    setUser: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useAuth>);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("Header — localization", () => {
  it("shows localized loading text in en", () => {
    localStorage.setItem("lets-chat:locale", "en");
    mockAuth({ isLoading: true });
    render(<Header />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows localized loading text in ru", () => {
    localStorage.setItem("lets-chat:locale", "ru");
    mockAuth({ isLoading: true });
    render(<Header />);
    expect(screen.getByText("Загрузка…")).toBeInTheDocument();
  });

  it("shows localized loading text in uk", () => {
    localStorage.setItem("lets-chat:locale", "uk");
    mockAuth({ isLoading: true });
    render(<Header />);
    expect(screen.getByText("Завантаження…")).toBeInTheDocument();
  });
});
