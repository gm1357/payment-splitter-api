import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { PrismaModule } from 'src/prisma/prisma.module';
import { StatusController } from './status.controller';
import { StatusService } from './status.service';

@Module({
  imports: [TerminusModule, PrismaModule],
  controllers: [StatusController],
  providers: [StatusService],
})
export class StatusModule {}
