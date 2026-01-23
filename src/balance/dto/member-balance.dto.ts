export class MemberBalanceDto {
  memberId: string;
  userId: string;
  userName: string;
  userEmail: string;
  totalPaid: number;
  totalOwed: number;
  settlementsReceived: number;
  settlementsPaid: number;
  netBalance: number;
}
