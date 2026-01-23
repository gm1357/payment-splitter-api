import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { GroupModule } from './group/group.module';
import { ExpenseModule } from './expense/expense.module';
import { SettlementModule } from './settlement/settlement.module';
import { BalanceModule } from './balance/balance.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    UserModule,
    AuthModule,
    GroupModule,
    ExpenseModule,
    SettlementModule,
    BalanceModule,
  ],
})
export class AppModule {}
