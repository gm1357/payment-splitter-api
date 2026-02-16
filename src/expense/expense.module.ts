import { Module } from '@nestjs/common';
import { ExpenseService } from './expense.service';
import { ExpenseController } from './expense.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CsvParserService } from './csv-parser.service';
import { S3Module } from '../infra/s3/s3.module';
import { SqsModule } from '../infra/sqs/sqs.module';
import { SqsConsumerService } from './sqs-consumer.service';

@Module({
  controllers: [ExpenseController],
  providers: [ExpenseService, CsvParserService, SqsConsumerService],
  imports: [PrismaModule, S3Module, SqsModule],
})
export class ExpenseModule {}
