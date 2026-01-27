import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import email from 'src/infra/email';

@Injectable()
export class ExpenseService {
  constructor(private prisma: PrismaService) {}

  async create(createExpenseDto: CreateExpenseDto, userId: string) {
    // Get the group and verify it exists
    const group = await this.prisma.group.findUnique({
      where: { id: createExpenseDto.groupId, deletedAt: null },
    });

    if (!group) {
      throw new BadRequestException('Group does not exist');
    }

    // Get the requester's membership in the group
    const creatorMembership = await this.prisma.groupMember.findFirst({
      where: {
        groupId: createExpenseDto.groupId,
        userId,
      },
    });

    if (!creatorMembership) {
      throw new BadRequestException('You are not a member of this group');
    }

    // Determine payer membership
    let payerMemberId = creatorMembership.id;
    if (createExpenseDto.paidByMemberId) {
      const payerMembership = await this.prisma.groupMember.findFirst({
        where: {
          id: createExpenseDto.paidByMemberId,
          groupId: createExpenseDto.groupId,
        },
      });

      if (!payerMembership) {
        throw new BadRequestException(
          'Payer is not a valid member of this group',
        );
      }
      payerMemberId = payerMembership.id;
    }

    // Get all group members ordered by joinedAt for equal splitting
    const allMembers = await this.prisma.groupMember.findMany({
      where: { groupId: createExpenseDto.groupId },
      orderBy: { joinedAt: 'asc' },
    });

    // Determine which members to include in the split
    let membersToSplit = allMembers;
    let splitType: 'EQUAL_ALL' | 'PARTIAL' = 'EQUAL_ALL';

    if (
      createExpenseDto.includedMemberIds &&
      createExpenseDto.includedMemberIds.length > 0
    ) {
      // Deduplicate the included member IDs
      const uniqueIncludedIds = [
        ...new Set(createExpenseDto.includedMemberIds),
      ];

      // Validate all included member IDs are valid group members
      const allMemberIds = new Set(allMembers.map((m) => m.id));
      const invalidIds = uniqueIncludedIds.filter(
        (id) => !allMemberIds.has(id),
      );

      if (invalidIds.length > 0) {
        throw new BadRequestException(
          `Invalid member IDs: ${invalidIds.join(', ')}`,
        );
      }

      // Filter to only included members, preserving joinedAt order
      const includedSet = new Set(uniqueIncludedIds);
      membersToSplit = allMembers.filter((m) => includedSet.has(m.id));

      // Set split type based on whether it's a subset
      splitType =
        membersToSplit.length < allMembers.length ? 'PARTIAL' : 'EQUAL_ALL';
    }

    // Validate at least 1 member in the split
    if (membersToSplit.length === 0) {
      throw new BadRequestException(
        'At least one member must be included in the split',
      );
    }

    // Calculate equal split
    const memberCount = membersToSplit.length;
    const baseAmount = Math.floor(createExpenseDto.centAmount / memberCount);
    const remainder = createExpenseDto.centAmount % memberCount;

    // Create expense with splits
    const expense = await this.prisma.expense.create({
      data: {
        groupId: createExpenseDto.groupId,
        createdBy: creatorMembership.id,
        paidBy: payerMemberId,
        description: createExpenseDto.description,
        centAmount: createExpenseDto.centAmount,
        splitType,
        splits: {
          create: membersToSplit.map((member, index) => ({
            groupMemberId: member.id,
            centAmount: index < remainder ? baseAmount + 1 : baseAmount,
          })),
        },
      },
      include: {
        splits: true,
      },
    });

    // Fetch full details for notifications
    const expenseWithDetails = await this.prisma.expense.findUnique({
      where: { id: expense.id },
      include: {
        group: true,
        payer: {
          include: { user: true },
        },
        splits: {
          include: {
            groupMember: {
              include: { user: true },
            },
          },
        },
      },
    });

    if (expenseWithDetails) {
      await this.sendExpenseNotifications(expenseWithDetails);
    }

    return expense;
  }

  private async sendExpenseNotifications(expense: {
    centAmount: number;
    description: string;
    group: { name: string };
    payer: { user: { name: string; email: string } };
    splits: {
      centAmount: number;
      groupMember: { id: string; user: { name: string; email: string } };
    }[];
  }) {
    const amount = (expense.centAmount / 100).toFixed(2);
    const groupName = expense.group.name;
    const payerName = expense.payer.user.name;
    const payerEmail = expense.payer.user.email;
    const description = expense.description;

    // Email to Payer
    await email.send({
      from: 'Payment Splitter <noreply@paymentsplitter.com>',
      to: payerEmail,
      subject: `Expense added - ${groupName}`,
      text: `Hi ${payerName},

You added an expense in ${groupName}.

Description: ${description}
Amount: $${amount}

Thanks for using Payment Splitter!
`,
    });

    // Email to each member in the split (excluding payer if they are in the split)
    for (const split of expense.splits) {
      if (split.groupMember.user.email === payerEmail) {
        continue;
      }

      const memberName = split.groupMember.user.name;
      const memberEmail = split.groupMember.user.email;
      const splitAmount = (split.centAmount / 100).toFixed(2);

      await email.send({
        from: 'Payment Splitter <noreply@paymentsplitter.com>',
        to: memberEmail,
        subject: `New expense - ${groupName}`,
        text: `Hi ${memberName},

${payerName} added an expense in ${groupName}.

Description: ${description}
Total Amount: $${amount}
Your Share: $${splitAmount}

Thanks for using Payment Splitter!
`,
      });
    }
  }

  async listByGroup(groupId: string, userId: string) {
    // Only return expenses if user is a member of the group
    return this.prisma.expense.findMany({
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
  }
}
