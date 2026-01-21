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
  @IsUUID()
  groupId: string;

  @IsNotEmpty()
  @IsUUID()
  fromMemberId: string;

  @IsNotEmpty()
  @IsUUID()
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
