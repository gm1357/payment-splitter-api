import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class UploadExpensesParamsDto {
  @ApiProperty({ description: 'Group ID', format: 'uuid' })
  @IsUUID('4')
  groupId: string;
}

export interface CsvExpenseRow {
  description: string;
  centAmount: string;
  paidByMemberId: string;
  includedMemberIds: string;
}

export interface ValidatedExpenseRow {
  description: string;
  centAmount: number;
  paidByMemberId: string | null;
  includedMemberIds: string[] | null;
}

export interface RowError {
  row: number;
  field: string;
  message: string;
  value: string;
}

export interface CsvParseResult {
  expenses: ValidatedExpenseRow[];
  errors: RowError[];
}

export interface BatchCreateResult {
  created: number;
  expenses: {
    id: string;
    description: string;
    centAmount: number;
  }[];
}

export interface CsvStructureValidation {
  valid: boolean;
  error?: string;
}

export interface ExpenseUploadMessage {
  s3Key: string;
  groupId: string;
  userId: string;
}

export class UploadAcceptedResponseDto {
  @ApiProperty({ example: 'Upload accepted for processing' })
  message: string;

  @ApiProperty({ example: 'expenses/group-id/1234567890-upload.csv' })
  s3Key: string;
}
