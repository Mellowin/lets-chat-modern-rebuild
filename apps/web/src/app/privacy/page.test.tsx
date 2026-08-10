import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import PrivacyPage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("PrivacyPage", () => {
  it("renders the privacy title and sections", () => {
    render(<PrivacyPage />);
    expect(screen.getByRole("heading", { name: /privacy notice/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Account data/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Account deletion/i })).toBeInTheDocument();
  });
});
