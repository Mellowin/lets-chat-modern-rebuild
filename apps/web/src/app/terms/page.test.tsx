import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import TermsPage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("TermsPage", () => {
  it("renders the terms title", () => {
    render(<TermsPage />);
    expect(screen.getByRole("heading", { name: /terms of use/i })).toBeInTheDocument();
  });
});
