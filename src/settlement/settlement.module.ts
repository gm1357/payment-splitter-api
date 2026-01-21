import { Module } from '@nestjs/common';
import { SettlementService } from './settlement.service';
import { SettlementController } from './settlement.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  controllers: [SettlementController],
  providers: [SettlementService],
  imports: [PrismaModule],
})
export class SettlementModule {}
