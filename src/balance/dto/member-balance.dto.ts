import { ApiProperty } from '@nestjs/swagger';

export class MemberBalanceDto {
  @ApiProperty({ format: 'uuid' })
  memberId: string;

  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ example: 'John Doe' })
  userName: string;

  @ApiProperty({ example: 'john@example.com' })
  userEmail: string;

  @ApiProperty({ description: 'Total paid in cents', example: 5000 })
  totalPaid: number;

  @ApiProperty({ description: 'Total owed in cents', example: 3000 })
  totalOwed: number;

  @ApiProperty({ description: 'Settlements received in cents', example: 1000 })
  settlementsReceived: number;

  @ApiProperty({ description: 'Settlements paid in cents', example: 500 })
  settlementsPaid: number;

  @ApiProperty({
    description: 'Net balance in cents (positive = owed money)',
    example: 1500,
  })
  netBalance: number;
}
