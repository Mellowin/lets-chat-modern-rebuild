import { Injectable } from '@nestjs/common';

@Injectable()
export class PresenceService {
  private readonly userSockets = new Map<string, Set<string>>();
  private readonly socketRooms = new Map<string, Set<string>>();
  private readonly userRooms = new Map<string, Set<string>>();

  trackSocket(userId: string, socketId: string): void {
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(socketId);
  }

  untrackSocket(userId: string, socketId: string): void {
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        this.userSockets.delete(userId);
      }
    }
  }

  isUserTracked(userId: string): boolean {
    return this.userSockets.has(userId);
  }

  getUserSocketIds(userId: string): Set<string> | undefined {
    return this.userSockets.get(userId);
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

  clearSocket(socketId: string): void {
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

  hasOtherSocketInRoom(
    userId: string,
    excludeSocketId: string,
    room: string,
  ): boolean {
    const userSocketIds = this.userSockets.get(userId) ?? new Set();
    for (const otherSocketId of userSocketIds) {
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
