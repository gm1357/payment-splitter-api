import { Settlement, GroupMember } from 'generated/prisma/client';

export type SettlementWithMembers = Settlement & {
  fromMember: GroupMember;
  toMember: GroupMember;
};
