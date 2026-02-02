import { ApiProperty } from '@nestjs/swagger';
import { MemberBalanceDto } from './member-balance.dto';

export class BalanceResponseDto {
  @ApiProperty({ format: 'uuid' })
  groupId: string;

  @ApiProperty({ example: 'Trip to Paris' })
  groupName: string;

  @ApiProperty({ type: [MemberBalanceDto] })
  balances: MemberBalanceDto[];

  @ApiProperty({ description: 'Total expenses in cents', example: 15000 })
  totalExpenses: number;

  @ApiProperty({ description: 'Total settled in cents', example: 5000 })
  totalSettled: number;
}
