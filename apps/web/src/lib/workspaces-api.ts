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

export interface CreateWorkspaceInput {
  name: string;
  slug: string;
}

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  let message = fallback;
  try {
    const body = await res.json();
    if (body?.message) message = body.message;
    else if (body?.error) message = body.error;
  } catch {
    // ignore
  }
  return message;
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
    throw new Error(await parseErrorMessage(res, `Failed to load workspaces: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<Workspace[]>;
}

export async function createWorkspace(
  accessToken: string,
  input: CreateWorkspaceInput,
): Promise<Workspace> {
  const res = await fetch(`${API_BASE}/workspaces`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to create workspace: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<Workspace>;
}
