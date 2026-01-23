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
  @IsNotEmpty()
  @IsUUID('4')
  groupId: string;

  @IsNotEmpty()
  @IsUUID('4')
  fromMemberId: string;

  @IsNotEmpty()
  @IsUUID('4')
  toMemberId: string;

  @IsNotEmpty()
  @IsInt()
  @IsPositive()
  centAmount: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
