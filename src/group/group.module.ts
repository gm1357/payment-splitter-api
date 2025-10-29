import { Module } from '@nestjs/common';
import { GroupService } from './group.service';
import { GroupController } from './group.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  controllers: [GroupController],
  providers: [GroupService],
  imports: [PrismaModule],
})
export class GroupModule {}
