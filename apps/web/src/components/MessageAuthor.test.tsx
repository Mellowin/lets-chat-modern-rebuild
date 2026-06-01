import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { MessageAuthor } from "./MessageAuthor";

beforeEach(() => {
  localStorage.clear();
});

describe("MessageAuthor", () => {
  it("shows displayName when available", () => {
    render(
      <MessageAuthor
        author={{ id: "u1", username: "alice", displayName: "Alice Smith", avatarUrl: null }}
      />,
    );
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
  });

  it("falls back to username when displayName is null", () => {
    render(
      <MessageAuthor
        author={{ id: "u1", username: "alice", displayName: null, avatarUrl: null }}
      />,
    );
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.queryByText("Unknown user")).not.toBeInTheDocument();
  });

  it("shows 'Unknown user' when both displayName and username are missing", () => {
    render(
      <MessageAuthor
        author={{ id: "u1", username: "", displayName: null, avatarUrl: null }}
      />,
    );
    expect(screen.getByText("Unknown user")).toBeInTheDocument();
  });

  it("shows avatar image when avatarUrl exists", () => {
    render(
      <MessageAuthor
        author={{ id: "u1", username: "alice", displayName: "Alice", avatarUrl: "/uploads/avatars/u1/test.png" }}
      />,
    );
    expect(document.querySelector("img")).toBeInTheDocument();
  });

  it("shows fallback initials from displayName when avatarUrl is null", () => {
    render(
      <MessageAuthor
        author={{ id: "u1", username: "alice", displayName: "Alice", avatarUrl: null }}
      />,
    );
    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("shows fallback initials from username when displayName and avatarUrl are null", () => {
    render(
      <MessageAuthor
        author={{ id: "u1", username: "alice", displayName: null, avatarUrl: null }}
      />,
    );
    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("shows '?' fallback when all fields are empty", () => {
    render(
      <MessageAuthor
        author={{ id: "u1", username: "", displayName: null, avatarUrl: null }}
      />,
    );
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("shows Ukrainian 'Unknown user' fallback when displayName and username are missing", () => {
    localStorage.setItem("lets-chat:locale", "uk");
    render(
      <MessageAuthor
        author={{ id: "u1", username: "", displayName: null, avatarUrl: null }}
      />,
    );
    expect(screen.getByText("Невідомий користувач")).toBeInTheDocument();
  });

  it("shows Russian 'Unknown user' fallback when displayName and username are missing", () => {
    localStorage.setItem("lets-chat:locale", "ru");
    render(
      <MessageAuthor
        author={{ id: "u1", username: "", displayName: null, avatarUrl: null }}
      />,
    );
    expect(screen.getByText("Неизвестный пользователь")).toBeInTheDocument();
  });
});
