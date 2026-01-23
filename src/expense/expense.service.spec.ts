import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ExpenseService } from './expense.service';
import { PrismaService } from 'src/prisma/prisma.service';

describe('ExpenseService', () => {
  let service: ExpenseService;

  const mockPrismaService = {
    group: {
      findUnique: jest.fn(),
    },
    groupMember: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    expense: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ExpenseService>(ExpenseService);

    jest.clearAllMocks();
  });

  describe('create', () => {
    const userId = 'user-123';
    const groupId = 'group-456';

    const createExpenseDto = {
      groupId,
      description: 'Dinner',
      centAmount: 10000,
    };

    it('should create an expense with equal split among all members', async () => {
      const members = [
        { id: 'member-1', joinedAt: new Date('2024-01-01') },
        { id: 'member-2', joinedAt: new Date('2024-01-02') },
      ];

      const expectedExpense = {
        id: 'expense-123',
        groupId,
        createdBy: 'member-1',
        paidBy: 'member-1',
        description: 'Dinner',
        centAmount: 10000,
        splits: [
          { groupMemberId: 'member-1', centAmount: 5000 },
          { groupMemberId: 'member-2', centAmount: 5000 },
        ],
      };

      mockPrismaService.group.findUnique.mockResolvedValue({ id: groupId });
      mockPrismaService.groupMember.findFirst.mockResolvedValue({
        id: 'member-1',
      });
      mockPrismaService.groupMember.findMany.mockResolvedValue(members);
      mockPrismaService.expense.create.mockResolvedValue(expectedExpense);

      const result = await service.create(createExpenseDto, userId);

      expect(result).toEqual(expectedExpense);
      expect(mockPrismaService.expense.create).toHaveBeenCalledWith({
        data: {
          groupId,
          createdBy: 'member-1',
          paidBy: 'member-1',
          description: 'Dinner',
          centAmount: 10000,
          splitType: 'EQUAL_ALL',
          splits: {
            create: [
              { groupMemberId: 'member-1', centAmount: 5000 },
              { groupMemberId: 'member-2', centAmount: 5000 },
            ],
          },
        },
        include: {
          splits: true,
        },
      });
    });

    it('should distribute remainder to first members by joinedAt', async () => {
      const members = [
        { id: 'member-1', joinedAt: new Date('2024-01-01') },
        { id: 'member-2', joinedAt: new Date('2024-01-02') },
        { id: 'member-3', joinedAt: new Date('2024-01-03') },
      ];

      mockPrismaService.group.findUnique.mockResolvedValue({ id: groupId });
      mockPrismaService.groupMember.findFirst.mockResolvedValue({
        id: 'member-1',
      });
      mockPrismaService.groupMember.findMany.mockResolvedValue(members);
      mockPrismaService.expense.create.mockResolvedValue({});

      // 10001 / 3 = 3333 with remainder 2
      // First 2 members get 3334, third gets 3333
      await service.create({ ...createExpenseDto, centAmount: 10001 }, userId);

      expect(mockPrismaService.expense.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            splits: {
              create: [
                { groupMemberId: 'member-1', centAmount: 3334 },
                { groupMemberId: 'member-2', centAmount: 3334 },
                { groupMemberId: 'member-3', centAmount: 3333 },
              ],
            },
          }),
          include: { splits: true },
        }),
      );
    });

    it('should use specified paidByMemberId when provided', async () => {
      const members = [
        { id: 'member-1', joinedAt: new Date('2024-01-01') },
        { id: 'member-2', joinedAt: new Date('2024-01-02') },
      ];

      mockPrismaService.group.findUnique.mockResolvedValue({ id: groupId });
      mockPrismaService.groupMember.findFirst
        .mockResolvedValueOnce({ id: 'member-1' }) // creator membership
        .mockResolvedValueOnce({ id: 'member-2' }); // payer membership
      mockPrismaService.groupMember.findMany.mockResolvedValue(members);
      mockPrismaService.expense.create.mockResolvedValue({});

      await service.create(
        { ...createExpenseDto, paidByMemberId: 'member-2' },
        userId,
      );

      expect(mockPrismaService.expense.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            paidBy: 'member-2',
          }),
          include: { splits: true },
        }),
      );
    });

    it('should throw BadRequestException when group does not exist', async () => {
      mockPrismaService.group.findUnique.mockResolvedValue(null);

      await expect(service.create(createExpenseDto, userId)).rejects.toThrow(
        new BadRequestException('Group does not exist'),
      );
    });

    it('should throw BadRequestException when user is not a member of the group', async () => {
      mockPrismaService.group.findUnique.mockResolvedValue({ id: groupId });
      mockPrismaService.groupMember.findFirst.mockResolvedValue(null);

      await expect(service.create(createExpenseDto, userId)).rejects.toThrow(
        new BadRequestException('You are not a member of this group'),
      );
    });

    it('should throw BadRequestException when paidByMemberId is invalid', async () => {
      mockPrismaService.group.findUnique.mockResolvedValue({ id: groupId });
      mockPrismaService.groupMember.findFirst
        .mockResolvedValueOnce({ id: 'member-1' }) // creator membership exists
        .mockResolvedValueOnce(null); // payer membership doesn't exist

      await expect(
        service.create(
          { ...createExpenseDto, paidByMemberId: 'invalid-member' },
          userId,
        ),
      ).rejects.toThrow(
        new BadRequestException('Payer is not a valid member of this group'),
      );
    });
  });

  describe('listByGroup', () => {
    const groupId = 'group-123';
    const userId = 'user-456';

    it('should return expenses for a group when user is a member', async () => {
      const expectedExpenses = [
        {
          id: 'expense-1',
          description: 'Dinner',
          centAmount: 10000,
          splits: [{ groupMemberId: 'member-1', centAmount: 5000 }],
        },
        {
          id: 'expense-2',
          description: 'Lunch',
          centAmount: 5000,
          splits: [{ groupMemberId: 'member-1', centAmount: 2500 }],
        },
      ];

      mockPrismaService.expense.findMany.mockResolvedValue(expectedExpenses);

      const result = await service.listByGroup(groupId, userId);

      expect(result).toEqual(expectedExpenses);
      expect(mockPrismaService.expense.findMany).toHaveBeenCalledWith({
        where: {
          groupId,
          deletedAt: null,
          group: {
            members: {
              some: {
                userId,
              },
            },
          },
        },
        include: {
          splits: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should return empty array when user is not a member of the group', async () => {
      mockPrismaService.expense.findMany.mockResolvedValue([]);

      const result = await service.listByGroup(groupId, userId);

      expect(result).toEqual([]);
    });

    it('should return empty array when no expenses exist', async () => {
      mockPrismaService.expense.findMany.mockResolvedValue([]);

      const result = await service.listByGroup(groupId, userId);

      expect(result).toEqual([]);
    });
  });
});
