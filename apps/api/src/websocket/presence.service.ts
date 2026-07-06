import { Injectable, Inject } from '@nestjs/common';
import type {
  PresenceStore,
  PresenceStoreDiagnostics,
} from './presence-store.interface';
import { PRESENCE_STORE } from './presence-store.provider';

@Injectable()
export class PresenceService {
  private readonly socketRooms = new Map<string, Set<string>>();
  private readonly userRooms = new Map<string, Set<string>>();

  constructor(@Inject(PRESENCE_STORE) private readonly store: PresenceStore) {}

  async trackSocket(userId: string, socketId: string): Promise<void> {
    await this.store.markSocketConnected(userId, socketId);
  }

  async untrackSocket(userId: string, socketId: string): Promise<void> {
    await this.store.markSocketDisconnected(userId, socketId);
  }

  async isUserTracked(userId: string): Promise<boolean> {
    return this.store.isUserOnline(userId);
  }

  async getUserSocketIds(userId: string): Promise<string[]> {
    return this.store.getUserSocketIds(userId);
  }

  async getOnlineUserIds(userIds: string[]): Promise<string[]> {
    return this.store.getOnlineUserIds(userIds);
  }

  async clearPresence(socketId: string): Promise<void> {
    await this.store.clearSocket(socketId);
  }

  getDiagnostics(): PresenceStoreDiagnostics {
    return this.store.getDiagnostics();
  }

  addSocketRoom(socketId: string, room: string): void {
    if (!this.socketRooms.has(socketId)) {
      this.socketRooms.set(socketId, new Set());
    }
    this.socketRooms.get(socketId)!.add(room);
  }

  removeSocketRoom(socketId: string, room: string): void {
    const rooms = this.socketRooms.get(socketId);
    if (rooms) {
      rooms.delete(room);
      if (rooms.size === 0) {
        this.socketRooms.delete(socketId);
      }
    }
  }

  getSocketRooms(socketId: string): Set<string> {
    return this.socketRooms.get(socketId) ?? new Set();
  }

  hasSocketRoom(socketId: string, room: string): boolean {
    return this.socketRooms.get(socketId)?.has(room) ?? false;
  }

  clearSocketRooms(socketId: string): void {
    this.socketRooms.delete(socketId);
  }

  addUserRoom(userId: string, room: string): void {
    if (!this.userRooms.has(userId)) {
      this.userRooms.set(userId, new Set());
    }
    this.userRooms.get(userId)!.add(room);
  }

  removeUserRoom(userId: string, room: string): void {
    this.userRooms.get(userId)?.delete(room);
  }

  getUserRooms(userId: string): Set<string> {
    return this.userRooms.get(userId) ?? new Set();
  }

  clearUserRooms(userId: string): void {
    this.userRooms.delete(userId);
  }

  async hasOtherSocketInRoom(
    userId: string,
    excludeSocketId: string,
    room: string,
  ): Promise<boolean> {
    const socketIds = await this.getUserSocketIds(userId);
    for (const otherSocketId of socketIds) {
      if (
        otherSocketId !== excludeSocketId &&
        this.socketRooms.get(otherSocketId)?.has(room)
      ) {
        return true;
      }
    }
    return false;
  }
}
