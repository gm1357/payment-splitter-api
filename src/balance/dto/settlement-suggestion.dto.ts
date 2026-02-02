import { ApiProperty } from '@nestjs/swagger';

export class SettlementSuggestionDto {
  @ApiProperty({ format: 'uuid' })
  fromMemberId: string;

  @ApiProperty({ example: 'John Doe' })
  fromUserName: string;

  @ApiProperty({ format: 'uuid' })
  toMemberId: string;

  @ApiProperty({ example: 'Jane Doe' })
  toUserName: string;

  @ApiProperty({ description: 'Amount in cents', example: 2500 })
  centAmount: number;
}
