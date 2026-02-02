import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { BalanceService } from './balance.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { BalanceResponseDto } from './dto/balance-response.dto';
import { SettlementSuggestionDto } from './dto/settlement-suggestion.dto';
import type { Request } from 'express';
import { JWTUser } from 'src/auth/entity/jwt.entity';

@ApiTags('Balance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('balance')
export class BalanceController {
  constructor(private readonly balanceService: BalanceService) {}

  @Get('group/:groupId')
  @ApiOperation({ summary: 'Get balances for all members in a group' })
  @ApiParam({ name: 'groupId', format: 'uuid' })
  @ApiOkResponse({ type: BalanceResponseDto, description: 'Group balances' })
  getGroupBalances(@Param('groupId') groupId: string, @Req() request: Request) {
    const user = request.user as JWTUser;
    return this.balanceService.getGroupBalances(groupId, user.id);
  }

  @Get('group/:groupId/suggest')
  @ApiOperation({ summary: 'Get suggested settlements to balance the group' })
  @ApiParam({ name: 'groupId', format: 'uuid' })
  @ApiOkResponse({
    type: [SettlementSuggestionDto],
    description: 'Settlement suggestions',
  })
  suggestSettlements(
    @Param('groupId') groupId: string,
    @Req() request: Request,
  ) {
    const user = request.user as JWTUser;
    return this.balanceService.suggestSettlements(groupId, user.id);
  }
}
