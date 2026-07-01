import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, renderHook, act } from "@testing-library/react";
import { useMessageListScroll } from "./use-message-list-scroll";

let resizeObserverCallbacks = new Map<Element, ResizeObserverCallback>();

class MockResizeObserver {
  private callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    resizeObserverCallbacks.set(target, this.callback);
  }

  unobserve() {
    // no-op
  }

  disconnect() {
    // no-op
  }
}

function triggerResize(target: Element) {
  const cb = resizeObserverCallbacks.get(target);
  if (cb) {
    cb(
      [
        {
          target,
          contentRect: { height: (target as HTMLElement).scrollHeight } as DOMRectReadOnly,
        } as ResizeObserverEntry,
      ],
      {} as ResizeObserver,
    );
  }
}

function setScrollHeight(el: HTMLElement | null, height: number) {
  if (!el) return;
  Object.defineProperty(el, "scrollHeight", {
    configurable: true,
    get: () => height,
  });
}

function TestComponent({
  messagesLoaded,
  disabled,
}: {
  messagesLoaded: boolean;
  disabled?: boolean;
}) {
  const { scrollRef: hookScrollRef, contentRef, endRef } = useMessageListScroll({
    messagesLoaded,
    disabled,
  });

  const scrollRef = (node: HTMLDivElement | null) => {
    setScrollHeight(node, 1000);
    hookScrollRef(node);
  };

  return (
    <div
      ref={scrollRef}
      data-testid="scroll"
      style={{ height: 300, overflowY: "auto" }}
    >
      <div ref={contentRef} data-testid="content" style={{ height: 1000 }}>
        <div ref={endRef} data-testid="end" />
      </div>
    </div>
  );
}

describe("useMessageListScroll", () => {
  let scrollIntoViewMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resizeObserverCallbacks = new Map();
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    scrollIntoViewMock = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      value: scrollIntoViewMock,
      configurable: true,
      writable: true,
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    vi.useRealTimers();
    resizeObserverCallbacks = new Map();
  });

  it("scrolls to bottom when messages first load", () => {
    const { rerender } = render(<TestComponent messagesLoaded={false} />);
    expect(scrollIntoViewMock).not.toHaveBeenCalled();

    rerender(<TestComponent messagesLoaded={true} />);
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: "auto", block: "end" });
  });

  it("re-scrolls to bottom when the content wrapper resizes during the settle window", () => {
    const { rerender, getByTestId } = render(<TestComponent messagesLoaded={false} />);
    rerender(<TestComponent messagesLoaded={true} />);

    act(() => {
      vi.advanceTimersByTime(100);
    });

    const callsBefore = scrollIntoViewMock.mock.calls.length;
    const content = getByTestId("content");
    act(() => {
      triggerResize(content);
    });
    expect(scrollIntoViewMock.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it("stops auto-scrolling after the user intentionally scrolls away from bottom", () => {
    const { rerender, getByTestId } = render(<TestComponent messagesLoaded={false} />);
    rerender(<TestComponent messagesLoaded={true} />);

    act(() => {
      vi.advanceTimersByTime(800);
    });

    const scrollEl = getByTestId("scroll") as HTMLDivElement;
    act(() => {
      scrollEl.scrollTop = 0;
      scrollEl.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    scrollIntoViewMock.mockClear();
    const content = getByTestId("content");
    act(() => {
      triggerResize(content);
    });
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it("resumes auto-scrolling when the user scrolls back to the bottom", () => {
    const { rerender, getByTestId } = render(<TestComponent messagesLoaded={false} />);
    rerender(<TestComponent messagesLoaded={true} />);

    act(() => {
      vi.advanceTimersByTime(800);
    });

    const scrollEl = getByTestId("scroll") as HTMLDivElement;
    act(() => {
      scrollEl.scrollTop = 0;
      scrollEl.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    scrollIntoViewMock.mockClear();

    act(() => {
      scrollEl.scrollTop = scrollEl.scrollHeight - scrollEl.clientHeight - 50;
      scrollEl.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    const content = getByTestId("content");
    act(() => {
      triggerResize(content);
    });
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: "auto", block: "end" });
  });

  it("isNearBottom returns true when close to the bottom", () => {
    const { result } = renderHook(() => useMessageListScroll({ messagesLoaded: true }));

    const scrollEl = document.createElement("div");
    Object.defineProperty(scrollEl, "clientHeight", { value: 300 });
    Object.defineProperty(scrollEl, "scrollHeight", { value: 1000 });
    scrollEl.scrollTop = 900;

    act(() => {
      result.current.scrollRef(scrollEl);
      result.current.contentRef(document.createElement("div"));
      result.current.endRef(document.createElement("div"));
    });

    expect(result.current.isNearBottom()).toBe(true);
  });

  it("does not auto-scroll when disabled", () => {
    const { rerender } = render(<TestComponent messagesLoaded={false} disabled={true} />);
    rerender(<TestComponent messagesLoaded={true} disabled={true} />);
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });
});
