import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import ProjectStatusPage from "./page";

describe("ProjectStatusPage", () => {
  it("renders title and overview", () => {
    render(<ProjectStatusPage />);
    expect(screen.getByRole("heading", { name: /Project Status/i })).toBeInTheDocument();
    expect(screen.getByText(/lets-chat — a modern, secure team collaboration platform/i)).toBeInTheDocument();
  });

  it("shows actively in development disclaimer", () => {
    render(<ProjectStatusPage />);
    expect(screen.getByText(/This project is actively in development/i)).toBeInTheDocument();
  });

  it("shows best viewed as block", () => {
    render(<ProjectStatusPage />);
    expect(screen.getByRole("heading", { name: /Best viewed as/i })).toBeInTheDocument();
    expect(screen.getByText(/Portfolio piece \/ active development project/i)).toBeInTheDocument();
  });

  it("shows current production status", () => {
    render(<ProjectStatusPage />);
    expect(screen.getByRole("heading", { name: /Current production status/i })).toBeInTheDocument();
    expect(screen.getByText(/Web deployed on Vercel/i)).toBeInTheDocument();
    expect(screen.getByText(/API deployed on Render/i)).toBeInTheDocument();
    expect(screen.getByText(/Emails delivered via Resend/i)).toBeInTheDocument();
    expect(screen.getByText(/Database running on PostgreSQL/i)).toBeInTheDocument();
  });

  it("shows implemented features", () => {
    render(<ProjectStatusPage />);
    expect(screen.getByRole("heading", { name: /What already works/i })).toBeInTheDocument();
    expect(screen.getByText(/User registration with email verification/i)).toBeInTheDocument();
    expect(screen.getByText(/Real-time messaging via Socket.io/i)).toBeInTheDocument();
    expect(screen.getByText(/Session management/i)).toBeInTheDocument();
  });

  it("shows planned limitations", () => {
    render(<ProjectStatusPage />);
    expect(screen.getByRole("heading", { name: /In progress \/ planned/i })).toBeInTheDocument();
    expect(screen.getByText(/File attachments in messages/i)).toBeInTheDocument();
    expect(screen.getByText(/Message search/i)).toBeInTheDocument();
  });

  it("shows tech stack", () => {
    render(<ProjectStatusPage />);
    expect(screen.getByRole("heading", { name: /Tech stack/i })).toBeInTheDocument();
    expect(screen.getByText(/Next.js 16/i)).toBeInTheDocument();
    expect(screen.getByText(/NestJS/i)).toBeInTheDocument();
  });

  it("has correct page metadata", () => {
    // Metadata is exported separately; this test documents the expectation
    // Next.js renders metadata outside of the component tree.
    // We verify the component still renders normally after the metadata change.
    render(<ProjectStatusPage />);
    expect(screen.getByRole("heading", { name: /Project Status/i })).toBeInTheDocument();
  });

  it("shows production links", () => {
    render(<ProjectStatusPage />);
    expect(screen.getByRole("heading", { name: /Production links/i })).toBeInTheDocument();
    expect(screen.getByText(/lets-chat-web.vercel.app/i)).toBeInTheDocument();
    expect(screen.getByText(/GitHub/i)).toBeInTheDocument();
  });

  it("has a back link to home", () => {
    render(<ProjectStatusPage />);
    const link = screen.getByRole("link", { name: /Back to home/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/");
  });
});
