import { Module } from '@nestjs/common';
import { BalanceService } from './balance.service';
import { BalanceController } from './balance.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  controllers: [BalanceController],
  providers: [BalanceService],
  imports: [PrismaModule],
})
export class BalanceModule {}
