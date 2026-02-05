import { Injectable } from '@nestjs/common';
import { HealthCheckService, HealthIndicatorResult } from '@nestjs/terminus';
import { PrismaService } from 'src/prisma/prisma.service';
import { S3Service } from 'src/infra/s3/s3.service';
import { SqsService } from 'src/infra/sqs/sqs.service';

import { version } from '../../package.json';

@Injectable()
export class StatusService {
  constructor(
    private health: HealthCheckService,
    private prisma: PrismaService,
    private s3: S3Service,
    private sqs: SqsService,
  ) {}

  async check() {
    const result = await this.health.check([
      () => this.checkDatabase(),
      () => this.checkS3(),
      () => this.checkSqs(),
    ]);
    const mem = process.memoryUsage();

    return {
      status: result.status,
      version,
      nodeVersion: process.version,
      uptime: process.uptime(),
      memory: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
      },
      details: result.details,
    };
  }

  private async checkDatabase(): Promise<HealthIndicatorResult> {
    const start = performance.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const responseTimeMs = +(performance.now() - start).toFixed(2);
      return { database: { status: 'up', responseTimeMs } };
    } catch {
      throw new ServiceUnhealthyError('database');
    }
  }

  private async checkS3(): Promise<HealthIndicatorResult> {
    const start = performance.now();
    try {
      await this.s3.healthCheck();
      const responseTimeMs = +(performance.now() - start).toFixed(2);
      return { s3: { status: 'up', responseTimeMs } };
    } catch {
      throw new ServiceUnhealthyError('s3');
    }
  }

  private async checkSqs(): Promise<HealthIndicatorResult> {
    const start = performance.now();
    try {
      await this.sqs.healthCheck();
      const responseTimeMs = +(performance.now() - start).toFixed(2);
      return { sqs: { status: 'up', responseTimeMs } };
    } catch {
      throw new ServiceUnhealthyError('sqs');
    }
  }
}

class ServiceUnhealthyError extends Error {
  causes: Record<string, { status: string }>;
  constructor(service: string) {
    super(`${service} is not reachable`);
    this.causes = { [service]: { status: 'down' } };
  }
}
