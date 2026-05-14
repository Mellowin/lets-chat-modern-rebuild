const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export async function getWorkspaces(accessToken: string): Promise<Workspace[]> {
  const res = await fetch(`${API_BASE}/workspaces`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    let message = `Failed to load workspaces: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
      else if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json() as Promise<Workspace[]>;
}
