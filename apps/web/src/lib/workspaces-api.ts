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
  slug?: string;
}

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  joinedAt: string;
  user: { id: string; username: string; displayName?: string | null; avatarUrl?: string | null };
}

export interface AddWorkspaceMemberInput {
  identifier: string;
  role?: "MEMBER" | "ADMIN";
}

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  let message = fallback;
  try {
    const body = await res.json();
    if (Array.isArray(body?.message) && body.message.length > 0) {
      message = body.message.join("; ");
    } else if (body?.message) {
      message = body.message;
    } else if (body?.error) {
      message = body.error;
    }
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

export async function listArchivedWorkspaces(accessToken: string): Promise<Workspace[]> {
  const res = await fetch(`${API_BASE}/workspaces/archived`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to load archived workspaces: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<Workspace[]>;
}

export async function getWorkspace(accessToken: string, workspaceId: string): Promise<Workspace> {
  const res = await fetch(`${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to load workspace: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<Workspace>;
}

export async function archiveWorkspace(
  accessToken: string,
  workspaceId: string,
): Promise<{ success: boolean }> {
  const res = await fetch(
    `${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/archive`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    let message = `Failed to archive workspace: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
      else if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json() as Promise<{ success: boolean }>;
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

export async function getWorkspaceMembers(
  accessToken: string,
  workspaceId: string,
): Promise<WorkspaceMember[]> {
  const res = await fetch(
    `${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/members`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to load members: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<WorkspaceMember[]>;
}

export async function addWorkspaceMember(
  accessToken: string,
  workspaceId: string,
  input: AddWorkspaceMemberInput,
): Promise<WorkspaceMember> {
  const res = await fetch(
    `${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/members`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(input),
    },
  );

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to add member: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<WorkspaceMember>;
}

export async function leaveWorkspace(
  accessToken: string,
  workspaceId: string,
): Promise<{ success: boolean }> {
  const res = await fetch(
    `${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/leave`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    let message = `Failed to leave workspace: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
      else if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json() as Promise<{ success: boolean }>;
}

export async function removeWorkspaceMember(
  accessToken: string,
  workspaceId: string,
  memberId: string,
): Promise<{ success: boolean }> {
  const res = await fetch(
    `${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(memberId)}`,
    {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    let message = `Failed to remove member: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
      else if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json() as Promise<{ success: boolean }>;
}

export async function restoreWorkspace(
  accessToken: string,
  workspaceId: string,
): Promise<Workspace> {
  const res = await fetch(
    `${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/restore`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    let message = `Failed to restore workspace: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
      else if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json() as Promise<Workspace>;
}
