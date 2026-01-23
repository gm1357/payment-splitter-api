import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { BalanceService } from './balance.service';
import { PrismaService } from 'src/prisma/prisma.service';

describe('BalanceService', () => {
  let service: BalanceService;

  const mockPrismaService = {
    group: {
      findUnique: jest.fn(),
    },
    groupMember: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    expense: {
      aggregate: jest.fn(),
      findMany: jest.fn(),
    },
    expenseSplit: {
      aggregate: jest.fn(),
      groupBy: jest.fn(),
    },
    settlement: {
      aggregate: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BalanceService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<BalanceService>(BalanceService);

    jest.clearAllMocks();
  });

  describe('getGroupBalances', () => {
    const userId = 'user-123';
    const groupId = 'group-456';

    it('should throw BadRequestException when group does not exist', async () => {
      mockPrismaService.group.findUnique.mockResolvedValue(null);

      await expect(service.getGroupBalances(groupId, userId)).rejects.toThrow(
        new BadRequestException('Group does not exist'),
      );
    });

    it('should throw BadRequestException when user is not a member of the group', async () => {
      mockPrismaService.group.findUnique.mockResolvedValue({
        id: groupId,
        name: 'Test Group',
      });
      mockPrismaService.groupMember.findFirst.mockResolvedValue(null);

      await expect(service.getGroupBalances(groupId, userId)).rejects.toThrow(
        new BadRequestException('You are not a member of this group'),
      );
    });

    it('should return correct balances for a simple scenario', async () => {
      // Setup: 2 members, 1 expense where member1 pays 10000 cents split equally
      const members = [
        {
          id: 'member-1',
          userId: 'user-1',
          user: { id: 'user-1', name: 'Alice', email: 'alice@example.com' },
        },
        {
          id: 'member-2',
          userId: 'user-2',
          user: { id: 'user-2', name: 'Bob', email: 'bob@example.com' },
        },
      ];

      mockPrismaService.group.findUnique.mockResolvedValue({
        id: groupId,
        name: 'Test Group',
      });
      mockPrismaService.groupMember.findFirst.mockResolvedValue({
        id: 'member-1',
      });
      mockPrismaService.groupMember.findMany.mockResolvedValue(members);

      // member-1 paid 10000 total
      mockPrismaService.expense.findMany.mockResolvedValue([
        { paidBy: 'member-1', centAmount: 10000 },
      ]);

      // Each member owes 5000
      mockPrismaService.expenseSplit.groupBy.mockResolvedValue([
        { groupMemberId: 'member-1', _sum: { centAmount: 5000 } },
        { groupMemberId: 'member-2', _sum: { centAmount: 5000 } },
      ]);

      // No settlements yet
      mockPrismaService.settlement.findMany.mockResolvedValue([]);

      const result = await service.getGroupBalances(groupId, userId);

      expect(result.groupId).toBe(groupId);
      expect(result.groupName).toBe('Test Group');
      expect(result.totalExpenses).toBe(10000);
      expect(result.totalSettled).toBe(0);
      expect(result.balances).toHaveLength(2);

      // Alice paid 10000, owes 5000, net balance = 10000 - 5000 = +5000
      const aliceBalance = result.balances.find(
        (b) => b.memberId === 'member-1',
      );
      expect(aliceBalance).toBeDefined();
      expect(aliceBalance!.totalPaid).toBe(10000);
      expect(aliceBalance!.totalOwed).toBe(5000);
      expect(aliceBalance!.netBalance).toBe(5000);

      // Bob paid 0, owes 5000, net balance = 0 - 5000 = -5000
      const bobBalance = result.balances.find((b) => b.memberId === 'member-2');
      expect(bobBalance).toBeDefined();
      expect(bobBalance!.totalPaid).toBe(0);
      expect(bobBalance!.totalOwed).toBe(5000);
      expect(bobBalance!.netBalance).toBe(-5000);
    });

    it('should include settlements in balance calculation', async () => {
      // Setup: 2 members with settlements
      const members = [
        {
          id: 'member-1',
          userId: 'user-1',
          user: { id: 'user-1', name: 'Alice', email: 'alice@example.com' },
        },
        {
          id: 'member-2',
          userId: 'user-2',
          user: { id: 'user-2', name: 'Bob', email: 'bob@example.com' },
        },
      ];

      mockPrismaService.group.findUnique.mockResolvedValue({
        id: groupId,
        name: 'Test Group',
      });
      mockPrismaService.groupMember.findFirst.mockResolvedValue({
        id: 'member-1',
      });
      mockPrismaService.groupMember.findMany.mockResolvedValue(members);

      // member-1 paid 10000
      mockPrismaService.expense.findMany.mockResolvedValue([
        { paidBy: 'member-1', centAmount: 10000 },
      ]);

      // Each member owes 5000
      mockPrismaService.expenseSplit.groupBy.mockResolvedValue([
        { groupMemberId: 'member-1', _sum: { centAmount: 5000 } },
        { groupMemberId: 'member-2', _sum: { centAmount: 5000 } },
      ]);

      // Bob settled 3000 to Alice
      mockPrismaService.settlement.findMany.mockResolvedValue([
        { fromMemberId: 'member-2', toMemberId: 'member-1', centAmount: 3000 },
      ]);

      const result = await service.getGroupBalances(groupId, userId);

      expect(result.totalSettled).toBe(3000);

      // Alice: paid 10000, owes 5000, received 3000, paid settlements 0
      // Using corrected formula: netBalance = (totalPaid + settlementsPaid) - (totalOwed + settlementsReceived)
      // netBalance = (10000 + 0) - (5000 + 3000) = 2000 (still owed 2000)
      const aliceBalance = result.balances.find(
        (b) => b.memberId === 'member-1',
      );
      expect(aliceBalance!.settlementsReceived).toBe(3000);
      expect(aliceBalance!.settlementsPaid).toBe(0);
      expect(aliceBalance!.netBalance).toBe(2000);

      // Bob: paid 0, owes 5000, received 0, paid settlements 3000
      // netBalance = (0 + 3000) - (5000 + 0) = -2000 (still owes 2000)
      const bobBalance = result.balances.find((b) => b.memberId === 'member-2');
      expect(bobBalance!.settlementsReceived).toBe(0);
      expect(bobBalance!.settlementsPaid).toBe(3000);
      expect(bobBalance!.netBalance).toBe(-2000);
    });

    it('should return zero balances when no expenses exist', async () => {
      const members = [
        {
          id: 'member-1',
          userId: 'user-1',
          user: { id: 'user-1', name: 'Alice', email: 'alice@example.com' },
        },
      ];

      mockPrismaService.group.findUnique.mockResolvedValue({
        id: groupId,
        name: 'Test Group',
      });
      mockPrismaService.groupMember.findFirst.mockResolvedValue({
        id: 'member-1',
      });
      mockPrismaService.groupMember.findMany.mockResolvedValue(members);
      mockPrismaService.expense.findMany.mockResolvedValue([]);
      mockPrismaService.expenseSplit.groupBy.mockResolvedValue([]);
      mockPrismaService.settlement.findMany.mockResolvedValue([]);

      const result = await service.getGroupBalances(groupId, userId);

      expect(result.totalExpenses).toBe(0);
      expect(result.balances[0].netBalance).toBe(0);
    });

    it('should handle three members with uneven split', async () => {
      // 10001 cents split among 3 = 3334 + 3334 + 3333
      const members = [
        {
          id: 'member-1',
          userId: 'user-1',
          user: { id: 'user-1', name: 'Alice', email: 'alice@example.com' },
        },
        {
          id: 'member-2',
          userId: 'user-2',
          user: { id: 'user-2', name: 'Bob', email: 'bob@example.com' },
        },
        {
          id: 'member-3',
          userId: 'user-3',
          user: { id: 'user-3', name: 'Charlie', email: 'charlie@example.com' },
        },
      ];

      mockPrismaService.group.findUnique.mockResolvedValue({
        id: groupId,
        name: 'Test Group',
      });
      mockPrismaService.groupMember.findFirst.mockResolvedValue({
        id: 'member-1',
      });
      mockPrismaService.groupMember.findMany.mockResolvedValue(members);

      mockPrismaService.expense.findMany.mockResolvedValue([
        { paidBy: 'member-1', centAmount: 10001 },
      ]);

      mockPrismaService.expenseSplit.groupBy.mockResolvedValue([
        { groupMemberId: 'member-1', _sum: { centAmount: 3334 } },
        { groupMemberId: 'member-2', _sum: { centAmount: 3334 } },
        { groupMemberId: 'member-3', _sum: { centAmount: 3333 } },
      ]);

      mockPrismaService.settlement.findMany.mockResolvedValue([]);

      const result = await service.getGroupBalances(groupId, userId);

      expect(result.totalExpenses).toBe(10001);

      // Alice: 10001 - 3334 = +6667
      const aliceBalance = result.balances.find(
        (b) => b.memberId === 'member-1',
      );
      expect(aliceBalance!.netBalance).toBe(6667);

      // Bob: 0 - 3334 = -3334
      const bobBalance = result.balances.find((b) => b.memberId === 'member-2');
      expect(bobBalance!.netBalance).toBe(-3334);

      // Charlie: 0 - 3333 = -3333
      const charlieBalance = result.balances.find(
        (b) => b.memberId === 'member-3',
      );
      expect(charlieBalance!.netBalance).toBe(-3333);
    });

    it('should handle multiple expenses from different payers', async () => {
      const members = [
        {
          id: 'member-1',
          userId: 'user-1',
          user: { id: 'user-1', name: 'Alice', email: 'alice@example.com' },
        },
        {
          id: 'member-2',
          userId: 'user-2',
          user: { id: 'user-2', name: 'Bob', email: 'bob@example.com' },
        },
      ];

      mockPrismaService.group.findUnique.mockResolvedValue({
        id: groupId,
        name: 'Test Group',
      });
      mockPrismaService.groupMember.findFirst.mockResolvedValue({
        id: 'member-1',
      });
      mockPrismaService.groupMember.findMany.mockResolvedValue(members);

      // Alice paid 6000, Bob paid 4000
      mockPrismaService.expense.findMany.mockResolvedValue([
        { paidBy: 'member-1', centAmount: 6000 },
        { paidBy: 'member-2', centAmount: 4000 },
      ]);

      // Each owes 5000 (half of 10000 total)
      mockPrismaService.expenseSplit.groupBy.mockResolvedValue([
        { groupMemberId: 'member-1', _sum: { centAmount: 5000 } },
        { groupMemberId: 'member-2', _sum: { centAmount: 5000 } },
      ]);

      mockPrismaService.settlement.findMany.mockResolvedValue([]);

      const result = await service.getGroupBalances(groupId, userId);

      expect(result.totalExpenses).toBe(10000);

      // Alice: paid 6000, owes 5000, net = +1000
      const aliceBalance = result.balances.find(
        (b) => b.memberId === 'member-1',
      );
      expect(aliceBalance!.totalPaid).toBe(6000);
      expect(aliceBalance!.netBalance).toBe(1000);

      // Bob: paid 4000, owes 5000, net = -1000
      const bobBalance = result.balances.find((b) => b.memberId === 'member-2');
      expect(bobBalance!.totalPaid).toBe(4000);
      expect(bobBalance!.netBalance).toBe(-1000);
    });
  });

  describe('suggestSettlements', () => {
    const userId = 'user-123';
    const groupId = 'group-456';

    it('should throw BadRequestException when group does not exist', async () => {
      mockPrismaService.group.findUnique.mockResolvedValue(null);

      await expect(service.suggestSettlements(groupId, userId)).rejects.toThrow(
        new BadRequestException('Group does not exist'),
      );
    });

    it('should throw BadRequestException when user is not a member of the group', async () => {
      mockPrismaService.group.findUnique.mockResolvedValue({
        id: groupId,
        name: 'Test Group',
      });
      mockPrismaService.groupMember.findFirst.mockResolvedValue(null);

      await expect(service.suggestSettlements(groupId, userId)).rejects.toThrow(
        new BadRequestException('You are not a member of this group'),
      );
    });

    it('should return empty array when all balances are zero', async () => {
      const members = [
        {
          id: 'member-1',
          userId: 'user-1',
          user: { id: 'user-1', name: 'Alice', email: 'alice@example.com' },
        },
      ];

      mockPrismaService.group.findUnique.mockResolvedValue({
        id: groupId,
        name: 'Test Group',
      });
      mockPrismaService.groupMember.findFirst.mockResolvedValue({
        id: 'member-1',
      });
      mockPrismaService.groupMember.findMany.mockResolvedValue(members);
      mockPrismaService.expense.findMany.mockResolvedValue([]);
      mockPrismaService.expenseSplit.groupBy.mockResolvedValue([]);
      mockPrismaService.settlement.findMany.mockResolvedValue([]);

      const result = await service.suggestSettlements(groupId, userId);

      expect(result).toEqual([]);
    });

    it('should suggest single settlement for two members', async () => {
      // Alice is owed 5000, Bob owes 5000
      const members = [
        {
          id: 'member-1',
          userId: 'user-1',
          user: { id: 'user-1', name: 'Alice', email: 'alice@example.com' },
        },
        {
          id: 'member-2',
          userId: 'user-2',
          user: { id: 'user-2', name: 'Bob', email: 'bob@example.com' },
        },
      ];

      mockPrismaService.group.findUnique.mockResolvedValue({
        id: groupId,
        name: 'Test Group',
      });
      mockPrismaService.groupMember.findFirst.mockResolvedValue({
        id: 'member-1',
      });
      mockPrismaService.groupMember.findMany.mockResolvedValue(members);

      mockPrismaService.expense.findMany.mockResolvedValue([
        { paidBy: 'member-1', centAmount: 10000 },
      ]);

      mockPrismaService.expenseSplit.groupBy.mockResolvedValue([
        { groupMemberId: 'member-1', _sum: { centAmount: 5000 } },
        { groupMemberId: 'member-2', _sum: { centAmount: 5000 } },
      ]);

      mockPrismaService.settlement.findMany.mockResolvedValue([]);

      const result = await service.suggestSettlements(groupId, userId);

      expect(result).toHaveLength(1);
      expect(result[0].fromMemberId).toBe('member-2');
      expect(result[0].fromUserName).toBe('Bob');
      expect(result[0].toMemberId).toBe('member-1');
      expect(result[0].toUserName).toBe('Alice');
      expect(result[0].centAmount).toBe(5000);
    });

    it('should suggest minimum number of settlements for three members', async () => {
      // Alice paid 9000, owes 3000, net = +6000
      // Bob paid 0, owes 3000, net = -3000
      // Charlie paid 0, owes 3000, net = -3000
      const members = [
        {
          id: 'member-1',
          userId: 'user-1',
          user: { id: 'user-1', name: 'Alice', email: 'alice@example.com' },
        },
        {
          id: 'member-2',
          userId: 'user-2',
          user: { id: 'user-2', name: 'Bob', email: 'bob@example.com' },
        },
        {
          id: 'member-3',
          userId: 'user-3',
          user: { id: 'user-3', name: 'Charlie', email: 'charlie@example.com' },
        },
      ];

      mockPrismaService.group.findUnique.mockResolvedValue({
        id: groupId,
        name: 'Test Group',
      });
      mockPrismaService.groupMember.findFirst.mockResolvedValue({
        id: 'member-1',
      });
      mockPrismaService.groupMember.findMany.mockResolvedValue(members);

      mockPrismaService.expense.findMany.mockResolvedValue([
        { paidBy: 'member-1', centAmount: 9000 },
      ]);

      mockPrismaService.expenseSplit.groupBy.mockResolvedValue([
        { groupMemberId: 'member-1', _sum: { centAmount: 3000 } },
        { groupMemberId: 'member-2', _sum: { centAmount: 3000 } },
        { groupMemberId: 'member-3', _sum: { centAmount: 3000 } },
      ]);

      mockPrismaService.settlement.findMany.mockResolvedValue([]);

      const result = await service.suggestSettlements(groupId, userId);

      expect(result).toHaveLength(2);

      // Both Bob and Charlie should pay Alice
      const totalToAlice = result
        .filter((s) => s.toMemberId === 'member-1')
        .reduce((sum, s) => sum + s.centAmount, 0);
      expect(totalToAlice).toBe(6000);
    });

    it('should handle complex scenario with multiple creditors and debtors', async () => {
      // Alice: paid 8000, owes 4000, net = +4000
      // Bob: paid 4000, owes 4000, net = 0
      // Charlie: paid 0, owes 4000, net = -4000
      const members = [
        {
          id: 'member-1',
          userId: 'user-1',
          user: { id: 'user-1', name: 'Alice', email: 'alice@example.com' },
        },
        {
          id: 'member-2',
          userId: 'user-2',
          user: { id: 'user-2', name: 'Bob', email: 'bob@example.com' },
        },
        {
          id: 'member-3',
          userId: 'user-3',
          user: { id: 'user-3', name: 'Charlie', email: 'charlie@example.com' },
        },
      ];

      mockPrismaService.group.findUnique.mockResolvedValue({
        id: groupId,
        name: 'Test Group',
      });
      mockPrismaService.groupMember.findFirst.mockResolvedValue({
        id: 'member-1',
      });
      mockPrismaService.groupMember.findMany.mockResolvedValue(members);

      mockPrismaService.expense.findMany.mockResolvedValue([
        { paidBy: 'member-1', centAmount: 8000 },
        { paidBy: 'member-2', centAmount: 4000 },
      ]);

      mockPrismaService.expenseSplit.groupBy.mockResolvedValue([
        { groupMemberId: 'member-1', _sum: { centAmount: 4000 } },
        { groupMemberId: 'member-2', _sum: { centAmount: 4000 } },
        { groupMemberId: 'member-3', _sum: { centAmount: 4000 } },
      ]);

      mockPrismaService.settlement.findMany.mockResolvedValue([]);

      const result = await service.suggestSettlements(groupId, userId);

      // Charlie (-4000) should pay Alice (+4000)
      expect(result).toHaveLength(1);
      expect(result[0].fromMemberId).toBe('member-3');
      expect(result[0].toMemberId).toBe('member-1');
      expect(result[0].centAmount).toBe(4000);
    });

    it('should account for existing settlements when suggesting new ones', async () => {
      // Scenario: Alice paid 10000, split equally (5000 each)
      // Bob already settled 2000 to Alice, so remaining debt is 3000
      const members = [
        {
          id: 'member-1',
          userId: 'user-1',
          user: { id: 'user-1', name: 'Alice', email: 'alice@example.com' },
        },
        {
          id: 'member-2',
          userId: 'user-2',
          user: { id: 'user-2', name: 'Bob', email: 'bob@example.com' },
        },
      ];

      mockPrismaService.group.findUnique.mockResolvedValue({
        id: groupId,
        name: 'Test Group',
      });
      mockPrismaService.groupMember.findFirst.mockResolvedValue({
        id: 'member-1',
      });
      mockPrismaService.groupMember.findMany.mockResolvedValue(members);

      mockPrismaService.expense.findMany.mockResolvedValue([
        { paidBy: 'member-1', centAmount: 10000 },
      ]);

      mockPrismaService.expenseSplit.groupBy.mockResolvedValue([
        { groupMemberId: 'member-1', _sum: { centAmount: 5000 } },
        { groupMemberId: 'member-2', _sum: { centAmount: 5000 } },
      ]);

      // Bob already settled 2000 to Alice
      mockPrismaService.settlement.findMany.mockResolvedValue([
        { fromMemberId: 'member-2', toMemberId: 'member-1', centAmount: 2000 },
      ]);

      const result = await service.suggestSettlements(groupId, userId);

      // Using corrected formula: netBalance = (totalPaid + settlementsPaid) - (totalOwed + settlementsReceived)
      // Alice: (10000 + 0) - (5000 + 2000) = 3000 (still owed 3000)
      // Bob: (0 + 2000) - (5000 + 0) = -3000 (still owes 3000)
      // Suggestion: Bob → Alice 3000

      expect(result).toHaveLength(1);
      expect(result[0].fromMemberId).toBe('member-2');
      expect(result[0].toMemberId).toBe('member-1');
      expect(result[0].centAmount).toBe(3000);
    });

    it('should handle scenario where everyone is balanced', async () => {
      // Alice paid 5000, owes 5000, net = 0
      // Bob paid 5000, owes 5000, net = 0
      const members = [
        {
          id: 'member-1',
          userId: 'user-1',
          user: { id: 'user-1', name: 'Alice', email: 'alice@example.com' },
        },
        {
          id: 'member-2',
          userId: 'user-2',
          user: { id: 'user-2', name: 'Bob', email: 'bob@example.com' },
        },
      ];

      mockPrismaService.group.findUnique.mockResolvedValue({
        id: groupId,
        name: 'Test Group',
      });
      mockPrismaService.groupMember.findFirst.mockResolvedValue({
        id: 'member-1',
      });
      mockPrismaService.groupMember.findMany.mockResolvedValue(members);

      mockPrismaService.expense.findMany.mockResolvedValue([
        { paidBy: 'member-1', centAmount: 5000 },
        { paidBy: 'member-2', centAmount: 5000 },
      ]);

      mockPrismaService.expenseSplit.groupBy.mockResolvedValue([
        { groupMemberId: 'member-1', _sum: { centAmount: 5000 } },
        { groupMemberId: 'member-2', _sum: { centAmount: 5000 } },
      ]);

      mockPrismaService.settlement.findMany.mockResolvedValue([]);

      const result = await service.suggestSettlements(groupId, userId);

      expect(result).toEqual([]);
    });
  });
});
