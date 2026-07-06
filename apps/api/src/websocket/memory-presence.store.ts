import { Injectable } from '@nestjs/common';
import {
  PresenceStore,
  PresenceStoreDiagnostics,
  PresenceStoreMode,
} from './presence-store.interface';

@Injectable()
export class MemoryPresenceStore implements PresenceStore {
  readonly mode: PresenceStoreMode = 'memory';

  private readonly userSockets = new Map<string, Set<string>>();

  markSocketConnected(userId: string, socketId: string): Promise<void> {
    let sockets = this.userSockets.get(userId);
    if (!sockets) {
      sockets = new Set();
      this.userSockets.set(userId, sockets);
    }
    sockets.add(socketId);
    return Promise.resolve();
  }

  markSocketDisconnected(userId: string, socketId: string): Promise<void> {
    const sockets = this.userSockets.get(userId);
    if (!sockets) {
      return Promise.resolve();
    }
    sockets.delete(socketId);
    if (sockets.size === 0) {
      this.userSockets.delete(userId);
    }
    return Promise.resolve();
  }

  getUserSocketIds(userId: string): Promise<string[]> {
    const sockets = this.userSockets.get(userId);
    return Promise.resolve(sockets ? Array.from(sockets) : []);
  }

  isUserOnline(userId: string): Promise<boolean> {
    const sockets = this.userSockets.get(userId);
    return Promise.resolve(!!sockets && sockets.size > 0);
  }

  async getOnlineUserIds(userIds: string[]): Promise<string[]> {
    const online: string[] = [];
    for (const userId of userIds) {
      if (await this.isUserOnline(userId)) {
        online.push(userId);
      }
    }
    return online;
  }

  clearSocket(socketId: string): Promise<void> {
    for (const [userId, sockets] of this.userSockets) {
      if (sockets.has(socketId)) {
        sockets.delete(socketId);
        if (sockets.size === 0) {
          this.userSockets.delete(userId);
        }
        break;
      }
    }
    return Promise.resolve();
  }

  getDiagnostics(): PresenceStoreDiagnostics {
    return {
      mode: this.mode,
      status: 'not_configured',
    };
  }
}
