import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MessageContent } from "./MessageContent";

describe("MessageContent", () => {
  it("renders plain text without mentions", () => {
    render(<MessageContent content="Hello world" />);
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("highlights resolved mentions", () => {
    render(
      <MessageContent
        content="Hello @alice and @bob"
        mentions={[{ userId: "u1", username: "alice" }]}
      />,
    );

    expect(screen.getByTestId("mention-alice")).toHaveTextContent("@alice");
    expect(screen.queryByTestId("mention-bob")).not.toBeInTheDocument();
    expect(document.body.textContent).toContain("and @bob");
  });

  it("ignores @ tokens that are not valid usernames", () => {
    render(<MessageContent content="Hello @alice! How are you?" mentions={[{ userId: "u1", username: "alice" }]} />);
    expect(screen.getByTestId("mention-alice")).toHaveTextContent("@alice");
    expect(screen.getByText("! How are you?")).toBeInTheDocument();
  });

  it("handles mentions at the start and end of content", () => {
    render(
      <MessageContent
        content="@alice hello @bob"
        mentions={[
          { userId: "u1", username: "alice" },
          { userId: "u2", username: "bob" },
        ]}
      />,
    );

    expect(screen.getByTestId("mention-alice")).toBeInTheDocument();
    expect(screen.getByTestId("mention-bob")).toBeInTheDocument();
  });

  it("deduplicates repeated mentions of the same user", () => {
    render(
      <MessageContent
        content="@alice @alice"
        mentions={[{ userId: "u1", username: "alice" }]}
      />,
    );

    expect(screen.getAllByTestId("mention-alice")).toHaveLength(2);
  });
});
