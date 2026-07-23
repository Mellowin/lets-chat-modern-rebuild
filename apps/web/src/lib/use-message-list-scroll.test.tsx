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

function setScrollMetrics(
  el: HTMLElement | null,
  { scrollHeight = 1000, clientHeight = 300 }: { scrollHeight?: number; clientHeight?: number },
) {
  if (!el) return;
  Object.defineProperty(el, "scrollHeight", {
    configurable: true,
    get: () => scrollHeight,
  });
  Object.defineProperty(el, "clientHeight", {
    configurable: true,
    get: () => clientHeight,
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
    setScrollMetrics(node, { scrollHeight: 1000, clientHeight: 300 });
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
  beforeEach(() => {
    resizeObserverCallbacks = new Map();
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    resizeObserverCallbacks = new Map();
  });

  it("scrolls to bottom when messages first load", () => {
    const { rerender, getByTestId } = render(<TestComponent messagesLoaded={false} />);
    const scrollEl = getByTestId("scroll") as HTMLDivElement;

    expect(scrollEl.scrollTop).toBe(0);

    rerender(<TestComponent messagesLoaded={true} />);

    expect(scrollEl.scrollTop).toBe(scrollEl.scrollHeight);
  });

  it("re-scrolls to bottom when the content wrapper resizes during the settle window", () => {
    const { rerender, getByTestId } = render(<TestComponent messagesLoaded={false} />);
    rerender(<TestComponent messagesLoaded={true} />);

    const scrollEl = getByTestId("scroll") as HTMLDivElement;
    const content = getByTestId("content");

    act(() => {
      vi.advanceTimersByTime(100);
    });

    scrollEl.scrollTop = 500;
    act(() => {
      triggerResize(content);
    });

    expect(scrollEl.scrollTop).toBe(scrollEl.scrollHeight);
  });

  it("stops auto-scrolling after the user intentionally scrolls away from bottom", () => {
    const { rerender, getByTestId } = render(<TestComponent messagesLoaded={false} />);
    rerender(<TestComponent messagesLoaded={true} />);

    act(() => {
      vi.advanceTimersByTime(1600);
    });

    const scrollEl = getByTestId("scroll") as HTMLDivElement;
    act(() => {
      scrollEl.scrollTop = 0;
      scrollEl.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    const content = getByTestId("content");
    act(() => {
      triggerResize(content);
    });

    expect(scrollEl.scrollTop).toBe(0);
  });

  it("resumes auto-scrolling when the user scrolls back to the bottom", () => {
    const { rerender, getByTestId } = render(<TestComponent messagesLoaded={false} />);
    rerender(<TestComponent messagesLoaded={true} />);

    act(() => {
      vi.advanceTimersByTime(1600);
    });

    const scrollEl = getByTestId("scroll") as HTMLDivElement;
    act(() => {
      scrollEl.scrollTop = 0;
      scrollEl.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    act(() => {
      scrollEl.scrollTop = scrollEl.scrollHeight - scrollEl.clientHeight - 50;
      scrollEl.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    scrollEl.scrollTop = 500;
    const content = getByTestId("content");
    act(() => {
      triggerResize(content);
    });

    expect(scrollEl.scrollTop).toBe(scrollEl.scrollHeight);
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
    const { rerender, getByTestId } = render(<TestComponent messagesLoaded={false} disabled={true} />);
    const scrollEl = getByTestId("scroll") as HTMLDivElement;

    rerender(<TestComponent messagesLoaded={true} disabled={true} />);

    expect(scrollEl.scrollTop).toBe(0);
  });

  it("scrolls to bottom when the scroll container ref is attached after messages already loaded", () => {
    const { result } = renderHook(() => useMessageListScroll({ messagesLoaded: true }));

    const scrollEl = document.createElement("div");
    Object.defineProperty(scrollEl, "clientHeight", { value: 300 });
    Object.defineProperty(scrollEl, "scrollHeight", { value: 1000 });

    act(() => {
      result.current.scrollRef(scrollEl);
    });

    expect(scrollEl.scrollTop).toBe(scrollEl.scrollHeight);
  });
});
