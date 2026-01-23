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
  @IsNotEmpty()
  @IsUUID('4')
  groupId: string;

  @IsNotEmpty()
  @IsString()
  description: string;

  @IsNotEmpty()
  @IsInt()
  @IsPositive()
  centAmount: number;

  @IsOptional()
  @IsUUID('4')
  paidByMemberId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  includedMemberIds?: string[];
}
