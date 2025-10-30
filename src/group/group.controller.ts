import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { GroupService } from './group.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { CreateGroupDto } from './dto/create-group.dto';
import type { Request } from 'express';
import { JWTUser } from 'src/auth/entity/jwt.entity';

@Controller('group')
export class GroupController {
  constructor(private readonly groupService: GroupService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() createGroupDto: CreateGroupDto, @Req() request: Request) {
    const user = request.user as JWTUser;
    return this.groupService.create(createGroupDto, user.id);
  }

  @Get('joined')
  @UseGuards(JwtAuthGuard)
  listUserJoinedGroups(@Req() request: Request) {
    const user = request.user as JWTUser;
    return this.groupService.listUserJoinedGroups(user.id);
  }

  @Post(':id/join')
  @UseGuards(JwtAuthGuard)
  joinGroup(@Param('id') groupId: string, @Req() request: Request) {
    const user = request.user as JWTUser;
    return this.groupService.joinGroup(groupId, user.id);
  }

  @Post(':id/leave')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  leaveGroup(@Param('id') groupId: string, @Req() request: Request) {
    const user = request.user as JWTUser;
    return this.groupService.leaveGroup(groupId, user.id);
  }

  @Get(':id/members')
  @UseGuards(JwtAuthGuard)
  listGroupMembers(@Param('id') groupId: string, @Req() request: Request) {
    const user = request.user as JWTUser;
    return this.groupService.listGroupMembers(groupId, user.id);
  }
}
