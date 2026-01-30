import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { S3Service } from './s3.service';

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    PutObjectCommand: jest
      .fn()
      .mockImplementation((input: Record<string, unknown>) => ({
        ...input,
        _command: 'PutObjectCommand',
      })),
    CreateBucketCommand: jest
      .fn()
      .mockImplementation((input: Record<string, unknown>) => ({
        ...input,
        _command: 'CreateBucketCommand',
      })),
    HeadBucketCommand: jest
      .fn()
      .mockImplementation((input: Record<string, unknown>) => ({
        ...input,
        _command: 'HeadBucketCommand',
      })),
  };
});

describe('S3Service', () => {
  let service: S3Service;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      const config: Record<string, string> = {
        AWS_S3_ENDPOINT: 'http://localhost:4566',
        AWS_S3_REGION: 'us-east-1',
        AWS_S3_BUCKET: 'test-bucket',
        AWS_S3_ACCESS_KEY_ID: 'test',
        AWS_S3_SECRET_ACCESS_KEY: 'test',
      };
      return config[key] ?? defaultValue;
    }),
  };

  beforeEach(async () => {
    mockSend.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        S3Service,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<S3Service>(S3Service);
  });

  describe('onModuleInit', () => {
    it('should not create bucket if it already exists', async () => {
      mockSend.mockResolvedValueOnce({});

      await service.onModuleInit();

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'test-bucket',
          _command: 'HeadBucketCommand',
        }),
      );
    });

    it('should create bucket if it does not exist', async () => {
      const notFoundError = Object.assign(new Error('Not found'), {
        $metadata: { httpStatusCode: 404 },
      });
      mockSend.mockRejectedValueOnce(notFoundError);
      mockSend.mockResolvedValueOnce({});

      await service.onModuleInit();

      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'test-bucket',
          _command: 'CreateBucketCommand',
        }),
      );
    });
  });

  describe('upload', () => {
    it('should call PutObjectCommand with correct params', async () => {
      mockSend.mockResolvedValueOnce({});

      await service.upload('test-key', Buffer.from('test-content'), 'text/csv');

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'test-bucket',
          Key: 'test-key',
          Body: Buffer.from('test-content'),
          ContentType: 'text/csv',
          _command: 'PutObjectCommand',
        }),
      );
    });

    it('should propagate error on upload failure', async () => {
      mockSend.mockRejectedValueOnce(new Error('Upload failed'));

      await expect(
        service.upload('test-key', Buffer.from('data'), 'text/csv'),
      ).rejects.toThrow('Upload failed');
    });
  });
});
