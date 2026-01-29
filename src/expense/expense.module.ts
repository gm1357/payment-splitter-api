import { Module } from '@nestjs/common';
import { ExpenseService } from './expense.service';
import { ExpenseController } from './expense.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { CsvParserService } from './csv-parser.service';
import { S3Module } from 'src/infra/s3/s3.module';

@Module({
  controllers: [ExpenseController],
  providers: [ExpenseService, CsvParserService],
  imports: [PrismaModule, S3Module],
})
export class ExpenseModule {}
