import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateGroupDto } from './dto/create-group.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GroupService {
  constructor(private prisma: PrismaService) {}

  async create(createGroupDto: CreateGroupDto, creatorId: string) {
    return this.prisma.group.create({
      data: {
        name: createGroupDto.name,
        createdBy: creatorId,
        members: {
          create: {
            userId: creatorId,
          },
        },
      },
    });
  }

  async listUserJoinedGroups(userId: string) {
    return this.prisma.group.findMany({
      where: {
        members: {
          some: {
            userId,
          },
        },
      },
    });
  }

  async joinGroup(groupId: string, userId: string) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      throw new BadRequestException('Group does not exits');
    }

    const alreadyMember = await this.prisma.groupMember.findFirst({
      where: {
        groupId,
        userId,
      },
    });

    if (alreadyMember) {
      throw new BadRequestException('You are already member of this group');
    }

    return this.prisma.groupMember.create({
      data: {
        groupId,
        userId,
      },
    });
  }

  listGroupMembers(groupId: string, userId: string) {
    return this.prisma.groupMember.findMany({
      where: {
        groupId,
        group: {
          members: {
            some: {
              userId,
            },
          },
        },
      },
      omit: {
        userId: true,
      },
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
  }

  async leaveGroup(groupId: string, userId: string) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          select: {
            userId: true,
          },
        },
      },
    });

    if (!group) {
      throw new BadRequestException('Group does not exits');
    }

    if (group.members.some((m) => m.userId === userId)) {
      await this.prisma.groupMember.delete({
        where: {
          groupId_userId: {
            groupId,
            userId,
          },
        },
      });
    }

    return;
  }
}
