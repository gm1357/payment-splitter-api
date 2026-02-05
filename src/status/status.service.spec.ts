import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckService } from '@nestjs/terminus';
import { StatusService } from './status.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { S3Service } from 'src/infra/s3/s3.service';
import { SqsService } from 'src/infra/sqs/sqs.service';

describe('StatusService', () => {
  let service: StatusService;

  const mockPrismaService = {
    $queryRaw: jest.fn(),
  };

  const mockS3Service = {
    healthCheck: jest.fn(),
  };

  const mockSqsService = {
    healthCheck: jest.fn(),
  };

  const mockHealthCheckService = {
    check: jest.fn(),
  };

  const runIndicators = async (indicators) => {
    const details = {};
    for (const indicator of indicators) {
      const result = await indicator();
      Object.assign(details, result);
    }
    return { status: 'ok', details };
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatusService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: S3Service, useValue: mockS3Service },
        { provide: SqsService, useValue: mockSqsService },
        { provide: HealthCheckService, useValue: mockHealthCheckService },
      ],
    }).compile();

    service = module.get<StatusService>(StatusService);

    jest.clearAllMocks();
  });

  describe('check', () => {
    it('should return status ok when all services are healthy', async () => {
      mockHealthCheckService.check.mockImplementation(runIndicators);
      mockPrismaService.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      mockS3Service.healthCheck.mockResolvedValue(undefined);
      mockSqsService.healthCheck.mockResolvedValue(undefined);

      const result = await service.check();

      expect(result.status).toBe('ok');
      expect(result.version).toBeDefined();
      expect(result.nodeVersion).toMatch(/^v\d+/);
      expect(result.uptime).toBeGreaterThan(0);
      expect(result.memory).toEqual(
        expect.objectContaining({
          rss: expect.any(Number),
          heapUsed: expect.any(Number),
          heapTotal: expect.any(Number),
        }),
      );
      expect(result.details.database.status).toBe('up');
      expect(result.details.database.responseTimeMs).toEqual(
        expect.any(Number),
      );
      expect(result.details.s3.status).toBe('up');
      expect(result.details.s3.responseTimeMs).toEqual(expect.any(Number));
      expect(result.details.sqs.status).toBe('up');
      expect(result.details.sqs.responseTimeMs).toEqual(expect.any(Number));
    });

    it('should throw when database is unhealthy', async () => {
      mockHealthCheckService.check.mockImplementation(runIndicators);
      mockPrismaService.$queryRaw.mockRejectedValue(
        new Error('Connection refused'),
      );

      await expect(service.check()).rejects.toThrow();
    });

    it('should throw when S3 is unhealthy', async () => {
      mockHealthCheckService.check.mockImplementation(runIndicators);
      mockPrismaService.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      mockS3Service.healthCheck.mockRejectedValue(
        new Error('Bucket not found'),
      );

      await expect(service.check()).rejects.toThrow();
    });

    it('should throw when SQS is unhealthy', async () => {
      mockHealthCheckService.check.mockImplementation(runIndicators);
      mockPrismaService.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      mockS3Service.healthCheck.mockResolvedValue(undefined);
      mockSqsService.healthCheck.mockRejectedValue(
        new Error('Queue not found'),
      );

      await expect(service.check()).rejects.toThrow();
    });
  });
});
