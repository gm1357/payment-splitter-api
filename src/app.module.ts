import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PersonModule } from './person/person.module';

@Module({
  imports: [ConfigModule.forRoot(), PersonModule],
})
export class AppModule {}
