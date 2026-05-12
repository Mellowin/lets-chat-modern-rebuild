# Permission System Specification

> **Project:** lets-chat Modern Rebuild — Secure Team Collaboration Platform  
> **Scope:** MVP (v1.0)  
> **Date:** 2026-05-11  
> **Status:** Draft — locked after database-schema.md review  

---

## 1. Role Definitions

Roles are hierarchical and scoped per workspace. There is no global platform-level admin in the MVP.

| Role | Scope | Definition |
|------|-------|------------|
| `OWNER` | Workspace | Full control. Created the workspace. Cannot be deleted by another user. Only one per workspace at any time. Can transfer ownership to an ADMIN. |
| `ADMIN` | Workspace | Operational control. Can manage members, channels, settings, and audit logs. Cannot delete the workspace or transfer ownership. |
| `MEMBER` | Workspace | Standard participant. Can create channels, send messages, and invite others to channels they own. Cannot manage workspace-level settings or other members’ roles. |

### 1.1 Channel-Level Roles
Channel roles are explicit grants stored in `ChannelMember`. They are **evaluated** in combination with the user’s workspace role (see §3 Inheritance).

| Role | Scope | Definition |
|------|-------|------------|
| `OWNER` | Channel | Creator of the channel. Can archive the channel, add/remove members, and moderate messages. A workspace OWNER or ADMIN always acts as an effective channel OWNER regardless of explicit record. |
| `ADMIN` | Channel | Elevated channel participant. Can moderate messages and manage membership. Granted explicitly by a workspace OWNER/ADMIN or channel OWNER. |
| `MEMBER` | Channel | Participant with read/write access. Granted by joining (public) or being invited (private). |

---

## 2. Permission Matrix

### Legend
- **Y** = Allowed
- **N** = Denied
- **Self** = Allowed only for the user’s own resources
- **Own** = Allowed for resources the user owns
- **All** = Allowed for all resources in scope

### 2.1 Workspace Permissions

| Permission | OWNER | ADMIN | MEMBER | Notes |
|------------|:-----:|:-----:|:------:|-------|
| `workspace:read` | Y | Y | Y | View workspace name, slug, settings. |
| `workspace:update` | Y | Y | N | Rename, change slug, update description. |
| `workspace:archive` | Y | N | N | Soft-delete workspace (`deletedAt`). Irreversible from UI in MVP. |
| `workspace:settings:read` | Y | Y | N | View invite links, rate-limit configs. |
| `workspace:settings:update` | Y | Y | N | Modify settings. |
| `workspace:invite:create` | Y | Y | N | Generate invite links. Email delivery is out of MVP; invite tokens can be copied manually. |
| `workspace:invite:revoke` | Y | Y | N | Revoke pending invites. |
| `workspace:leave` | N | Y | Y | OWNER cannot leave; must transfer ownership first. |
| `workspace:member:list` | Y | Y | Y | List all members with roles. |
| `workspace:member:remove` | Y | Y | N | Remove any member except OWNER. |
| `workspace:member:role:update` | Y | N | N | Promote/demote between ADMIN and MEMBER. |
| `workspace:channel:create` | Y | Y | Y | All workspace members can create channels. |
| `workspace:audit-log:read` | Y | Y | N | Immutable audit trail (§4.6). |

### 2.2 Channel Permissions

Evaluated against **effective channel role** (workspace role + explicit channel role). See §3.

| Permission | OWNER | ADMIN | MEMBER | Notes |
|------------|:-----:|:-----:|:------:|-------|
| `channel:read` | Y | Y | Y* | *Public: all workspace members. Private: explicit members only. |
| `channel:join` | Y | Y | Y* | *Public: auto-join. Private: requires invite or approval. |
| `channel:create` | Y | Y | Y | Workspace-level gate (see 2.1). |
| `channel:update` | All | All | Own | Rename, description. `type` and `slug` are immutable in MVP (see `decisions.md` D6). |
| `channel:archive` | All | All | Own | Soft-delete channel (`deletedAt`). |
| `channel:members:add` | All | All | Own | Add workspace members to channel. |
| `channel:members:remove` | All | All | Own | Remove members from channel. Cannot remove workspace OWNER. |
| `channel:members:list` | All | All | Y | Private: members only. Public: all workspace members. |
| `channel:typing:send` | Y | Y | Y | Send typing indicator events. |

### 2.3 Message Permissions

| Permission | OWNER | ADMIN | MEMBER | Notes |
|------------|:-----:|:-----:|:------:|-------|
| `message:create` | Y | Y | Y | Must pass `channel:read`. |
| `message:read` | Y | Y | Y | Must pass `channel:read`. |
| `message:update` | All | All | Self | Self = author only. 15-minute edit window enforced in service layer. Admins can moderate via soft delete, not edit. |
| `message:delete` | All | All | Self | Soft delete (`deletedAt`). Preserves audit trail. |
| `message:react` | Y | Y | Y | Toggle emoji reaction on any message in readable channel. |
| `message:thread:reply` | Y | Y | Y | Reply to any message in readable channel. |
| `message:search` | Y | Y | Y | Scope limited to channels the user can read. |

### 2.4 File / Attachment Permissions

| Permission | OWNER | ADMIN | MEMBER | Notes |
|------------|:-----:|:-----:|:------:|-------|
| `file:upload` | Y | Y | Y | Presigned URL request. Enforced per-channel via `message:create`. |
| `file:read` | Y | Y | Y | Access file via presigned URL. Scoped to channel membership. |
| `file:delete` | All | All | Self | Soft delete attachment metadata. Object storage cleanup async via Bull. |

### 2.5 Notification & Read Receipt Permissions

| Permission | OWNER | ADMIN | MEMBER | Notes |
|------------|:-----:|:-----:|:------:|-------|
| `notification:list` | Y | Y | Y | Own notifications only. |
| `notification:read` | Y | Y | Y | Mark own notifications as read. |
| `read-receipt:write` | Y | Y | Y | Emit read receipt for own user. |
| `read-receipt:read` | Y | Y | Y | View read receipts for messages in readable channel. |

### 2.6 Audit Log Permissions

| Permission | OWNER | ADMIN | MEMBER | Notes |
|------------|:-----:|:-----:|:------:|-------|
| `audit-log:read` | Y | Y | N | Read-only. No filters that could reveal sensitive admin actions to non-admins. |
| `audit-log:write` | N | N | N | Append-only by system. No user-facing write endpoint. |
| `audit-log:delete` | N | N | N | Immutable. No user-facing delete endpoint. |

---

## 3. Permission Inheritance Rules

### 3.1 Workspace Role is the Floor
A user’s **workspace role** sets the baseline authority across all channels in that workspace.

```
effectiveChannelRole(channel, user) =
  max(workspaceRole(user), explicitChannelRole(channel, user))
```

Where the ordering is: `OWNER > ADMIN > MEMBER > NONE`.

### 3.2 Public Channels
- All workspace members implicitly have `MEMBER` access.
- Explicit `ChannelMember` records may elevate a user to `ADMIN` or `OWNER`.
- Workspace `ADMIN` users have effective `ADMIN` in all public channels.
- Workspace `OWNER` users have effective `OWNER` in all public channels.

### 3.3 Private Channels
- No implicit access. An explicit `ChannelMember` record is required.
- Workspace `OWNER` and `ADMIN` users have **moderation override access** to all private channels. This is required for operational visibility and compliance.
- Any use of moderation override access must be **audit-logged** (action: `channel:moderation_override_used`).
- Workspace `MEMBER` users with no explicit record have `NONE` (no access).

### 3.4 Creator Inheritance
When a user creates a channel:
1. A `ChannelMember` record is created with `role = OWNER`.
2. The creator’s effective role in that channel is `OWNER`.
3. If the creator is a workspace MEMBER, they gain OWNER-level control over that specific channel for member management and archiving, but remain a MEMBER for workspace-level actions.

### 3.5 Transfer Scenarios
- **Workspace ownership transfer:** Existing OWNER demotes self to ADMIN, promotes target user to OWNER. Atomic transaction; audit log entry for both changes.
- **Channel ownership transfer:** Channel OWNER (explicit) can transfer channel ownership to another channel member. Workspace OWNER/ADMIN can also reassign channel ownership.

---

## 4. Special Cases

### 4.1 Workspace Owner vs Channel Owner
A workspace OWNER outranks a channel OWNER for destructive actions:
- Workspace OWNER can archive any channel.
- Workspace OWNER can remove any member from any channel.
- Workspace OWNER can delete (soft) any message in any channel.
- Channel OWNER cannot modify workspace settings or remove the workspace OWNER from the channel.

### 4.2 Self-Protection Rules
- A user cannot remove themselves from a workspace. MEMBERs must use `workspace:leave`.
- A workspace OWNER cannot leave a workspace. They must transfer ownership first.
- A workspace OWNER cannot demote themselves. They must transfer ownership first.
- A user cannot change their own workspace role.

### 4.3 Last Admin Protection
- A workspace must retain at least one OWNER. API rejects deletion/transfer if it would leave the workspace ownerless.
- A channel should retain at least one explicit OWNER. If the last channel OWNER is removed, workspace OWNER/ADMIN becomes the de facto channel OWNER.

### 4.4 Message Edit Window
- Only the original author may edit a message.
- Edits are rejected after 15 minutes from `createdAt`.
- Admins cannot edit others’ messages; they can only soft-delete them.
- Edit history is stored in a separate table (see `database-schema.md`).

### 4.5 Soft Delete vs Hard Delete
- All user-facing deletions are soft (`deletedAt` timestamp).
- Hard deletes are reserved for post-MVP account-erasure workflows.
- Soft-deleted messages remain readable in audit logs; API exposes `deletedAt` to indicate deletion state.
- Soft-deleted channels are hidden from lists but accessible via direct URL for admins.

### 4.6 Audit Log Immutability
- The `AuditLog` table is append-only.
- Entries are written by the system via an `AuditService`, never directly by controllers.
- No user — including workspace OWNER — can modify or delete audit entries.
- Audit entries include: `actorId`, `action`, `entityType`, `entityId`, `workspaceId`, `metadata` (JSON), `createdAt`.

---

## 5. Guard & Decorator Naming Conventions

All authorization logic is implemented as NestJS guards and custom decorators. Controllers must remain free of imperative auth checks.

### 5.1 Decorators

| Decorator | Purpose | Usage |
|-----------|---------|-------|
| `@RequireWorkspaceRole(...roles: WorkspaceRole[])` | Enforce minimum workspace role on route handler. | `@RequireWorkspaceRole('OWNER', 'ADMIN')` |
| `@RequireChannelRole(...roles: ChannelRole[])` | Enforce minimum effective channel role. Requires `channelId` param or body field. | `@RequireChannelRole('OWNER', 'ADMIN')` |
| `@IsWorkspaceMember()` | Allow any workspace member (MEMBER+). Lightweight check before channel-specific logic. | `@IsWorkspaceMember()` |
| `@IsChannelMember()` | Allow only explicit channel members (public or private). Used for read access gates. | `@IsChannelMember()` |
| `@IsMessageAuthor()` | Allow only the original message author. Used for edit/delete endpoints. | `@IsMessageAuthor()` |
| `@CanAccessChannel()` | Composite guard: checks workspace membership + channel visibility (public/private) + explicit membership. Primary gate for channel-scoped routes. | `@CanAccessChannel()` |
| `@SkipAuth()` | Bypass auth for public health/docs endpoints. | `@SkipAuth()` |

### 5.2 Guards

| Guard Class | Implements | Logic |
|-------------|-----------|-------|
| `WorkspaceRoleGuard` | `CanActivate` | Reads `workspaceId` from params/body, fetches user’s workspace role from `WorkspaceMember`, checks against decorator roles. |
| `ChannelRoleGuard` | `CanActivate` | Reads `channelId`, computes effective channel role via `PermissionService`, checks against decorator roles. |
| `ChannelMembershipGuard` | `CanActivate` | Verifies user has a `ChannelMember` record (explicit) or channel is public. |
| `MessageAuthorGuard` | `CanActivate` | Reads `messageId`, verifies `message.authorId === user.id`. |
| `ChannelAccessGuard` | `CanActivate` | Composite: `WorkspaceMembershipGuard` + (`PublicChannelGuard` OR `ChannelMembershipGuard`). |
| `RateLimitGuard` | `CanActivate` | Redis-backed sliding window rate limiter. Separate from role guards. |

### 5.3 Permission Service Interface (Pseudo-TypeScript)

```typescript
// services/permission.service.ts
class PermissionService {
  getWorkspaceRole(userId: string, workspaceId: string): Promise<WorkspaceRole | null>;

  getExplicitChannelRole(userId: string, channelId: string): Promise<ChannelRole | null>;

  getEffectiveChannelRole(userId: string, channelId: string): Promise<ChannelRole>;

  can(userId: string, permission: Permission, context: PermissionContext): Promise<boolean>;

  // Helpers
  isWorkspaceOwner(userId: string, workspaceId: string): Promise<boolean>;
  isChannelOwner(userId: string, channelId: string): Promise<boolean>;
}
```

### 5.4 Example Controller Usage

```typescript
@Controller('api/v1/channels')
@UseGuards(JwtAuthGuard)
class ChannelController {
  @Post()
  @RequireWorkspaceRole('OWNER', 'ADMIN', 'MEMBER')
  createChannel(@Body() dto: CreateChannelDto, @User() user: UserEntity) { ... }

  @Get(':channelId')
  @CanAccessChannel()
  getChannel(@Param('channelId') channelId: string) { ... }

  @Patch(':channelId')
  @RequireChannelRole('OWNER', 'ADMIN')
  updateChannel(@Param('channelId') channelId: string, @Body() dto: UpdateChannelDto) { ... }

  @Post(':channelId/messages/:messageId/reactions')
  @CanAccessChannel()
  addReaction(...) { ... }

  @Delete(':channelId/messages/:messageId')
  @CanAccessChannel()
  deleteMessage(...) {
    // Service layer checks via PermissionService.can():
    // - author can delete their own message
    // - channel OWNER / ADMIN can moderate-delete any message
  }
}
```

> **Note:** For `message:delete`, both `@IsMessageAuthor()` and `@RequireChannelRole('OWNER', 'ADMIN')` may apply. Use `@RequireChannelRole('OWNER', 'ADMIN')` for admin moderation endpoints, or branch in the service layer using `PermissionService.can()` if the same route serves both author self-delete and admin moderation.

---

## 6. Implementation Checklist

- [ ] `WorkspaceRole` enum: `OWNER`, `ADMIN`, `MEMBER`
- [ ] `ChannelRole` enum: `OWNER`, `ADMIN`, `MEMBER`
- [ ] `PermissionService` with effective role resolution
- [ ] `WorkspaceRoleGuard` + `@RequireWorkspaceRole` decorator
- [ ] `ChannelRoleGuard` + `@RequireChannelRole` decorator
- [ ] `ChannelAccessGuard` + `@CanAccessChannel` decorator
- [ ] `MessageAuthorGuard` + `@IsMessageAuthor` decorator
- [ ] Rate limiting guard (`RateLimitGuard`) applied globally + per-route overrides
- [ ] Prisma seed script includes test users with each role
- [ ] Integration tests: each matrix row has at least one test case

---

## 7. Out of Scope (v2)

- Custom roles / granular permissions (e.g., “can pin but not archive”)
- Channel-specific roles for workspace ADMINs (e.g., demote ADMIN to MEMBER in one channel)
- Guest / external user role
- Read-only channel role
- Time-based access (temporary membership)
- IP-based restrictions
