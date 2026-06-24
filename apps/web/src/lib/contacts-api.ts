import { getApiBase } from "./env";
import { authFetch } from "./auth-fetch";

const API_BASE = getApiBase();

export interface Contact {
  id: string;
  ownerUserId: string;
  contactUserId: string;
  nickname: string | null;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContactInput {
  userId?: string;
  email?: string;
  username?: string;
  nickname?: string;
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

function authHeaders(accessToken: string) {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
}

export async function listContacts(accessToken: string): Promise<Contact[]> {
  const res = await authFetch(`${API_BASE}/contacts`, {
    method: "GET",
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to load contacts: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<Contact[]>;
}

export async function addContact(
  accessToken: string,
  input: CreateContactInput,
): Promise<Contact> {
  const res = await authFetch(`${API_BASE}/contacts`, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to add contact: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<Contact>;
}

export async function removeContact(
  accessToken: string,
  contactUserId: string,
): Promise<{ success: true }> {
  const res = await authFetch(
    `${API_BASE}/contacts/${encodeURIComponent(contactUserId)}`,
    {
      method: "DELETE",
      headers: authHeaders(accessToken),
    },
  );

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to remove contact: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<{ success: true }>;
}

export async function startDmFromContact(
  accessToken: string,
  contactUserId: string,
): Promise<{
  id: string;
  otherParticipant: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  } | null;
}> {
  const res = await authFetch(
    `${API_BASE}/contacts/${encodeURIComponent(contactUserId)}/start-dm`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
    },
  );

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to start chat: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<{
    id: string;
    otherParticipant: {
      id: string;
      username: string;
      displayName: string | null;
      avatarUrl: string | null;
    } | null;
  }>;
}
