import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SettlementService } from './settlement.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { CreateSettlementDto } from './dto/create-settlement.dto';
import type { Request } from 'express';
import { JWTUser } from 'src/auth/entity/jwt.entity';

@Controller('settlement')
export class SettlementController {
  constructor(private readonly settlementService: SettlementService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @Body() createSettlementDto: CreateSettlementDto,
    @Req() request: Request,
  ) {
    const user = request.user as JWTUser;
    return this.settlementService.create(createSettlementDto, user.id);
  }

  @Get('group/:groupId')
  @UseGuards(JwtAuthGuard)
  listByGroup(@Param('groupId') groupId: string, @Req() request: Request) {
    const user = request.user as JWTUser;
    return this.settlementService.listByGroup(groupId, user.id);
  }
}
