export const GLOBAL_UNREAD_CHANGED_EVENT = "global-unread:changed";

export interface GlobalUnreadPayload {
  total: number;
}

export function dispatchGlobalUnread(total: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<GlobalUnreadPayload>(GLOBAL_UNREAD_CHANGED_EVENT, {
      detail: { total },
    }),
  );
}

export const BASE_TITLE = "lets-chat";

export function updateDocumentTitle(unreadTotal: number) {
  if (typeof document === "undefined") return;
  if (unreadTotal > 0) {
    document.title = `(${unreadTotal > 99 ? "99+" : unreadTotal}) ${BASE_TITLE}`;
  } else {
    document.title = BASE_TITLE;
  }
}
