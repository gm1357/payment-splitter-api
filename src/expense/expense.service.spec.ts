import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ExpenseService } from './expense.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CsvParserService } from './csv-parser.service';
import email from 'src/infra/email';

jest.mock('src/infra/email', () => ({
  __esModule: true,
  default: {
    send: jest.fn().mockResolvedValue(undefined),
  },
}));

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
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockCsvParserService = {
    parseAndValidate: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: CsvParserService, useValue: mockCsvParserService },
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
        {
          id: 'member-1',
          joinedAt: new Date('2024-01-01'),
          user: { name: 'Member 1', email: 'm1@example.com' },
        },
        {
          id: 'member-2',
          joinedAt: new Date('2024-01-02'),
          user: { name: 'Member 2', email: 'm2@example.com' },
        },
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

      const expenseWithDetails = {
        ...expectedExpense,
        group: { name: 'Test Group' },
        payer: { user: { name: 'Member 1', email: 'm1@example.com' } },
        splits: [
          {
            groupMemberId: 'member-1',
            centAmount: 5000,
            groupMember: {
              id: 'member-1',
              user: { name: 'Member 1', email: 'm1@example.com' },
            },
          },
          {
            groupMemberId: 'member-2',
            centAmount: 5000,
            groupMember: {
              id: 'member-2',
              user: { name: 'Member 2', email: 'm2@example.com' },
            },
          },
        ],
      };

      mockPrismaService.group.findUnique.mockResolvedValue({ id: groupId });
      mockPrismaService.groupMember.findFirst.mockResolvedValue({
        id: 'member-1',
      });
      mockPrismaService.groupMember.findMany.mockResolvedValue(members);
      mockPrismaService.expense.create.mockResolvedValue(expectedExpense);
      mockPrismaService.expense.findUnique.mockResolvedValue(
        expenseWithDetails,
      );

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

      // Assert emails sent
      expect(email.send).toHaveBeenCalledTimes(2); // 1 to payer, 1 to split member 2
      expect(email.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'm1@example.com',
          subject: 'Expense added - Test Group',
        }),
      );
      expect(email.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'm2@example.com',
          subject: 'New expense - Test Group',
        }),
      );
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
      mockPrismaService.expense.create.mockResolvedValue({ id: 'exp-1' });
      mockPrismaService.expense.findUnique.mockResolvedValue(null); // Skipping notification logic for simplicity

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
      mockPrismaService.expense.create.mockResolvedValue({ id: 'exp-1' });
      mockPrismaService.expense.findUnique.mockResolvedValue(null);

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

    describe('partial splits', () => {
      const members = [
        { id: 'member-1', joinedAt: new Date('2024-01-01') },
        { id: 'member-2', joinedAt: new Date('2024-01-02') },
        { id: 'member-3', joinedAt: new Date('2024-01-03') },
      ];

      beforeEach(() => {
        mockPrismaService.group.findUnique.mockResolvedValue({ id: groupId });
        mockPrismaService.groupMember.findFirst.mockResolvedValue({
          id: 'member-1',
        });
        mockPrismaService.groupMember.findMany.mockResolvedValue(members);
        mockPrismaService.expense.create.mockResolvedValue({ id: 'exp-1' });
        mockPrismaService.expense.findUnique.mockResolvedValue(null);
      });

      it('should create partial split with subset of members', async () => {
        await service.create(
          {
            ...createExpenseDto,
            centAmount: 3000,
            includedMemberIds: ['member-1', 'member-3'],
          },
          userId,
        );

        expect(mockPrismaService.expense.create).toHaveBeenCalledWith(
          expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            data: expect.objectContaining({
              splitType: 'PARTIAL',
              splits: {
                create: [
                  { groupMemberId: 'member-1', centAmount: 1500 },
                  { groupMemberId: 'member-3', centAmount: 1500 },
                ],
              },
            }),
          }),
        );
      });

      it('should set EQUAL_ALL when all members explicitly included', async () => {
        await service.create(
          {
            ...createExpenseDto,
            includedMemberIds: ['member-1', 'member-2', 'member-3'],
          },
          userId,
        );

        expect(mockPrismaService.expense.create).toHaveBeenCalledWith(
          expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            data: expect.objectContaining({
              splitType: 'EQUAL_ALL',
            }),
          }),
        );
      });

      it('should distribute remainder by joinedAt order in partial splits', async () => {
        // 10001 / 2 = 5000 with remainder 1
        // member-1 joined first, so gets the extra cent
        await service.create(
          {
            ...createExpenseDto,
            centAmount: 10001,
            includedMemberIds: ['member-1', 'member-3'],
          },
          userId,
        );

        expect(mockPrismaService.expense.create).toHaveBeenCalledWith(
          expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            data: expect.objectContaining({
              splits: {
                create: [
                  { groupMemberId: 'member-1', centAmount: 5001 },
                  { groupMemberId: 'member-3', centAmount: 5000 },
                ],
              },
            }),
          }),
        );
      });

      it('should throw BadRequestException for invalid member ID', async () => {
        await expect(
          service.create(
            {
              ...createExpenseDto,
              includedMemberIds: ['member-1', 'invalid-member'],
            },
            userId,
          ),
        ).rejects.toThrow(
          new BadRequestException('Invalid member IDs: invalid-member'),
        );
      });

      it('should deduplicate member IDs', async () => {
        await service.create(
          {
            ...createExpenseDto,
            centAmount: 3000,
            includedMemberIds: ['member-1', 'member-1', 'member-2'],
          },
          userId,
        );

        expect(mockPrismaService.expense.create).toHaveBeenCalledWith(
          expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            data: expect.objectContaining({
              splits: {
                create: [
                  { groupMemberId: 'member-1', centAmount: 1500 },
                  { groupMemberId: 'member-2', centAmount: 1500 },
                ],
              },
            }),
          }),
        );
      });

      it('should default to EQUAL_ALL when includedMemberIds is undefined', async () => {
        await service.create(createExpenseDto, userId);

        expect(mockPrismaService.expense.create).toHaveBeenCalledWith(
          expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            data: expect.objectContaining({
              splitType: 'EQUAL_ALL',
              splits: {
                create: [
                  { groupMemberId: 'member-1', centAmount: 3334 },
                  { groupMemberId: 'member-2', centAmount: 3333 },
                  { groupMemberId: 'member-3', centAmount: 3333 },
                ],
              },
            }),
          }),
        );
      });

      it('should default to EQUAL_ALL when includedMemberIds is empty array', async () => {
        await service.create(
          { ...createExpenseDto, includedMemberIds: [] },
          userId,
        );

        expect(mockPrismaService.expense.create).toHaveBeenCalledWith(
          expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            data: expect.objectContaining({
              splitType: 'EQUAL_ALL',
              splits: {
                create: [
                  { groupMemberId: 'member-1', centAmount: 3334 },
                  { groupMemberId: 'member-2', centAmount: 3333 },
                  { groupMemberId: 'member-3', centAmount: 3333 },
                ],
              },
            }),
          }),
        );
      });

      it('should allow payer not in split', async () => {
        mockPrismaService.groupMember.findFirst
          .mockResolvedValueOnce({ id: 'member-1' }) // creator membership
          .mockResolvedValueOnce({ id: 'member-3' }); // payer membership

        await service.create(
          {
            ...createExpenseDto,
            centAmount: 2000,
            paidByMemberId: 'member-3',
            includedMemberIds: ['member-1', 'member-2'],
          },
          userId,
        );

        expect(mockPrismaService.expense.create).toHaveBeenCalledWith(
          expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            data: expect.objectContaining({
              paidBy: 'member-3',
              splitType: 'PARTIAL',
              splits: {
                create: [
                  { groupMemberId: 'member-1', centAmount: 1000 },
                  { groupMemberId: 'member-2', centAmount: 1000 },
                ],
              },
            }),
          }),
        );
      });
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

  describe('createBatch', () => {
    const groupId = 'group-456';
    const userId = 'user-123';
    const csvContent = `description,centAmount,paidByMemberId,includedMemberIds
Dinner,15000,,
Taxi,3500,,`;

    const members = [
      {
        id: 'member-1',
        joinedAt: new Date('2024-01-01'),
        user: { name: 'Member 1', email: 'm1@example.com' },
      },
      {
        id: 'member-2',
        joinedAt: new Date('2024-01-02'),
        user: { name: 'Member 2', email: 'm2@example.com' },
      },
    ];

    beforeEach(() => {
      mockPrismaService.group.findUnique.mockResolvedValue({ id: groupId });
      mockPrismaService.groupMember.findFirst.mockResolvedValue({
        id: 'member-1',
      });
      mockPrismaService.groupMember.findMany.mockResolvedValue(members);
    });

    it('should create multiple expenses from valid CSV', async () => {
      const parsedExpenses = [
        {
          description: 'Dinner',
          centAmount: 15000,
          paidByMemberId: null,
          includedMemberIds: null,
        },
        {
          description: 'Taxi',
          centAmount: 3500,
          paidByMemberId: null,
          includedMemberIds: null,
        },
      ];

      mockCsvParserService.parseAndValidate.mockReturnValue({
        expenses: parsedExpenses,
        errors: [],
      });

      const createdExpenses = [
        { id: 'exp-1', description: 'Dinner', centAmount: 15000, splits: [] },
        { id: 'exp-2', description: 'Taxi', centAmount: 3500, splits: [] },
      ];

      mockPrismaService.$transaction.mockImplementation(
        // eslint-disable-next-line @typescript-eslint/require-await
        async (callback: (tx: unknown) => unknown) => {
          const mockTx = {
            expense: {
              create: jest
                .fn()
                .mockResolvedValueOnce(createdExpenses[0])
                .mockResolvedValueOnce(createdExpenses[1]),
            },
          };
          return callback(mockTx);
        },
      );

      mockPrismaService.expense.findMany.mockResolvedValue([
        {
          id: 'exp-1',
          description: 'Dinner',
          centAmount: 15000,
          group: { name: 'Test Group' },
          payer: { user: { name: 'Member 1', email: 'm1@example.com' } },
          splits: [
            {
              centAmount: 7500,
              groupMember: {
                id: 'member-1',
                user: { name: 'Member 1', email: 'm1@example.com' },
              },
            },
            {
              centAmount: 7500,
              groupMember: {
                id: 'member-2',
                user: { name: 'Member 2', email: 'm2@example.com' },
              },
            },
          ],
        },
        {
          id: 'exp-2',
          description: 'Taxi',
          centAmount: 3500,
          group: { name: 'Test Group' },
          payer: { user: { name: 'Member 1', email: 'm1@example.com' } },
          splits: [
            {
              centAmount: 1750,
              groupMember: {
                id: 'member-1',
                user: { name: 'Member 1', email: 'm1@example.com' },
              },
            },
            {
              centAmount: 1750,
              groupMember: {
                id: 'member-2',
                user: { name: 'Member 2', email: 'm2@example.com' },
              },
            },
          ],
        },
      ]);

      const result = await service.createBatch(groupId, csvContent, userId);

      expect(result.created).toBe(2);
      expect(result.expenses).toHaveLength(2);
      expect(result.expenses[0].description).toBe('Dinner');
      expect(result.expenses[1].description).toBe('Taxi');

      // Should send batch emails (2 users)
      expect(email.send).toHaveBeenCalledTimes(2);
    });

    it('should throw BadRequestException when group does not exist', async () => {
      mockPrismaService.group.findUnique.mockResolvedValue(null);

      await expect(
        service.createBatch(groupId, csvContent, userId),
      ).rejects.toThrow(new BadRequestException('Group does not exist'));
    });

    it('should throw BadRequestException when user is not a member', async () => {
      mockPrismaService.groupMember.findFirst.mockResolvedValue(null);

      await expect(
        service.createBatch(groupId, csvContent, userId),
      ).rejects.toThrow(
        new BadRequestException('You are not a member of this group'),
      );
    });

    it('should throw BadRequestException when CSV has validation errors', async () => {
      mockCsvParserService.parseAndValidate.mockReturnValue({
        expenses: [],
        errors: [
          {
            row: 2,
            field: 'centAmount',
            message: 'Must be a positive integer',
            value: '-100',
          },
        ],
      });

      await expect(
        service.createBatch(groupId, csvContent, userId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when CSV has no valid expenses', async () => {
      mockCsvParserService.parseAndValidate.mockReturnValue({
        expenses: [],
        errors: [],
      });

      await expect(
        service.createBatch(groupId, csvContent, userId),
      ).rejects.toThrow(new BadRequestException('No valid expenses in CSV'));
    });

    it('should use specified paidByMemberId from CSV', async () => {
      const parsedExpenses = [
        {
          description: 'Dinner',
          centAmount: 15000,
          paidByMemberId: 'member-2',
          includedMemberIds: null,
        },
      ];

      mockCsvParserService.parseAndValidate.mockReturnValue({
        expenses: parsedExpenses,
        errors: [],
      });

      let capturedData: unknown;
      mockPrismaService.$transaction.mockImplementation(
        // eslint-disable-next-line @typescript-eslint/require-await
        async (callback: (tx: unknown) => unknown) => {
          const mockTx = {
            expense: {
              create: jest.fn().mockImplementation((data: unknown) => {
                capturedData = data;
                return {
                  id: 'exp-1',
                  description: 'Dinner',
                  centAmount: 15000,
                  splits: [],
                };
              }),
            },
          };
          return callback(mockTx);
        },
      );

      mockPrismaService.expense.findMany.mockResolvedValue([
        {
          id: 'exp-1',
          description: 'Dinner',
          centAmount: 15000,
          group: { name: 'Test Group' },
          payer: { user: { name: 'Member 2', email: 'm2@example.com' } },
          splits: [],
        },
      ]);

      await service.createBatch(groupId, csvContent, userId);

      expect(capturedData).toMatchObject({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          paidBy: 'member-2',
        }),
      });
    });

    it('should create partial split when includedMemberIds specified', async () => {
      const parsedExpenses = [
        {
          description: 'Taxi',
          centAmount: 3000,
          paidByMemberId: null,
          includedMemberIds: ['member-1'],
        },
      ];

      mockCsvParserService.parseAndValidate.mockReturnValue({
        expenses: parsedExpenses,
        errors: [],
      });

      let capturedData: unknown;
      mockPrismaService.$transaction.mockImplementation(
        // eslint-disable-next-line @typescript-eslint/require-await
        async (callback: (tx: unknown) => unknown) => {
          const mockTx = {
            expense: {
              create: jest.fn().mockImplementation((data: unknown) => {
                capturedData = data;
                return {
                  id: 'exp-1',
                  description: 'Taxi',
                  centAmount: 3000,
                  splits: [],
                };
              }),
            },
          };
          return callback(mockTx);
        },
      );

      mockPrismaService.expense.findMany.mockResolvedValue([
        {
          id: 'exp-1',
          description: 'Taxi',
          centAmount: 3000,
          group: { name: 'Test Group' },
          payer: { user: { name: 'Member 1', email: 'm1@example.com' } },
          splits: [
            {
              centAmount: 3000,
              groupMember: {
                id: 'member-1',
                user: { name: 'Member 1', email: 'm1@example.com' },
              },
            },
          ],
        },
      ]);

      await service.createBatch(groupId, csvContent, userId);

      expect(capturedData).toMatchObject({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          splitType: 'PARTIAL',
          splits: {
            create: [{ groupMemberId: 'member-1', centAmount: 3000 }],
          },
        }),
      });
    });
  });
});
