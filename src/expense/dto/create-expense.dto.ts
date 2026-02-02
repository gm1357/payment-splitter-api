import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateExpenseDto {
  @ApiProperty({ description: 'Group ID', format: 'uuid' })
  @IsNotEmpty()
  @IsUUID('4')
  groupId: string;

  @ApiProperty({ example: 'Dinner at restaurant' })
  @IsNotEmpty()
  @IsString()
  description: string;

  @ApiProperty({ description: 'Amount in cents', example: 5000 })
  @IsNotEmpty()
  @IsInt()
  @IsPositive()
  centAmount: number;

  @ApiPropertyOptional({
    description: 'Member who paid. Defaults to the authenticated user.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('4')
  paidByMemberId?: string;

  @ApiPropertyOptional({
    description: 'Members to split among. Defaults to all group members.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  includedMemberIds?: string[];
}
