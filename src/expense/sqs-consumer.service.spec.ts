import { Test, TestingModule } from '@nestjs/testing';
import { SqsConsumerService } from './sqs-consumer.service';
import { SqsService } from 'src/infra/sqs/sqs.service';
import { S3Service } from 'src/infra/s3/s3.service';
import { ExpenseService } from './expense.service';

describe('SqsConsumerService', () => {
  let service: SqsConsumerService;

  const mockSqsService = {
    receiveMessages: jest.fn(),
    deleteMessage: jest.fn(),
    sendMessage: jest.fn(),
  };

  const mockS3Service = {
    download: jest.fn(),
  };

  const mockExpenseService = {
    createBatch: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Prevent automatic polling in tests
    jest
      .spyOn(SqsConsumerService.prototype, 'onModuleInit')
      .mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SqsConsumerService,
        { provide: SqsService, useValue: mockSqsService },
        { provide: S3Service, useValue: mockS3Service },
        { provide: ExpenseService, useValue: mockExpenseService },
      ],
    }).compile();

    service = module.get<SqsConsumerService>(SqsConsumerService);
  });

  describe('processMessage (via poll)', () => {
    it('should download CSV from S3, create batch, and delete message', async () => {
      const messageBody = JSON.stringify({
        s3Key: 'expenses/group-1/123-file.csv',
        groupId: 'group-1',
        userId: 'user-1',
      });

      mockS3Service.download.mockResolvedValue('csv-content');
      mockExpenseService.createBatch.mockResolvedValue({
        created: 1,
        expenses: [],
      });
      mockSqsService.deleteMessage.mockResolvedValue(undefined);

      // Simulate one poll cycle: return messages then stop
      mockSqsService.receiveMessages
        .mockResolvedValueOnce([
          {
            MessageId: 'msg-1',
            Body: messageBody,
            ReceiptHandle: 'receipt-1',
          },
        ])
        .mockImplementation(() => {
          // Stop polling after first batch
          service.onModuleDestroy();
          return Promise.resolve([]);
        });

      // Manually invoke onModuleInit (our spy blocked auto-start)
      (SqsConsumerService.prototype.onModuleInit as jest.Mock).mockRestore();
      service.onModuleInit();

      // Wait for the poll loop to process
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockS3Service.download).toHaveBeenCalledWith(
        'expenses/group-1/123-file.csv',
      );
      expect(mockExpenseService.createBatch).toHaveBeenCalledWith(
        'group-1',
        'csv-content',
        'user-1',
      );
      expect(mockSqsService.deleteMessage).toHaveBeenCalledWith('receipt-1');
    });

    it('should not delete message on processing failure', async () => {
      const messageBody = JSON.stringify({
        s3Key: 'expenses/group-1/123-file.csv',
        groupId: 'group-1',
        userId: 'user-1',
      });

      mockS3Service.download.mockResolvedValue('csv-content');
      mockExpenseService.createBatch.mockRejectedValue(
        new Error('Batch creation failed'),
      );

      mockSqsService.receiveMessages
        .mockResolvedValueOnce([
          {
            MessageId: 'msg-1',
            Body: messageBody,
            ReceiptHandle: 'receipt-1',
          },
        ])
        .mockImplementation(() => {
          service.onModuleDestroy();
          return Promise.resolve([]);
        });

      (SqsConsumerService.prototype.onModuleInit as jest.Mock).mockRestore();
      service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockS3Service.download).toHaveBeenCalled();
      expect(mockExpenseService.createBatch).toHaveBeenCalled();
      expect(mockSqsService.deleteMessage).not.toHaveBeenCalled();
    });

    it('should delete malformed messages', async () => {
      mockSqsService.receiveMessages
        .mockResolvedValueOnce([
          {
            MessageId: 'msg-1',
            Body: 'not-valid-json',
            ReceiptHandle: 'receipt-1',
          },
        ])
        .mockImplementation(() => {
          service.onModuleDestroy();
          return Promise.resolve([]);
        });

      mockSqsService.deleteMessage.mockResolvedValue(undefined);

      (SqsConsumerService.prototype.onModuleInit as jest.Mock).mockRestore();
      service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockSqsService.deleteMessage).toHaveBeenCalledWith('receipt-1');
      expect(mockS3Service.download).not.toHaveBeenCalled();
    });
  });

  describe('onModuleDestroy', () => {
    it('should stop polling', () => {
      service.onModuleDestroy();
      // No assertion needed — verifying it doesn't throw
    });
  });
});
