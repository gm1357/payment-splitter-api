import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateSettlementDto } from './dto/create-settlement.dto';
import { PrismaService } from '../prisma/prisma.service';
import email from '../infra/email';

@Injectable()
export class SettlementService {
  constructor(private prisma: PrismaService) {}

  async create(createSettlementDto: CreateSettlementDto, userId: string) {
    // Verify group exists and is not deleted
    const group = await this.prisma.group.findUnique({
      where: { id: createSettlementDto.groupId, deletedAt: null },
    });

    if (!group) {
      throw new BadRequestException('Group does not exist');
    }

    // Verify requester is a member of the group
    const requesterMembership = await this.prisma.groupMember.findFirst({
      where: {
        groupId: createSettlementDto.groupId,
        userId,
      },
    });

    if (!requesterMembership) {
      throw new BadRequestException('You are not a member of this group');
    }

    // Verify fromMemberId belongs to the group
    const fromMember = await this.prisma.groupMember.findFirst({
      where: {
        id: createSettlementDto.fromMemberId,
        groupId: createSettlementDto.groupId,
      },
    });

    if (!fromMember) {
      throw new BadRequestException(
        'fromMemberId is not a valid member of this group',
      );
    }

    // Verify toMemberId belongs to the group
    const toMember = await this.prisma.groupMember.findFirst({
      where: {
        id: createSettlementDto.toMemberId,
        groupId: createSettlementDto.groupId,
      },
    });

    if (!toMember) {
      throw new BadRequestException(
        'toMemberId is not a valid member of this group',
      );
    }

    // Verify fromMemberId !== toMemberId (no self-settlement)
    if (createSettlementDto.fromMemberId === createSettlementDto.toMemberId) {
      throw new BadRequestException('Cannot settle with yourself');
    }

    // Create settlement record with member details included
    const settlement = await this.prisma.settlement.create({
      data: {
        groupId: createSettlementDto.groupId,
        fromMemberId: createSettlementDto.fromMemberId,
        toMemberId: createSettlementDto.toMemberId,
        centAmount: createSettlementDto.centAmount,
        notes: createSettlementDto.notes,
      },
      include: {
        group: true,
        fromMember: {
          include: { user: true },
        },
        toMember: {
          include: { user: true },
        },
      },
    });

    await this.sendSettlementNotifications(settlement);

    return settlement;
  }

  private async sendSettlementNotifications(settlement: {
    centAmount: number;
    notes: string | null;
    group: { name: string };
    fromMember: { user: { name: string; email: string } };
    toMember: { user: { name: string; email: string } };
  }) {
    const amount = (settlement.centAmount / 100).toFixed(2);
    const groupName = settlement.group.name;
    const payerName = settlement.fromMember.user.name;
    const payerEmail = settlement.fromMember.user.email;
    const receiverName = settlement.toMember.user.name;
    const receiverEmail = settlement.toMember.user.email;
    const notes = settlement.notes || 'None';

    await email.send({
      from: 'Payment Splitter <noreply@paymentsplitter.com>',
      to: payerEmail,
      subject: `Payment recorded - ${groupName}`,
      text: `Hi ${payerName},

Your payment has been recorded in ${groupName}.

Amount: $${amount}
Paid to: ${receiverName}
Notes: ${notes}

Thanks for using Payment Splitter!
`,
    });

    await email.send({
      from: 'Payment Splitter <noreply@paymentsplitter.com>',
      to: receiverEmail,
      subject: `You received a payment - ${groupName}`,
      text: `Hi ${receiverName},

You received a payment in ${groupName}.

Amount: $${amount}
From: ${payerName}
Notes: ${notes}

Thanks for using Payment Splitter!
`,
    });
  }

  async listByGroup(groupId: string, userId: string) {
    // Only return settlements if user is a member of the group and group is not deleted
    return this.prisma.settlement.findMany({
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
  }
}
