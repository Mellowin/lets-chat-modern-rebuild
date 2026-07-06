export type PresenceStoreMode = 'memory' | 'redis';

export type PresenceStoreStatus =
  | 'ok'
  | 'not_configured'
  | 'degraded'
  | 'error';

export interface PresenceStoreDiagnostics {
  mode: PresenceStoreMode;
  status: PresenceStoreStatus;
}

export interface PresenceStore {
  readonly mode: PresenceStoreMode;

  markSocketConnected(userId: string, socketId: string): Promise<void>;

  markSocketDisconnected(userId: string, socketId: string): Promise<void>;

  getUserSocketIds(userId: string): Promise<string[]>;

  isUserOnline(userId: string): Promise<boolean>;

  getOnlineUserIds(userIds: string[]): Promise<string[]>;

  clearSocket(socketId: string): Promise<void>;

  getDiagnostics(): PresenceStoreDiagnostics;
}
