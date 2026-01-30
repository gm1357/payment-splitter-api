import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SqsService } from './sqs.service';

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-sqs', () => {
  return {
    SQSClient: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    SendMessageCommand: jest
      .fn()
      .mockImplementation((input: Record<string, unknown>) => ({
        ...input,
        _command: 'SendMessageCommand',
      })),
    ReceiveMessageCommand: jest
      .fn()
      .mockImplementation((input: Record<string, unknown>) => ({
        ...input,
        _command: 'ReceiveMessageCommand',
      })),
    DeleteMessageCommand: jest
      .fn()
      .mockImplementation((input: Record<string, unknown>) => ({
        ...input,
        _command: 'DeleteMessageCommand',
      })),
    CreateQueueCommand: jest
      .fn()
      .mockImplementation((input: Record<string, unknown>) => ({
        ...input,
        _command: 'CreateQueueCommand',
      })),
    GetQueueUrlCommand: jest
      .fn()
      .mockImplementation((input: Record<string, unknown>) => ({
        ...input,
        _command: 'GetQueueUrlCommand',
      })),
  };
});

describe('SqsService', () => {
  let service: SqsService;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      const config: Record<string, string> = {
        AWS_SQS_ENDPOINT: 'http://localhost:4566',
        AWS_SQS_REGION: 'us-east-1',
        AWS_SQS_QUEUE_NAME: 'test-queue',
        AWS_SQS_ACCESS_KEY_ID: 'test',
        AWS_SQS_SECRET_ACCESS_KEY: 'test',
      };
      return config[key] ?? defaultValue;
    }),
  };

  beforeEach(async () => {
    mockSend.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SqsService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<SqsService>(SqsService);
  });

  describe('onModuleInit', () => {
    it('should not create queue if it already exists', async () => {
      mockSend.mockResolvedValueOnce({
        QueueUrl: 'http://localhost:4566/000000000000/test-queue',
      });

      await service.onModuleInit();

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          QueueName: 'test-queue',
          _command: 'GetQueueUrlCommand',
        }),
      );
    });

    it('should create queue if it does not exist', async () => {
      const notFoundError = Object.assign(new Error('Queue does not exist'), {
        name: 'QueueDoesNotExist',
      });
      mockSend.mockRejectedValueOnce(notFoundError);
      mockSend.mockResolvedValueOnce({
        QueueUrl: 'http://localhost:4566/000000000000/test-queue',
      });

      await service.onModuleInit();

      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          QueueName: 'test-queue',
          _command: 'CreateQueueCommand',
        }),
      );
    });

    it('should create queue when NonExistentQueue error is thrown', async () => {
      const notFoundError = Object.assign(new Error('Non existent queue'), {
        name: 'AWS.SimpleQueueService.NonExistentQueue',
      });
      mockSend.mockRejectedValueOnce(notFoundError);
      mockSend.mockResolvedValueOnce({
        QueueUrl: 'http://localhost:4566/000000000000/test-queue',
      });

      await service.onModuleInit();

      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          QueueName: 'test-queue',
          _command: 'CreateQueueCommand',
        }),
      );
    });
  });

  describe('sendMessage', () => {
    it('should send a JSON-stringified message', async () => {
      // Init queue URL first
      mockSend.mockResolvedValueOnce({
        QueueUrl: 'http://localhost:4566/000000000000/test-queue',
      });
      await service.onModuleInit();

      mockSend.mockResolvedValueOnce({});

      const body = { s3Key: 'expenses/123/file.csv', groupId: '123' };
      await service.sendMessage(body);

      expect(mockSend).toHaveBeenLastCalledWith(
        expect.objectContaining({
          QueueUrl: 'http://localhost:4566/000000000000/test-queue',
          MessageBody: JSON.stringify(body),
          _command: 'SendMessageCommand',
        }),
      );
    });
  });

  describe('receiveMessages', () => {
    it('should long-poll for messages', async () => {
      mockSend.mockResolvedValueOnce({
        QueueUrl: 'http://localhost:4566/000000000000/test-queue',
      });
      await service.onModuleInit();

      const messages = [{ MessageId: '1', Body: '{}', ReceiptHandle: 'rh1' }];
      mockSend.mockResolvedValueOnce({ Messages: messages });

      const result = await service.receiveMessages();

      expect(result).toEqual(messages);
      expect(mockSend).toHaveBeenLastCalledWith(
        expect.objectContaining({
          QueueUrl: 'http://localhost:4566/000000000000/test-queue',
          WaitTimeSeconds: 20,
          MaxNumberOfMessages: 10,
          _command: 'ReceiveMessageCommand',
        }),
        expect.objectContaining({ abortSignal: undefined }),
      );
    });

    it('should return empty array when no messages', async () => {
      mockSend.mockResolvedValueOnce({
        QueueUrl: 'http://localhost:4566/000000000000/test-queue',
      });
      await service.onModuleInit();

      mockSend.mockResolvedValueOnce({});

      const result = await service.receiveMessages();

      expect(result).toEqual([]);
    });
  });

  describe('deleteMessage', () => {
    it('should delete a message by receipt handle', async () => {
      mockSend.mockResolvedValueOnce({
        QueueUrl: 'http://localhost:4566/000000000000/test-queue',
      });
      await service.onModuleInit();

      mockSend.mockResolvedValueOnce({});

      await service.deleteMessage('receipt-handle-123');

      expect(mockSend).toHaveBeenLastCalledWith(
        expect.objectContaining({
          QueueUrl: 'http://localhost:4566/000000000000/test-queue',
          ReceiptHandle: 'receipt-handle-123',
          _command: 'DeleteMessageCommand',
        }),
      );
    });
  });
});
