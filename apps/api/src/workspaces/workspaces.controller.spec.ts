import { Test } from '@nestjs/testing';
import { GoneException } from '@nestjs/common';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';

describe('WorkspacesController', () => {
  let controller: WorkspacesController;
  let workspacesService: jest.Mocked<WorkspacesService>;

  const user = {
    id: 'user-id',
    email: 'u@test.com',
    username: 'user',
    displayName: null,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [WorkspacesController],
      providers: [
        {
          provide: WorkspacesService,
          useValue: {
            addMember: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(WorkspacesController);
    workspacesService = moduleRef.get(WorkspacesService);
  });

  describe('addMember', () => {
    it('should throw GoneException with message about workspace invitations', async () => {
      await expect(
        controller.addMember(
          'workspace-id',
          { identifier: 'alice', role: 'MEMBER' } as any,
          user as any,
        ),
      ).rejects.toBeInstanceOf(GoneException);

      await expect(
        controller.addMember(
          'workspace-id',
          { identifier: 'alice', role: 'MEMBER' } as any,
          user as any,
        ),
      ).rejects.toThrow('Use workspace invitations to add members');
    });

    it('should not call workspaces.addMember', async () => {
      try {
        await controller.addMember(
          'workspace-id',
          { identifier: 'alice', role: 'MEMBER' } as any,
          user as any,
        );
      } catch {
        // expected
      }
      expect(workspacesService.addMember).not.toHaveBeenCalled();
    });
  });
});
