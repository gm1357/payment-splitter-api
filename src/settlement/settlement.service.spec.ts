import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SettlementService } from './settlement.service';
import { PrismaService } from 'src/prisma/prisma.service';

describe('SettlementService', () => {
  let service: SettlementService;

  const mockPrismaService = {
    group: {
      findUnique: jest.fn(),
    },
    groupMember: {
      findFirst: jest.fn(),
    },
    settlement: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettlementService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<SettlementService>(SettlementService);

    jest.clearAllMocks();
  });

  describe('create', () => {
    const userId = 'user-123';
    const groupId = 'group-456';
    const fromMemberId = 'member-1';
    const toMemberId = 'member-2';

    const createSettlementDto = {
      groupId,
      fromMemberId,
      toMemberId,
      centAmount: 5000,
    };

    it('should create a settlement between two members', async () => {
      const expectedSettlement = {
        id: 'settlement-123',
        groupId,
        fromMemberId,
        toMemberId,
        centAmount: 5000,
        notes: null,
        settledAt: new Date(),
        createdAt: new Date(),
        fromMember: { id: fromMemberId },
        toMember: { id: toMemberId },
      };

      mockPrismaService.group.findUnique.mockResolvedValue({ id: groupId });
      mockPrismaService.groupMember.findFirst
        .mockResolvedValueOnce({ id: 'requester-member' }) // requester membership
        .mockResolvedValueOnce({ id: fromMemberId }) // fromMember
        .mockResolvedValueOnce({ id: toMemberId }); // toMember
      mockPrismaService.settlement.create.mockResolvedValue(expectedSettlement);

      const result = await service.create(createSettlementDto, userId);

      expect(result).toEqual(expectedSettlement);
      expect(mockPrismaService.settlement.create).toHaveBeenCalledWith({
        data: {
          groupId,
          fromMemberId,
          toMemberId,
          centAmount: 5000,
          notes: undefined,
        },
        include: {
          fromMember: true,
          toMember: true,
        },
      });
    });

    it('should create a settlement without notes', async () => {
      const dtoWithoutNotes = {
        groupId,
        fromMemberId,
        toMemberId,
        centAmount: 5000,
      };

      mockPrismaService.group.findUnique.mockResolvedValue({ id: groupId });
      mockPrismaService.groupMember.findFirst
        .mockResolvedValueOnce({ id: 'requester-member' })
        .mockResolvedValueOnce({ id: fromMemberId })
        .mockResolvedValueOnce({ id: toMemberId });
      mockPrismaService.settlement.create.mockResolvedValue({});

      await service.create(dtoWithoutNotes, userId);

      expect(mockPrismaService.settlement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            notes: undefined,
          }),
        }),
      );
    });

    it('should create a settlement with notes', async () => {
      const dtoWithNotes = {
        ...createSettlementDto,
        notes: 'Payment for dinner',
      };

      mockPrismaService.group.findUnique.mockResolvedValue({ id: groupId });
      mockPrismaService.groupMember.findFirst
        .mockResolvedValueOnce({ id: 'requester-member' })
        .mockResolvedValueOnce({ id: fromMemberId })
        .mockResolvedValueOnce({ id: toMemberId });
      mockPrismaService.settlement.create.mockResolvedValue({});

      await service.create(dtoWithNotes, userId);

      expect(mockPrismaService.settlement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            notes: 'Payment for dinner',
          }),
        }),
      );
    });

    it('should throw BadRequestException when group does not exist', async () => {
      mockPrismaService.group.findUnique.mockResolvedValue(null);

      await expect(service.create(createSettlementDto, userId)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(createSettlementDto, userId)).rejects.toThrow(
        'Group does not exist',
      );
    });

    it('should throw BadRequestException when requester is not a group member', async () => {
      mockPrismaService.group.findUnique.mockResolvedValue({ id: groupId });
      mockPrismaService.groupMember.findFirst.mockResolvedValue(null);

      await expect(service.create(createSettlementDto, userId)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(createSettlementDto, userId)).rejects.toThrow(
        'You are not a member of this group',
      );
    });

    it('should throw BadRequestException when fromMember is not in the group', async () => {
      mockPrismaService.group.findUnique.mockResolvedValue({ id: groupId });
      mockPrismaService.groupMember.findFirst
        .mockResolvedValueOnce({ id: 'requester-member' }) // requester membership exists
        .mockResolvedValueOnce(null); // fromMember doesn't exist

      await expect(service.create(createSettlementDto, userId)).rejects.toThrow(
        BadRequestException,
      );

      mockPrismaService.groupMember.findFirst
        .mockResolvedValueOnce({ id: 'requester-member' })
        .mockResolvedValueOnce(null);

      await expect(service.create(createSettlementDto, userId)).rejects.toThrow(
        'fromMemberId is not a valid member of this group',
      );
    });

    it('should throw BadRequestException when toMember is not in the group', async () => {
      mockPrismaService.group.findUnique.mockResolvedValue({ id: groupId });
      mockPrismaService.groupMember.findFirst
        .mockResolvedValueOnce({ id: 'requester-member' }) // requester membership exists
        .mockResolvedValueOnce({ id: fromMemberId }) // fromMember exists
        .mockResolvedValueOnce(null); // toMember doesn't exist

      await expect(service.create(createSettlementDto, userId)).rejects.toThrow(
        BadRequestException,
      );

      mockPrismaService.groupMember.findFirst
        .mockResolvedValueOnce({ id: 'requester-member' })
        .mockResolvedValueOnce({ id: fromMemberId })
        .mockResolvedValueOnce(null);

      await expect(service.create(createSettlementDto, userId)).rejects.toThrow(
        'toMemberId is not a valid member of this group',
      );
    });

    it('should throw BadRequestException for self-settlement', async () => {
      const selfSettlementDto = {
        groupId,
        fromMemberId: 'member-1',
        toMemberId: 'member-1', // same as fromMemberId
        centAmount: 5000,
      };

      mockPrismaService.group.findUnique.mockResolvedValue({ id: groupId });
      mockPrismaService.groupMember.findFirst
        .mockResolvedValueOnce({ id: 'requester-member' })
        .mockResolvedValueOnce({ id: 'member-1' })
        .mockResolvedValueOnce({ id: 'member-1' });

      await expect(service.create(selfSettlementDto, userId)).rejects.toThrow(
        BadRequestException,
      );

      mockPrismaService.groupMember.findFirst
        .mockResolvedValueOnce({ id: 'requester-member' })
        .mockResolvedValueOnce({ id: 'member-1' })
        .mockResolvedValueOnce({ id: 'member-1' });

      await expect(service.create(selfSettlementDto, userId)).rejects.toThrow(
        'Cannot settle with yourself',
      );
    });
  });

  describe('listByGroup', () => {
    const groupId = 'group-123';
    const userId = 'user-456';

    it('should return settlements for a group when user is a member', async () => {
      const expectedSettlements = [
        {
          id: 'settlement-1',
          groupId,
          fromMemberId: 'member-1',
          toMemberId: 'member-2',
          centAmount: 5000,
          settledAt: new Date('2024-01-02'),
          fromMember: { id: 'member-1' },
          toMember: { id: 'member-2' },
        },
        {
          id: 'settlement-2',
          groupId,
          fromMemberId: 'member-2',
          toMemberId: 'member-1',
          centAmount: 3000,
          settledAt: new Date('2024-01-01'),
          fromMember: { id: 'member-2' },
          toMember: { id: 'member-1' },
        },
      ];

      mockPrismaService.settlement.findMany.mockResolvedValue(
        expectedSettlements,
      );

      const result = await service.listByGroup(groupId, userId);

      expect(result).toEqual(expectedSettlements);
      expect(mockPrismaService.settlement.findMany).toHaveBeenCalledWith({
        where: {
          groupId,
          group: {
            deletedAt: null,
            members: {
              some: {
                userId,
              },
            },
          },
        },
        include: {
          fromMember: true,
          toMember: true,
        },
        orderBy: { settledAt: 'desc' },
      });
    });

    it('should return empty array when user is not a member of the group', async () => {
      mockPrismaService.settlement.findMany.mockResolvedValue([]);

      const result = await service.listByGroup(groupId, userId);

      expect(result).toEqual([]);
    });

    it('should return empty array when no settlements exist', async () => {
      mockPrismaService.settlement.findMany.mockResolvedValue([]);

      const result = await service.listByGroup(groupId, userId);

      expect(result).toEqual([]);
    });
  });
});
