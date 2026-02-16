import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { PrismaModule } from '../prisma/prisma.module';
import { S3Module } from '../infra/s3/s3.module';
import { SqsModule } from '../infra/sqs/sqs.module';
import { StatusController } from './status.controller';
import { StatusService } from './status.service';

@Module({
  imports: [TerminusModule, PrismaModule, S3Module, SqsModule],
  controllers: [StatusController],
  providers: [StatusService],
})
export class StatusModule {}
