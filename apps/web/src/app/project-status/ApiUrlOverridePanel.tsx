"use client";

import { useSyncExternalStore } from "react";
import { getApiBase, getWsUrl } from "@/lib/env";

const LS_API_KEY = "letsChatApiUrl";
const LS_WS_KEY = "letsChatWsUrl";

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function getHasOverride() {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return Boolean(
      window.localStorage.getItem(LS_API_KEY) ||
        window.localStorage.getItem(LS_WS_KEY),
    );
  } catch {
    return false;
  }
}

function useHasApiOverride() {
  return useSyncExternalStore(
    () => () => {},
    getHasOverride,
    () => false,
  );
}

export default function ApiUrlOverridePanel() {
  const isClient = useIsClient();
  const hasOverride = useHasApiOverride();

  const resetOverride = () => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.removeItem(LS_API_KEY);
      window.localStorage.removeItem(LS_WS_KEY);
      window.location.reload();
    } catch {
      // Ignore storage errors.
    }
  };

  if (!isClient) {
    return null;
  }

  if (process.env.NODE_ENV !== "development" && !hasOverride) {
    return null;
  }

  const apiUrl = getApiBase();
  const wsUrl = getWsUrl();

  return (
    <div className="rounded-lg border border-dashed border-amber-500/50 bg-amber-50 p-4 dark:bg-amber-950/20">
      <h3 className="mb-2 text-sm font-semibold text-amber-800 dark:text-amber-200">
        Developer API override
      </h3>
      <div className="space-y-1 text-xs text-amber-900/80 dark:text-amber-100/80">
        <p>
          API base:{" "}
          <code className="rounded bg-white/50 px-1 py-0.5 font-mono dark:bg-black/20">
            {apiUrl}
          </code>
        </p>
        <p>
          WebSocket:{" "}
          <code className="rounded bg-white/50 px-1 py-0.5 font-mono dark:bg-black/20">
            {wsUrl}
          </code>
        </p>
      </div>
      {hasOverride && (
        <button
          type="button"
          onClick={resetOverride}
          className="mt-3 inline-flex items-center rounded-md border border-amber-600/30 bg-white px-2.5 py-1.5 text-xs font-medium text-amber-800 shadow-sm hover:bg-amber-100 dark:border-amber-400/30 dark:bg-black/20 dark:text-amber-100 dark:hover:bg-amber-900/40"
          data-testid="reset-api-override"
        >
          Reset override and reload
        </button>
      )}
    </div>
  );
}
