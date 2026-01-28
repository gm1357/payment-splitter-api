import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import email from 'src/infra/email';
import { CsvParserService } from './csv-parser.service';
import {
  BatchCreateResult,
  ValidatedExpenseRow,
} from './dto/upload-expenses.dto';

@Injectable()
export class ExpenseService {
  constructor(
    private prisma: PrismaService,
    private csvParserService: CsvParserService,
  ) {}

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

    const emailPromises: Promise<void>[] = [];

    // Email to Payer
    emailPromises.push(
      email.send({
        from: 'Payment Splitter <noreply@paymentsplitter.com>',
        to: payerEmail,
        subject: `Expense added - ${groupName}`,
        text: `Hi ${payerName},

You added an expense in ${groupName}.

Description: ${description}
Amount: $${amount}

Thanks for using Payment Splitter!
`,
      }),
    );

    // Email to each member in the split (excluding payer if they are in the split)
    for (const split of expense.splits) {
      if (split.groupMember.user.email === payerEmail) {
        continue;
      }

      const memberName = split.groupMember.user.name;
      const memberEmail = split.groupMember.user.email;
      const splitAmount = (split.centAmount / 100).toFixed(2);

      emailPromises.push(
        email.send({
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
        }),
      );
    }

    await Promise.all(emailPromises);
  }

  async createBatch(
    groupId: string,
    csvContent: string,
    userId: string,
  ): Promise<BatchCreateResult> {
    // Get the group and verify it exists
    const group = await this.prisma.group.findUnique({
      where: { id: groupId, deletedAt: null },
    });

    if (!group) {
      throw new BadRequestException('Group does not exist');
    }

    // Get the requester's membership in the group
    const creatorMembership = await this.prisma.groupMember.findFirst({
      where: {
        groupId,
        userId,
      },
    });

    if (!creatorMembership) {
      throw new BadRequestException('You are not a member of this group');
    }

    // Get all group members ordered by joinedAt for equal splitting
    const allMembers = await this.prisma.groupMember.findMany({
      where: { groupId },
      orderBy: { joinedAt: 'asc' },
      include: {
        user: true,
      },
    });

    const validMemberIds = new Set(allMembers.map((m) => m.id));

    // Parse and validate CSV
    const { expenses, errors } = this.csvParserService.parseAndValidate(
      csvContent,
      validMemberIds,
    );

    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'CSV validation failed',
        errors,
      });
    }

    if (expenses.length === 0) {
      throw new BadRequestException('No valid expenses in CSV');
    }

    // Create all expenses in a transaction
    const createdExpenses = await this.prisma.$transaction(async (tx) => {
      const results: { id: string; description: string; centAmount: number }[] =
        [];

      for (const expenseRow of expenses) {
        const expenseData = this.prepareExpenseData(
          expenseRow,
          groupId,
          creatorMembership.id,
          allMembers,
        );

        const expense = await tx.expense.create({
          data: expenseData,
        });

        results.push({
          id: expense.id,
          description: expense.description,
          centAmount: expense.centAmount,
        });
      }

      return results;
    });

    // Send batch notifications
    await this.sendBatchNotifications(createdExpenses);

    return {
      created: createdExpenses.length,
      expenses: createdExpenses,
    };
  }

  private prepareExpenseData(
    expenseRow: ValidatedExpenseRow,
    groupId: string,
    creatorMemberId: string,
    allMembers: {
      id: string;
      joinedAt: Date;
      user: { name: string; email: string };
    }[],
  ) {
    // Determine payer membership
    const payerMemberId = expenseRow.paidByMemberId || creatorMemberId;

    // Determine which members to include in the split
    let membersToSplit = allMembers;
    let splitType: 'EQUAL_ALL' | 'PARTIAL' = 'EQUAL_ALL';

    if (
      expenseRow.includedMemberIds &&
      expenseRow.includedMemberIds.length > 0
    ) {
      const uniqueIncludedIds = [...new Set(expenseRow.includedMemberIds)];
      const includedSet = new Set(uniqueIncludedIds);
      membersToSplit = allMembers.filter((m) => includedSet.has(m.id));
      splitType =
        membersToSplit.length < allMembers.length ? 'PARTIAL' : 'EQUAL_ALL';
    }

    // Calculate equal split
    const memberCount = membersToSplit.length;
    const baseAmount = Math.floor(expenseRow.centAmount / memberCount);
    const remainder = expenseRow.centAmount % memberCount;

    return {
      groupId,
      createdBy: creatorMemberId,
      paidBy: payerMemberId,
      description: expenseRow.description,
      centAmount: expenseRow.centAmount,
      splitType,
      splits: {
        create: membersToSplit.map((member, index) => ({
          groupMemberId: member.id,
          centAmount: index < remainder ? baseAmount + 1 : baseAmount,
        })),
      },
    };
  }

  private async sendBatchNotifications(
    expenses: { id: string; description: string; centAmount: number }[],
  ) {
    // Fetch all created expenses with full details
    const expensesWithDetails = await this.prisma.expense.findMany({
      where: {
        id: { in: expenses.map((e) => e.id) },
      },
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

    // Group expenses by affected user email
    const userExpenses = new Map<
      string,
      {
        userName: string;
        userEmail: string;
        expenses: {
          description: string;
          totalAmount: number;
          shareAmount: number;
          isPayer: boolean;
        }[];
      }
    >();

    for (const expense of expensesWithDetails) {
      const payerEmail = expense.payer.user.email;

      // Add to payer's list
      if (!userExpenses.has(payerEmail)) {
        userExpenses.set(payerEmail, {
          userName: expense.payer.user.name,
          userEmail: payerEmail,
          expenses: [],
        });
      }

      // Find payer's split amount (if they're in the split)
      const payerSplit = expense.splits.find(
        (s) => s.groupMember.user.email === payerEmail,
      );

      userExpenses.get(payerEmail)!.expenses.push({
        description: expense.description,
        totalAmount: expense.centAmount,
        shareAmount: payerSplit?.centAmount || 0,
        isPayer: true,
      });

      // Add to each split member's list (excluding payer)
      for (const split of expense.splits) {
        const memberEmail = split.groupMember.user.email;
        if (memberEmail === payerEmail) {
          continue;
        }

        if (!userExpenses.has(memberEmail)) {
          userExpenses.set(memberEmail, {
            userName: split.groupMember.user.name,
            userEmail: memberEmail,
            expenses: [],
          });
        }

        userExpenses.get(memberEmail)!.expenses.push({
          description: expense.description,
          totalAmount: expense.centAmount,
          shareAmount: split.centAmount,
          isPayer: false,
        });
      }
    }

    // Get group name for email subject
    const groupName = expensesWithDetails[0]?.group.name || 'Unknown Group';

    // Send summary email to each affected user
    const emailPromises: Promise<void>[] = [];

    for (const [, userData] of userExpenses) {
      const expenseCount = userData.expenses.length;
      const totalShare = userData.expenses.reduce(
        (sum, e) => sum + e.shareAmount,
        0,
      );

      const expenseLines = userData.expenses
        .map((e, i) => {
          const totalStr = (e.totalAmount / 100).toFixed(2);
          const shareStr = (e.shareAmount / 100).toFixed(2);
          return `${i + 1}. ${e.description} - $${totalStr} (your share: $${shareStr})`;
        })
        .join('\n');

      emailPromises.push(
        email.send({
          from: 'Payment Splitter <noreply@paymentsplitter.com>',
          to: userData.userEmail,
          subject: `${expenseCount} new expenses in "${groupName}"`,
          text: `Hi ${userData.userName},

${expenseCount} expenses were added to "${groupName}":

${expenseLines}

Your total share: $${(totalShare / 100).toFixed(2)}

Thanks for using Payment Splitter!
`,
        }),
      );
    }

    await Promise.all(emailPromises);
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
