import { Injectable } from '@nestjs/common';
import { HealthCheckService, HealthIndicatorResult } from '@nestjs/terminus';
import { PrismaService } from 'src/prisma/prisma.service';

import { version } from '../../package.json';

@Injectable()
export class StatusService {
  constructor(
    private health: HealthCheckService,
    private prisma: PrismaService,
  ) {}

  async check() {
    const result = await this.health.check([() => this.checkDatabase()]);
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
      throw new DatabaseUnhealthyError();
    }
  }
}

class DatabaseUnhealthyError extends Error {
  causes = { database: { status: 'down' } };
  constructor() {
    super('Database is not reachable');
  }
}
