import { Test, TestingModule } from '@nestjs/testing';
import { CsvParserService } from './csv-parser.service';

describe('CsvParserService', () => {
  let service: CsvParserService;
  const validMemberIds = new Set([
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
  ]);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CsvParserService],
    }).compile();

    service = module.get<CsvParserService>(CsvParserService);
  });

  describe('parseAndValidate', () => {
    it('should parse a valid CSV with all fields', () => {
      const csv = `description,centAmount,paidByMemberId,includedMemberIds
Dinner at restaurant,15000,aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa,bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb|cccccccc-cccc-cccc-cccc-cccccccccccc`;

      const result = service.parseAndValidate(csv, validMemberIds);

      expect(result.errors).toHaveLength(0);
      expect(result.expenses).toHaveLength(1);
      expect(result.expenses[0]).toEqual({
        description: 'Dinner at restaurant',
        centAmount: 15000,
        paidByMemberId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        includedMemberIds: [
          'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          'cccccccc-cccc-cccc-cccc-cccccccccccc',
        ],
      });
    });

    it('should parse a CSV with optional fields empty', () => {
      const csv = `description,centAmount,paidByMemberId,includedMemberIds
Taxi ride,3500,,`;

      const result = service.parseAndValidate(csv, validMemberIds);

      expect(result.errors).toHaveLength(0);
      expect(result.expenses).toHaveLength(1);
      expect(result.expenses[0]).toEqual({
        description: 'Taxi ride',
        centAmount: 3500,
        paidByMemberId: null,
        includedMemberIds: null,
      });
    });

    it('should parse multiple rows', () => {
      const csv = `description,centAmount,paidByMemberId,includedMemberIds
Dinner,15000,,
Taxi,3500,aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa,
Movie,2400,,bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb|cccccccc-cccc-cccc-cccc-cccccccccccc`;

      const result = service.parseAndValidate(csv, validMemberIds);

      expect(result.errors).toHaveLength(0);
      expect(result.expenses).toHaveLength(3);
    });

    it('should return error for empty CSV', () => {
      const csv = '';

      const result = service.parseAndValidate(csv, validMemberIds);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toBe('CSV file is empty');
    });

    it('should return error for missing required headers', () => {
      const csv = `description,centAmount
Dinner,15000`;

      const result = service.parseAndValidate(csv, validMemberIds);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe('headers');
      expect(result.errors[0].message).toContain('Missing required headers');
      expect(result.errors[0].message).toContain('paidByMemberId');
      expect(result.errors[0].message).toContain('includedMemberIds');
    });

    it('should return error for missing description', () => {
      const csv = `description,centAmount,paidByMemberId,includedMemberIds
,15000,,`;

      const result = service.parseAndValidate(csv, validMemberIds);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        row: 2,
        field: 'description',
        message: 'Description is required',
        value: '',
      });
    });

    it('should return error for invalid centAmount', () => {
      const csv = `description,centAmount,paidByMemberId,includedMemberIds
Dinner,abc,,`;

      const result = service.parseAndValidate(csv, validMemberIds);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        row: 2,
        field: 'centAmount',
        message: 'Must be a valid integer',
        value: 'abc',
      });
    });

    it('should return error for negative centAmount', () => {
      const csv = `description,centAmount,paidByMemberId,includedMemberIds
Dinner,-100,,`;

      const result = service.parseAndValidate(csv, validMemberIds);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        row: 2,
        field: 'centAmount',
        message: 'Must be a positive integer',
        value: '-100',
      });
    });

    it('should return error for zero centAmount', () => {
      const csv = `description,centAmount,paidByMemberId,includedMemberIds
Dinner,0,,`;

      const result = service.parseAndValidate(csv, validMemberIds);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        row: 2,
        field: 'centAmount',
        message: 'Must be a positive integer',
        value: '0',
      });
    });

    it('should return error for invalid UUID in paidByMemberId', () => {
      const csv = `description,centAmount,paidByMemberId,includedMemberIds
Dinner,15000,not-a-uuid,`;

      const result = service.parseAndValidate(csv, validMemberIds);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        row: 2,
        field: 'paidByMemberId',
        message: 'Must be a valid UUID',
        value: 'not-a-uuid',
      });
    });

    it('should return error for non-member paidByMemberId', () => {
      const csv = `description,centAmount,paidByMemberId,includedMemberIds
Dinner,15000,dddddddd-dddd-dddd-dddd-dddddddddddd,`;

      const result = service.parseAndValidate(csv, validMemberIds);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        row: 2,
        field: 'paidByMemberId',
        message: 'Not a member of this group',
        value: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      });
    });

    it('should return error for invalid UUID in includedMemberIds', () => {
      const csv = `description,centAmount,paidByMemberId,includedMemberIds
Dinner,15000,,bad-uuid|aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`;

      const result = service.parseAndValidate(csv, validMemberIds);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe('includedMemberIds');
      expect(result.errors[0].message).toContain('Invalid UUID');
    });

    it('should return error for non-member in includedMemberIds', () => {
      const csv = `description,centAmount,paidByMemberId,includedMemberIds
Dinner,15000,,dddddddd-dddd-dddd-dddd-dddddddddddd|aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`;

      const result = service.parseAndValidate(csv, validMemberIds);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe('includedMemberIds');
      expect(result.errors[0].message).toContain('Not a member of this group');
    });

    it('should return multiple errors for multiple invalid rows', () => {
      const csv = `description,centAmount,paidByMemberId,includedMemberIds
,15000,,
Dinner,-100,,
Lunch,abc,,`;

      const result = service.parseAndValidate(csv, validMemberIds);

      expect(result.errors).toHaveLength(3);
      expect(result.errors.map((e) => e.row)).toEqual([2, 3, 4]);
    });

    it('should skip empty lines', () => {
      const csv = `description,centAmount,paidByMemberId,includedMemberIds
Dinner,15000,,

Lunch,3500,,`;

      const result = service.parseAndValidate(csv, validMemberIds);

      expect(result.errors).toHaveLength(0);
      expect(result.expenses).toHaveLength(2);
    });

    it('should trim whitespace from values', () => {
      const csv = `description,centAmount,paidByMemberId,includedMemberIds
  Dinner  ,  15000  ,  aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa  ,  bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb  `;

      const result = service.parseAndValidate(csv, validMemberIds);

      expect(result.errors).toHaveLength(0);
      expect(result.expenses[0]).toEqual({
        description: 'Dinner',
        centAmount: 15000,
        paidByMemberId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        includedMemberIds: ['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'],
      });
    });

    it('should return error for exceeding max rows', () => {
      const header = 'description,centAmount,paidByMemberId,includedMemberIds';
      const rows = Array(501).fill('Dinner,1500,,').join('\n');
      const csv = `${header}\n${rows}`;

      const result = service.parseAndValidate(csv, validMemberIds);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('exceeds maximum of 500 rows');
    });

    it('should handle CSV with quoted fields', () => {
      const csv = `description,centAmount,paidByMemberId,includedMemberIds
"Dinner at fancy restaurant, with wine",15000,,`;

      const result = service.parseAndValidate(csv, validMemberIds);

      expect(result.errors).toHaveLength(0);
      expect(result.expenses[0].description).toBe(
        'Dinner at fancy restaurant, with wine',
      );
    });

    it('should return error for invalid CSV format', () => {
      const csv = `description,centAmount,paidByMemberId,includedMemberIds
"unclosed quote,15000,,`;

      const result = service.parseAndValidate(csv, validMemberIds);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toBe('Invalid CSV format');
    });

    it('should parse valid rows even when some rows have errors', () => {
      const csv = `description,centAmount,paidByMemberId,includedMemberIds
Dinner,15000,,
,invalid,,
Lunch,3500,,`;

      const result = service.parseAndValidate(csv, validMemberIds);

      // Row 3 has two errors: empty description and invalid centAmount
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.expenses).toHaveLength(2);
      expect(result.expenses[0].description).toBe('Dinner');
      expect(result.expenses[1].description).toBe('Lunch');
    });
  });
});
