const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";

export interface Channel {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description: string | null;
  type: "PUBLIC" | "PRIVATE";
  createdById: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export async function getChannels(
  accessToken: string,
  workspaceId: string,
): Promise<Channel[]> {
  const res = await fetch(
    `${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/channels`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    let message = `Failed to load channels: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
      else if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json() as Promise<Channel[]>;
}
