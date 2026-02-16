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
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { GroupService } from './group.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateGroupDto } from './dto/create-group.dto';
import type { Request } from 'express';
import { JWTUser } from '../auth/entity/jwt.entity';

@ApiTags('Group')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('group')
export class GroupController {
  constructor(private readonly groupService: GroupService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new group' })
  @ApiCreatedResponse({ description: 'Group created' })
  create(@Body() createGroupDto: CreateGroupDto, @Req() request: Request) {
    const user = request.user as JWTUser;
    return this.groupService.create(createGroupDto, user.id);
  }

  @Get('joined')
  @ApiOperation({ summary: 'List groups the authenticated user has joined' })
  @ApiOkResponse({ description: 'List of groups' })
  listUserJoinedGroups(@Req() request: Request) {
    const user = request.user as JWTUser;
    return this.groupService.listUserJoinedGroups(user.id);
  }

  @Post(':id/join')
  @ApiOperation({ summary: 'Join a group' })
  @ApiParam({ name: 'id', description: 'Group ID', format: 'uuid' })
  @ApiCreatedResponse({ description: 'Joined group' })
  joinGroup(@Param('id') groupId: string, @Req() request: Request) {
    const user = request.user as JWTUser;
    return this.groupService.joinGroup(groupId, user.id);
  }

  @Post(':id/leave')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Leave a group' })
  @ApiParam({ name: 'id', description: 'Group ID', format: 'uuid' })
  @ApiOkResponse({ description: 'Left group' })
  leaveGroup(@Param('id') groupId: string, @Req() request: Request) {
    const user = request.user as JWTUser;
    return this.groupService.leaveGroup(groupId, user.id);
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'List group members' })
  @ApiParam({ name: 'id', description: 'Group ID', format: 'uuid' })
  @ApiOkResponse({ description: 'List of group members' })
  listGroupMembers(@Param('id') groupId: string, @Req() request: Request) {
    const user = request.user as JWTUser;
    return this.groupService.listGroupMembers(groupId, user.id);
  }
}
