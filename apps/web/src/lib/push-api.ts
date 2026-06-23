import { getApiBase } from "./env";
import { authFetch } from "./auth-fetch";

const API_BASE = getApiBase();

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionJson {
  endpoint: string;
  keys: PushSubscriptionKeys;
}

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  let message = fallback;
  try {
    const body = await res.json();
    if (body?.message) message = body.message;
    else if (body?.error) message = body.error;
  } catch {
    // ignore parse error
  }
  return message;
}

export async function getVapidPublicKey(): Promise<string> {
  const fromEnv = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (fromEnv) return fromEnv;

  const res = await authFetch(`${API_BASE}/push/vapid-public-key`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(
      await parseErrorMessage(res, `Failed to load VAPID key: ${res.status} ${res.statusText}`),
    );
  }

  const data = (await res.json()) as { publicKey: string };
  return data.publicKey;
}

export async function subscribePush(
  accessToken: string,
  subscription: PushSubscriptionJson,
): Promise<void> {
  const res = await authFetch(`${API_BASE}/push/subscribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(subscription),
  });

  if (!res.ok) {
    throw new Error(
      await parseErrorMessage(res, `Failed to subscribe: ${res.status} ${res.statusText}`),
    );
  }
}

export async function unsubscribePush(
  accessToken: string,
  endpoint: string,
): Promise<void> {
  const res = await authFetch(`${API_BASE}/push/unsubscribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ endpoint }),
  });

  if (!res.ok) {
    throw new Error(
      await parseErrorMessage(res, `Failed to unsubscribe: ${res.status} ${res.statusText}`),
    );
  }
}
