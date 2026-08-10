import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import AcceptableUsePage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("AcceptableUsePage", () => {
  it("renders the acceptable use title", () => {
    render(<AcceptableUsePage />);
    expect(screen.getByRole("heading", { name: /acceptable use/i })).toBeInTheDocument();
  });
});
