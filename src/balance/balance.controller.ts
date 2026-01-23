import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { BalanceService } from './balance.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import type { Request } from 'express';
import { JWTUser } from 'src/auth/entity/jwt.entity';

@Controller('balance')
export class BalanceController {
  constructor(private readonly balanceService: BalanceService) {}

  @Get('group/:groupId')
  @UseGuards(JwtAuthGuard)
  getGroupBalances(@Param('groupId') groupId: string, @Req() request: Request) {
    const user = request.user as JWTUser;
    return this.balanceService.getGroupBalances(groupId, user.id);
  }

  @Get('group/:groupId/suggest')
  @UseGuards(JwtAuthGuard)
  suggestSettlements(
    @Param('groupId') groupId: string,
    @Req() request: Request,
  ) {
    const user = request.user as JWTUser;
    return this.balanceService.suggestSettlements(groupId, user.id);
  }
}
