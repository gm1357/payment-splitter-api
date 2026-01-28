import { Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import {
  CsvExpenseRow,
  CsvParseResult,
  RowError,
  ValidatedExpenseRow,
} from './dto/upload-expenses.dto';

const REQUIRED_HEADERS = [
  'description',
  'centAmount',
  'paidByMemberId',
  'includedMemberIds',
];

const MAX_ROWS = 500;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class CsvParserService {
  parseAndValidate(
    csvContent: string,
    validMemberIds: Set<string>,
  ): CsvParseResult {
    const errors: RowError[] = [];
    const expenses: ValidatedExpenseRow[] = [];

    let records: CsvExpenseRow[];
    try {
      records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch {
      return {
        expenses: [],
        errors: [
          {
            row: 0,
            field: 'csv',
            message: 'Invalid CSV format',
            value: '',
          },
        ],
      };
    }

    // Check for required headers
    if (records.length === 0) {
      return {
        expenses: [],
        errors: [
          {
            row: 0,
            field: 'csv',
            message: 'CSV file is empty',
            value: '',
          },
        ],
      };
    }

    const headers = Object.keys(records[0]);
    const missingHeaders = REQUIRED_HEADERS.filter((h) => !headers.includes(h));

    if (missingHeaders.length > 0) {
      return {
        expenses: [],
        errors: [
          {
            row: 0,
            field: 'headers',
            message: `Missing required headers: ${missingHeaders.join(', ')}`,
            value: headers.join(', '),
          },
        ],
      };
    }

    // Check max rows limit
    if (records.length > MAX_ROWS) {
      return {
        expenses: [],
        errors: [
          {
            row: 0,
            field: 'csv',
            message: `CSV file exceeds maximum of ${MAX_ROWS} rows`,
            value: String(records.length),
          },
        ],
      };
    }

    // Validate each row
    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const rowNumber = i + 2; // +2 because row 1 is header, and we use 1-based indexing
      const rowErrors = this.validateRow(row, rowNumber, validMemberIds);

      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
      } else {
        expenses.push(this.transformRow(row));
      }
    }

    return { expenses, errors };
  }

  private validateRow(
    row: CsvExpenseRow,
    rowNumber: number,
    validMemberIds: Set<string>,
  ): RowError[] {
    const errors: RowError[] = [];

    // Validate description (required, non-empty)
    if (!row.description || row.description.trim() === '') {
      errors.push({
        row: rowNumber,
        field: 'description',
        message: 'Description is required',
        value: row.description || '',
      });
    }

    // Validate centAmount (required, positive integer)
    const centAmount = parseInt(row.centAmount, 10);
    if (isNaN(centAmount)) {
      errors.push({
        row: rowNumber,
        field: 'centAmount',
        message: 'Must be a valid integer',
        value: row.centAmount || '',
      });
    } else if (centAmount <= 0) {
      errors.push({
        row: rowNumber,
        field: 'centAmount',
        message: 'Must be a positive integer',
        value: row.centAmount,
      });
    }

    // Validate paidByMemberId (optional, but if provided must be valid UUID and group member)
    if (row.paidByMemberId && row.paidByMemberId.trim() !== '') {
      const paidByMemberId = row.paidByMemberId.trim();
      if (!UUID_REGEX.test(paidByMemberId)) {
        errors.push({
          row: rowNumber,
          field: 'paidByMemberId',
          message: 'Must be a valid UUID',
          value: paidByMemberId,
        });
      } else if (!validMemberIds.has(paidByMemberId)) {
        errors.push({
          row: rowNumber,
          field: 'paidByMemberId',
          message: 'Not a member of this group',
          value: paidByMemberId,
        });
      }
    }

    // Validate includedMemberIds (optional, pipe-separated UUIDs, must be group members)
    if (row.includedMemberIds && row.includedMemberIds.trim() !== '') {
      const memberIds = row.includedMemberIds.split('|').map((id) => id.trim());

      for (const memberId of memberIds) {
        if (!UUID_REGEX.test(memberId)) {
          errors.push({
            row: rowNumber,
            field: 'includedMemberIds',
            message: `Invalid UUID: ${memberId}`,
            value: row.includedMemberIds,
          });
        } else if (!validMemberIds.has(memberId)) {
          errors.push({
            row: rowNumber,
            field: 'includedMemberIds',
            message: `Not a member of this group: ${memberId}`,
            value: row.includedMemberIds,
          });
        }
      }
    }

    return errors;
  }

  private transformRow(row: CsvExpenseRow): ValidatedExpenseRow {
    const paidByMemberId =
      row.paidByMemberId && row.paidByMemberId.trim() !== ''
        ? row.paidByMemberId.trim()
        : null;

    const includedMemberIds =
      row.includedMemberIds && row.includedMemberIds.trim() !== ''
        ? row.includedMemberIds.split('|').map((id) => id.trim())
        : null;

    return {
      description: row.description.trim(),
      centAmount: parseInt(row.centAmount, 10),
      paidByMemberId,
      includedMemberIds,
    };
  }
}
