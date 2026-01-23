import { MemberBalanceDto } from './member-balance.dto';

export class BalanceResponseDto {
  groupId: string;
  groupName: string;
  balances: MemberBalanceDto[];
  totalExpenses: number;
  totalSettled: number;
}
