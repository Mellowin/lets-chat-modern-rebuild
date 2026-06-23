import {
  getVapidPublicKey,
  subscribePush,
  unsubscribePush,
  type PushSubscriptionJson,
} from "./push-api";

export type PushPermissionState = NotificationPermission | "unsupported";

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function getPushPermissionState(): PushPermissionState {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0)).buffer;
}

async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  return navigator.serviceWorker.register("/service-worker.js");
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  const registration = await getServiceWorkerRegistration();
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

function toJson(subscription: PushSubscription): PushSubscriptionJson {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("Invalid push subscription");
  }
  return {
    endpoint: json.endpoint,
    keys: {
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
  };
}

export async function subscribeToPush(accessToken: string): Promise<void> {
  if (!isPushSupported()) {
    throw new Error("Push notifications are not supported in this browser.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Notification permission was denied."
        : "Notification permission was dismissed.",
    );
  }

  const [registration, publicKey] = await Promise.all([
    getServiceWorkerRegistration(),
    getVapidPublicKey(),
  ]);

  if (!registration) {
    throw new Error("Failed to register service worker.");
  }

  // Wait for the service worker to become active before subscribing. Calling
  // pushManager.subscribe on a registration without an active worker fails in
  // fresh browser profiles/incognito contexts.
  const readyRegistration = await navigator.serviceWorker.ready;
  let attempts = 0;
  while (readyRegistration.active?.state !== "activated" && attempts < 50) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    attempts++;
  }
  if (readyRegistration.active?.state !== "activated") {
    throw new Error("Service worker did not activate in time.");
  }

  const existing = await readyRegistration.pushManager.getSubscription();
  if (existing) {
    await existing.unsubscribe();
  }

  const subscription = await readyRegistration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToArrayBuffer(publicKey),
  });

  await subscribePush(accessToken, toJson(subscription));
}

export async function unsubscribeFromPush(accessToken: string): Promise<void> {
  if (!isPushSupported()) return;

  const registration = await navigator.serviceWorker.getRegistration("/service-worker.js");
  const subscription = await registration?.pushManager.getSubscription();

  if (subscription) {
    await unsubscribePush(accessToken, subscription.endpoint);
    await subscription.unsubscribe();
  }
}
