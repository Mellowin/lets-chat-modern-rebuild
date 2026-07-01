import { useCallback, useEffect, useRef } from "react";

export interface UseMessageListScrollOptions {
  /** True when the message list has loaded (e.g. messages.kind === "success"). */
  messagesLoaded: boolean;
  /** True when the view should not auto-scroll (e.g. search context mode). */
  disabled?: boolean;
}

export interface UseMessageListScrollResult {
  /** Attach to the overflow-y-auto scroll container. */
  scrollRef: (node: HTMLDivElement | null) => void;
  /** Attach to the inner content wrapper whose height changes as images load. */
  contentRef: (node: HTMLDivElement | null) => void;
  /** Attach to the marker element at the bottom of the message list. */
  endRef: (node: HTMLDivElement | null) => void;
  /** Scroll the bottom marker into view. */
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  /** Return true if the user is currently within ~160px of the bottom. */
  isNearBottom: () => boolean;
  /** Re-enable sticky bottom behavior (e.g. after the user sends a message). */
  stickToBottom: () => void;
  /** Disable sticky bottom behavior until the user returns to the bottom. */
  unstick: () => void;
}

const NEAR_BOTTOM_THRESHOLD_PX = 160;
const INITIAL_SETTLE_TIMEOUT_MS = 750;

/**
 * Keeps a message list anchored to the latest messages while still letting the
 * user scroll up without being pulled back down.
 *
 * Solves the common "channel opens in the middle of old images" bug by:
 *  - scrolling to bottom immediately after messages load;
 *  - re-scrolling when the inner content wrapper resizes (images loading);
 *  - during an initial settle window, tolerating layout shifts so the final
 *    position lands at the latest messages;
 *  - tracking whether the user intentionally scrolled away from the bottom, and
 *    only auto-scrolling again when they return near the bottom.
 */
export function useMessageListScroll(
  options: UseMessageListScrollOptions,
): UseMessageListScrollResult {
  const scrollNodeRef = useRef<HTMLDivElement | null>(null);
  const contentNodeRef = useRef<HTMLDivElement | null>(null);
  const endNodeRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const userScrolledUpRef = useRef(false);
  const initialScrollPendingRef = useRef(false);
  const roRef = useRef<ResizeObserver | null>(null);

  const isNearBottom = useCallback(() => {
    const el = scrollNodeRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD_PX;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    if (typeof endNodeRef.current?.scrollIntoView === "function") {
      endNodeRef.current.scrollIntoView({ behavior, block: "end" });
    }
  }, []);

  const stickToBottom = useCallback(() => {
    stickToBottomRef.current = true;
    userScrolledUpRef.current = false;
  }, []);

  const unstick = useCallback(() => {
    stickToBottomRef.current = false;
    userScrolledUpRef.current = true;
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollNodeRef.current;
    if (!el) return;

    const near = isNearBottom();
    if (near) {
      stickToBottomRef.current = true;
      userScrolledUpRef.current = false;
    } else if (!initialScrollPendingRef.current) {
      // Only treat the user as intentionally scrolled up after the initial
      // settle window has finished. This prevents a single image load from
      // immediately disabling sticky behavior before the list stabilizes.
      stickToBottomRef.current = false;
      userScrolledUpRef.current = true;
    }
  }, [isNearBottom]);

  const scrollRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (scrollNodeRef.current) {
        scrollNodeRef.current.removeEventListener("scroll", handleScroll);
      }
      scrollNodeRef.current = node;
      if (node) {
        node.addEventListener("scroll", handleScroll, { passive: true });
      }
    },
    [handleScroll],
  );

  const endRef = useCallback((node: HTMLDivElement | null) => {
    endNodeRef.current = node;
  }, []);

  const contentRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (roRef.current) {
        roRef.current.disconnect();
        roRef.current = null;
      }
      contentNodeRef.current = node;
      if (node && typeof window !== "undefined" && typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(() => {
          if (options.disabled) return;
          if (stickToBottomRef.current || initialScrollPendingRef.current) {
            scrollToBottom("auto");
          }
        });
        ro.observe(node);
        roRef.current = ro;
      }
    },
    [options.disabled, scrollToBottom],
  );

  // Reset sticky state whenever the message list is loading (e.g. channel
  // switch). This ensures a freshly opened channel always starts sticky.
  useEffect(() => {
    if (!options.messagesLoaded) {
      stickToBottomRef.current = true;
      userScrolledUpRef.current = false;
      initialScrollPendingRef.current = false;
    }
  }, [options.messagesLoaded]);

  // Scroll to bottom once messages first load, and keep re-anchoring during the
  // settle window so that image/attachment loads do not leave us in the middle
  // of the history.
  useEffect(() => {
    if (options.disabled) return;
    if (!options.messagesLoaded) return;

    stickToBottomRef.current = true;
    initialScrollPendingRef.current = true;

    // Scroll immediately, then re-check with requestAnimationFrame and several
    // timeouts to catch both synchronous layout and asynchronous image loads.
    scrollToBottom("auto");
    const rafHandle = requestAnimationFrame(() => scrollToBottom("auto"));
    const timeoutHandles: number[] = [];
    timeoutHandles.push(
      window.setTimeout(() => scrollToBottom("auto"), 50),
      window.setTimeout(() => scrollToBottom("auto"), 150),
      window.setTimeout(() => scrollToBottom("auto"), 400),
      window.setTimeout(() => {
        initialScrollPendingRef.current = false;
      }, INITIAL_SETTLE_TIMEOUT_MS),
    );

    return () => {
      cancelAnimationFrame(rafHandle);
      timeoutHandles.forEach((handle) => window.clearTimeout(handle));
    };
  }, [options.messagesLoaded, options.disabled, scrollToBottom]);

  // Clean up event listeners and ResizeObserver on unmount.
  useEffect(() => {
    return () => {
      if (scrollNodeRef.current) {
        scrollNodeRef.current.removeEventListener("scroll", handleScroll);
      }
      if (roRef.current) {
        roRef.current.disconnect();
        roRef.current = null;
      }
    };
  }, [handleScroll]);

  return {
    scrollRef,
    contentRef,
    endRef,
    scrollToBottom,
    isNearBottom,
    stickToBottom,
    unstick,
  };
}
