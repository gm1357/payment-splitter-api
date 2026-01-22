import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { BalanceResponseDto } from './dto/balance-response.dto';
import { SettlementSuggestionDto } from './dto/settlement-suggestion.dto';
import { MemberBalanceDto } from './dto/member-balance.dto';

@Injectable()
export class BalanceService {
  constructor(private prisma: PrismaService) {}

  async getGroupBalances(
    groupId: string,
    userId: string,
  ): Promise<BalanceResponseDto> {
    // Verify group exists and is not deleted
    const group = await this.prisma.group.findUnique({
      where: { id: groupId, deletedAt: null },
    });

    if (!group) {
      throw new BadRequestException('Group does not exist');
    }

    // Verify requester is a member of the group
    const membership = await this.prisma.groupMember.findFirst({
      where: {
        groupId,
        userId,
      },
    });

    if (!membership) {
      throw new BadRequestException('You are not a member of this group');
    }

    // Get all group members with user details
    const members = await this.prisma.groupMember.findMany({
      where: { groupId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Get all expenses (for totalPaid calculation)
    const expenses = await this.prisma.expense.findMany({
      where: { groupId, deletedAt: null },
      select: { paidBy: true, centAmount: true },
    });

    // Get expense splits grouped by member (for totalOwed calculation)
    const expenseSplits = await this.prisma.expenseSplit.groupBy({
      by: ['groupMemberId'],
      where: {
        expense: { groupId, deletedAt: null },
      },
      _sum: { centAmount: true },
    });

    // Get all settlements
    const settlements = await this.prisma.settlement.findMany({
      where: { groupId },
      select: { fromMemberId: true, toMemberId: true, centAmount: true },
    });

    // Calculate totals
    const totalExpenses = expenses.reduce((sum, e) => sum + e.centAmount, 0);
    const totalSettled = settlements.reduce((sum, s) => sum + s.centAmount, 0);

    // Build balance for each member
    const balances: MemberBalanceDto[] = members.map((member) => {
      // Total paid by this member (expenses they paid for)
      const totalPaid = expenses
        .filter((e) => e.paidBy === member.id)
        .reduce((sum, e) => sum + e.centAmount, 0);

      // Total owed by this member (their share of expenses)
      const splitRecord = expenseSplits.find(
        (s) => s.groupMemberId === member.id,
      );
      const totalOwed = splitRecord?._sum?.centAmount ?? 0;

      // Settlements received (money others paid to this member)
      const settlementsReceived = settlements
        .filter((s) => s.toMemberId === member.id)
        .reduce((sum, s) => sum + s.centAmount, 0);

      // Settlements paid (money this member paid to others)
      const settlementsPaid = settlements
        .filter((s) => s.fromMemberId === member.id)
        .reduce((sum, s) => sum + s.centAmount, 0);

      // Net balance formula (corrected for settlement suggestions to work):
      // netBalance = (totalPaid + settlementsPaid) - (totalOwed + settlementsReceived)
      // Positive = owed money, Negative = owes money
      const netBalance =
        totalPaid + settlementsPaid - (totalOwed + settlementsReceived);

      return {
        memberId: member.id,
        userId: member.user.id,
        userName: member.user.name,
        userEmail: member.user.email,
        totalPaid,
        totalOwed,
        settlementsReceived,
        settlementsPaid,
        netBalance,
      };
    });

    return {
      groupId,
      groupName: group.name,
      balances,
      totalExpenses,
      totalSettled,
    };
  }

  async suggestSettlements(
    groupId: string,
    userId: string,
  ): Promise<SettlementSuggestionDto[]> {
    // Get balances first (this also validates group and membership)
    const balanceResponse = await this.getGroupBalances(groupId, userId);

    // Separate members into debtors (negative balance) and creditors (positive balance)
    const debtors: Array<{
      memberId: string;
      userName: string;
      amount: number;
    }> = [];
    const creditors: Array<{
      memberId: string;
      userName: string;
      amount: number;
    }> = [];

    for (const balance of balanceResponse.balances) {
      if (balance.netBalance < 0) {
        debtors.push({
          memberId: balance.memberId,
          userName: balance.userName,
          amount: Math.abs(balance.netBalance),
        });
      } else if (balance.netBalance > 0) {
        creditors.push({
          memberId: balance.memberId,
          userName: balance.userName,
          amount: balance.netBalance,
        });
      }
    }

    // Sort both by amount descending (greedy approach)
    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    // Greedy matching algorithm
    const suggestions: SettlementSuggestionDto[] = [];
    let debtorIndex = 0;
    let creditorIndex = 0;

    while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
      const debtor = debtors[debtorIndex];
      const creditor = creditors[creditorIndex];

      // Settlement amount is the minimum of what debtor owes and what creditor is owed
      const settlementAmount = Math.min(debtor.amount, creditor.amount);

      if (settlementAmount > 0) {
        suggestions.push({
          fromMemberId: debtor.memberId,
          fromUserName: debtor.userName,
          toMemberId: creditor.memberId,
          toUserName: creditor.userName,
          centAmount: settlementAmount,
        });
      }

      // Reduce amounts
      debtor.amount -= settlementAmount;
      creditor.amount -= settlementAmount;

      // Move to next if amount is zero
      if (debtor.amount === 0) {
        debtorIndex++;
      }
      if (creditor.amount === 0) {
        creditorIndex++;
      }
    }

    return suggestions;
  }
}
