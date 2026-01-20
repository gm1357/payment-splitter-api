import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { PrismaService } from 'src/prisma/prisma.service';

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
    const members = await this.prisma.groupMember.findMany({
      where: { groupId: createExpenseDto.groupId },
      orderBy: { joinedAt: 'asc' },
    });

    // Calculate equal split
    const memberCount = members.length;
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
        splitType: 'EQUAL_ALL',
        splits: {
          create: members.map((member, index) => ({
            groupMemberId: member.id,
            centAmount: index < remainder ? baseAmount + 1 : baseAmount,
          })),
        },
      },
      include: {
        splits: true,
      },
    });

    return expense;
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
