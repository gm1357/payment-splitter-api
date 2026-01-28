import { Module } from '@nestjs/common';
import { ExpenseService } from './expense.service';
import { ExpenseController } from './expense.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { CsvParserService } from './csv-parser.service';

@Module({
  controllers: [ExpenseController],
  providers: [ExpenseService, CsvParserService],
  imports: [PrismaModule],
})
export class ExpenseModule {}
