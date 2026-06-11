import { act } from "@testing-library/react";
import { flushSync } from "react-dom";
import { vi } from "vitest";

export interface SocketMock {
  socketHandlers: Record<string, (...args: unknown[]) => void>;
  socketOnMock: ReturnType<typeof vi.fn>;
  socketOffMock: ReturnType<typeof vi.fn>;
  socketEmitMock: ReturnType<typeof vi.fn>;
  socketDisconnectMock: ReturnType<typeof vi.fn>;
  clearSocketHandlers: () => void;
}

export function createSocketMock(): SocketMock {
  const rawHandlers: Record<string, (...args: unknown[]) => void> = {};
  const offHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};
  const socketEmitMock = vi.fn();

  const socketHandlers = new Proxy(rawHandlers, {
    get(target, prop: string) {
      const val = target[prop];
      if (typeof val === "function") {
        return (...args: unknown[]) => act(() => flushSync(() => val(...args)));
      }
      return val;
    },
    set(target, prop: string, value) {
      target[prop] = value;
      return true;
    },
    deleteProperty(target, prop: string) {
      delete target[prop];
      return true;
    },
    ownKeys(target) {
      return Object.keys(target);
    },
  }) as Record<string, (...args: unknown[]) => void>;

  const socketOnMock = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    rawHandlers[event] = handler;
    if (!offHandlers[event]) offHandlers[event] = [];
    offHandlers[event].push(handler);
  });

  const socketOffMock = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    if (offHandlers[event]) {
      offHandlers[event] = offHandlers[event].filter((h) => h !== handler);
    }
    if (rawHandlers[event] === handler) {
      delete rawHandlers[event];
    }
  });

  const socketDisconnectMock = vi.fn();

  function clearSocketHandlers() {
    Object.keys(rawHandlers).forEach((k) => delete rawHandlers[k]);
    Object.keys(offHandlers).forEach((k) => delete offHandlers[k]);
  }

  return {
    socketHandlers,
    socketOnMock,
    socketOffMock,
    socketEmitMock,
    socketDisconnectMock,
    clearSocketHandlers,
  };
}
