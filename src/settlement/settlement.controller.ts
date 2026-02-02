import {
  Body,
  Controller,
  Get,
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
import { SettlementService } from './settlement.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { CreateSettlementDto } from './dto/create-settlement.dto';
import type { Request } from 'express';
import { JWTUser } from 'src/auth/entity/jwt.entity';

@ApiTags('Settlement')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('settlement')
export class SettlementController {
  constructor(private readonly settlementService: SettlementService) {}

  @Post()
  @ApiOperation({ summary: 'Record a settlement between members' })
  @ApiCreatedResponse({ description: 'Settlement recorded' })
  create(
    @Body() createSettlementDto: CreateSettlementDto,
    @Req() req: Request,
  ) {
    const user = req.user as JWTUser;
    return this.settlementService.create(createSettlementDto, user.id);
  }

  @Get('group/:groupId')
  @ApiOperation({ summary: 'List settlements for a group' })
  @ApiParam({ name: 'groupId', format: 'uuid' })
  @ApiOkResponse({ description: 'List of settlements' })
  listByGroup(@Param('groupId') groupId: string, @Req() request: Request) {
    const user = request.user as JWTUser;
    return this.settlementService.listByGroup(groupId, user.id);
  }
}
