import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthCheckService } from '@nestjs/terminus';
import { StatusService } from './status.service';
import { PrismaService } from 'src/prisma/prisma.service';

describe('StatusService', () => {
  let service: StatusService;

  const mockPrismaService = {
    $queryRaw: jest.fn(),
  };

  const mockHealthCheckService = {
    check: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatusService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: HealthCheckService, useValue: mockHealthCheckService },
      ],
    }).compile();

    service = module.get<StatusService>(StatusService);

    jest.clearAllMocks();
  });

  describe('check', () => {
    it('should return status ok when database is healthy', async () => {
      mockHealthCheckService.check.mockImplementation(async (indicators) => {
        const details = {};
        for (const indicator of indicators) {
          const result = await indicator();
          Object.assign(details, result);
        }
        return { status: 'ok', details };
      });
      mockPrismaService.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

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
    });

    it('should throw when database is unhealthy', async () => {
      mockHealthCheckService.check.mockImplementation(async (indicators) => {
        for (const indicator of indicators) {
          await indicator();
        }
      });
      mockPrismaService.$queryRaw.mockRejectedValue(
        new Error('Connection refused'),
      );

      await expect(service.check()).rejects.toThrow();
    });
  });
});
