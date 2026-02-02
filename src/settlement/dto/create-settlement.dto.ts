import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateSettlementDto {
  @ApiProperty({ description: 'Group ID', format: 'uuid' })
  @IsNotEmpty()
  @IsUUID('4')
  groupId: string;

  @ApiProperty({ description: 'Member who is paying', format: 'uuid' })
  @IsNotEmpty()
  @IsUUID('4')
  fromMemberId: string;

  @ApiProperty({ description: 'Member who is receiving', format: 'uuid' })
  @IsNotEmpty()
  @IsUUID('4')
  toMemberId: string;

  @ApiProperty({ description: 'Amount in cents', example: 2500 })
  @IsNotEmpty()
  @IsInt()
  @IsPositive()
  centAmount: number;

  @ApiPropertyOptional({ description: 'Optional notes', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
