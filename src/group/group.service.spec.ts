import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { GroupService } from './group.service';
import { PrismaService } from 'src/prisma/prisma.service';

describe('GroupService', () => {
  let service: GroupService;

  const mockPrismaService = {
    group: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    groupMember: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<GroupService>(GroupService);

    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a group and add creator as member', async () => {
      const createGroupDto = { name: 'Trip to Paris' };
      const creatorId = 'user-123';
      const expectedGroup = {
        id: 'group-123',
        name: 'Trip to Paris',
        createdBy: creatorId,
      };

      mockPrismaService.group.create.mockResolvedValue(expectedGroup);

      const result = await service.create(createGroupDto, creatorId);

      expect(result).toEqual(expectedGroup);
      expect(mockPrismaService.group.create).toHaveBeenCalledWith({
        data: {
          name: 'Trip to Paris',
          createdBy: creatorId,
          members: {
            create: {
              userId: creatorId,
            },
          },
        },
      });
    });
  });

  describe('joinGroup', () => {
    const groupId = 'group-123';
    const userId = 'user-456';

    it('should throw BadRequestException when group does not exist', async () => {
      mockPrismaService.group.findUnique.mockResolvedValue(null);

      await expect(service.joinGroup(groupId, userId)).rejects.toThrow(
        new BadRequestException('Group does not exits'),
      );
    });

    it('should throw BadRequestException when user is already a member', async () => {
      mockPrismaService.group.findUnique.mockResolvedValue({ id: groupId });
      mockPrismaService.groupMember.findFirst.mockResolvedValue({
        groupId,
        userId,
      });

      await expect(service.joinGroup(groupId, userId)).rejects.toThrow(
        new BadRequestException('You are already member of this group'),
      );
    });

    it('should create membership when valid', async () => {
      const expectedMembership = { groupId, userId };
      mockPrismaService.group.findUnique.mockResolvedValue({ id: groupId });
      mockPrismaService.groupMember.findFirst.mockResolvedValue(null);
      mockPrismaService.groupMember.create.mockResolvedValue(
        expectedMembership,
      );

      const result = await service.joinGroup(groupId, userId);

      expect(result).toEqual(expectedMembership);
      expect(mockPrismaService.groupMember.create).toHaveBeenCalledWith({
        data: { groupId, userId },
      });
    });
  });

  describe('leaveGroup', () => {
    const groupId = 'group-123';
    const userId = 'user-456';

    it('should throw BadRequestException when group does not exist', async () => {
      mockPrismaService.group.findUnique.mockResolvedValue(null);

      await expect(service.leaveGroup(groupId, userId)).rejects.toThrow(
        new BadRequestException('Group does not exits'),
      );
    });

    it('should delete membership when user is a member', async () => {
      mockPrismaService.group.findUnique.mockResolvedValue({
        id: groupId,
        members: [{ userId }],
      });

      await service.leaveGroup(groupId, userId);

      expect(mockPrismaService.groupMember.delete).toHaveBeenCalledWith({
        where: {
          groupId_userId: { groupId, userId },
        },
      });
    });

    it('should not delete membership when user is not a member', async () => {
      mockPrismaService.group.findUnique.mockResolvedValue({
        id: groupId,
        members: [{ userId: 'other-user' }],
      });

      await service.leaveGroup(groupId, userId);

      expect(mockPrismaService.groupMember.delete).not.toHaveBeenCalled();
    });
  });

  describe('listUserJoinedGroups', () => {
    it('should return groups where user is a member', async () => {
      const userId = 'user-123';
      const expectedGroups = [
        { id: 'group-1', name: 'Group 1' },
        { id: 'group-2', name: 'Group 2' },
      ];
      mockPrismaService.group.findMany.mockResolvedValue(expectedGroups);

      const result = await service.listUserJoinedGroups(userId);

      expect(result).toEqual(expectedGroups);
      expect(mockPrismaService.group.findMany).toHaveBeenCalledWith({
        where: {
          members: {
            some: { userId },
          },
        },
      });
    });
  });

  describe('listGroupMembers', () => {
    it('should return members of a group if user is a member', async () => {
      const groupId = 'group-123';
      const userId = 'user-123';
      const expectedMembers = [
        {
          groupId,
          user: { id: userId, name: 'User 1', email: 'user1@test.com' },
        },
      ];
      mockPrismaService.groupMember.findMany.mockResolvedValue(expectedMembers);

      const result = await service.listGroupMembers(groupId, userId);

      expect(result).toEqual(expectedMembers);
    });
  });
});
