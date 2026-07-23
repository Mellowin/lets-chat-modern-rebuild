import { getApiBase } from "./env";
import { authFetch } from "./auth-fetch";
import { getWorkspaces } from "./workspaces-api";
import { getChannels, type Channel } from "./channels-api";
import { listDirectConversations, type DirectConversation } from "./direct-conversations-api";
import { listGroups } from "./groups-api";

const API_BASE = getApiBase();

export type ForwardSourceType = "channel" | "direct" | "group";
export type ForwardDestinationType = "channel" | "direct" | "group";

export interface ForwardMessageInput {
  sourceType: ForwardSourceType;
  sourceMessageId: string;
  destinationType: ForwardDestinationType;
  destinationId: string;
  comment?: string;
}

export interface ForwardDestinationChannel {
  type: "channel";
  id: string;
  workspaceId: string;
  workspaceName: string;
  name: string;
  channelType: "PUBLIC" | "PRIVATE";
}

export interface ForwardDestinationDirect {
  type: "direct";
  id: string;
  otherParticipant: DirectConversation["otherParticipant"];
}

export interface ForwardDestinationGroup {
  type: "group";
  id: string;
  name: string;
}

export type ForwardDestination =
  | ForwardDestinationChannel
  | ForwardDestinationDirect
  | ForwardDestinationGroup;

export interface ForwardTargets {
  channels: ForwardDestinationChannel[];
  directs: ForwardDestinationDirect[];
  groups: ForwardDestinationGroup[];
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

export async function forwardMessage(
  accessToken: string,
  input: ForwardMessageInput,
): Promise<void> {
  const res = await authFetch(`${API_BASE}/messages/forward`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to forward message: ${res.status} ${res.statusText}`));
  }
}

export async function loadForwardTargets(accessToken: string): Promise<ForwardTargets> {
  const [workspaces, directs, groups] = await Promise.all([
    getWorkspaces(accessToken),
    listDirectConversations(accessToken),
    listGroups(accessToken),
  ]);

  const workspaceChannels = await Promise.all(
    workspaces.map(async (workspace) => {
      try {
        const channels = await getChannels(accessToken, workspace.id);
        return { workspace, channels };
      } catch {
        return { workspace, channels: [] as Channel[] };
      }
    }),
  );

  const channels: ForwardDestinationChannel[] = workspaceChannels.flatMap(({ workspace, channels: chs }) =>
    chs.map((channel) => ({
      type: "channel" as const,
      id: channel.id,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      name: channel.name,
      channelType: channel.type,
    })),
  );

  return {
    channels,
    directs: directs.map((conversation) => ({
      type: "direct" as const,
      id: conversation.id,
      otherParticipant: conversation.otherParticipant,
    })),
    groups: groups.map((group) => ({
      type: "group" as const,
      id: group.id,
      name: group.name,
    })),
  };
}
