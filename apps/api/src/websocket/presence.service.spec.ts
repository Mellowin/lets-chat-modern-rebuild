import { PresenceService } from './presence.service';
import { MemoryPresenceStore } from './memory-presence.store';

describe('PresenceService', () => {
  let service: PresenceService;

  const userId = '11111111-1111-1111-1111-111111111111';
  const socketA = 'socket-a';
  const socketB = 'socket-b';
  const room1 = 'channel:room-1';
  const room2 = 'channel:room-2';

  beforeEach(() => {
    service = new PresenceService(new MemoryPresenceStore());
  });

  describe('trackSocket / untrackSocket', () => {
    it('should track a socket for a user', async () => {
      await service.trackSocket(userId, socketA);
      const sockets = await service.getUserSocketIds(userId);
      expect(sockets).toContain(socketA);
      expect(await service.isUserTracked(userId)).toBe(true);
    });

    it('should untrack a socket and keep other sockets', async () => {
      await service.trackSocket(userId, socketA);
      await service.trackSocket(userId, socketB);
      await service.untrackSocket(userId, socketA);

      const sockets = await service.getUserSocketIds(userId);
      expect(sockets).toContain(socketB);
      expect(sockets).not.toContain(socketA);
      expect(await service.isUserTracked(userId)).toBe(true);
    });

    it('should remove user entry when last socket untracked', async () => {
      await service.trackSocket(userId, socketA);
      await service.untrackSocket(userId, socketA);

      expect(await service.isUserTracked(userId)).toBe(false);
    });

    it('should report online users', async () => {
      await service.trackSocket(userId, socketA);
      const online = await service.getOnlineUserIds([userId, 'other-user']);
      expect(online).toEqual([userId]);
    });
  });

  describe('socketRooms', () => {
    it('should add and get socket rooms', () => {
      service.addSocketRoom(socketA, room1);
      service.addSocketRoom(socketA, room2);

      expect(service.getSocketRooms(socketA)).toContain(room1);
      expect(service.getSocketRooms(socketA)).toContain(room2);
    });

    it('should remove a socket room', () => {
      service.addSocketRoom(socketA, room1);
      service.removeSocketRoom(socketA, room1);

      expect(service.getSocketRooms(socketA).has(room1)).toBe(false);
    });

    it('should check if socket has room', () => {
      service.addSocketRoom(socketA, room1);

      expect(service.hasSocketRoom(socketA, room1)).toBe(true);
      expect(service.hasSocketRoom(socketA, room2)).toBe(false);
    });

    it('should clear all rooms for a socket', () => {
      service.addSocketRoom(socketA, room1);
      service.addSocketRoom(socketA, room2);
      service.clearSocketRooms(socketA);

      expect(service.getSocketRooms(socketA).size).toBe(0);
    });
  });

  describe('userRooms', () => {
    it('should add and get user rooms', () => {
      service.addUserRoom(userId, room1);
      service.addUserRoom(userId, room2);

      expect(service.getUserRooms(userId)).toContain(room1);
      expect(service.getUserRooms(userId)).toContain(room2);
    });

    it('should remove a user room', () => {
      service.addUserRoom(userId, room1);
      service.removeUserRoom(userId, room1);

      expect(service.getUserRooms(userId).has(room1)).toBe(false);
    });

    it('should clear all rooms for a user', () => {
      service.addUserRoom(userId, room1);
      service.clearUserRooms(userId);

      expect(service.getUserRooms(userId).size).toBe(0);
    });
  });

  describe('hasOtherSocketInRoom', () => {
    it('should return false when no other socket in room', async () => {
      await service.trackSocket(userId, socketA);
      service.addSocketRoom(socketA, room1);

      expect(await service.hasOtherSocketInRoom(userId, socketA, room1)).toBe(
        false,
      );
    });

    it('should return true when another socket is in the same room', async () => {
      await service.trackSocket(userId, socketA);
      await service.trackSocket(userId, socketB);
      service.addSocketRoom(socketA, room1);
      service.addSocketRoom(socketB, room1);

      expect(await service.hasOtherSocketInRoom(userId, socketA, room1)).toBe(
        true,
      );
    });

    it('should return false when other socket is in a different room', async () => {
      await service.trackSocket(userId, socketA);
      await service.trackSocket(userId, socketB);
      service.addSocketRoom(socketA, room1);
      service.addSocketRoom(socketB, room2);

      expect(await service.hasOtherSocketInRoom(userId, socketA, room1)).toBe(
        false,
      );
    });

    it('should return false when excluded socket is the only one tracked', async () => {
      await service.trackSocket(userId, socketA);
      service.addSocketRoom(socketA, room1);

      expect(await service.hasOtherSocketInRoom(userId, socketA, room1)).toBe(
        false,
      );
    });
  });

  describe('getDiagnostics', () => {
    it('returns memory store diagnostics by default', () => {
      const diagnostics = service.getDiagnostics();
      expect(diagnostics.mode).toBe('memory');
      expect(diagnostics.status).toBe('not_configured');
    });
  });
});
