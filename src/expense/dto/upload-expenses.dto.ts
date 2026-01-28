import { IsUUID } from 'class-validator';

export class UploadExpensesParamsDto {
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
