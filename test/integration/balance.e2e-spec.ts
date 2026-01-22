import { INestApplication } from '@nestjs/common';
import { createTestApp, resetDatabase, spec, TestUser } from './test-utils';

interface MemberBalance {
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

interface BalanceResponse {
  groupId: string;
  groupName: string;
  balances: MemberBalance[];
  totalExpenses: number;
  totalSettled: number;
}

describe('BalanceController (e2e)', () => {
  let app: INestApplication;
  let user1: TestUser;
  let user2: TestUser;
  let user3: TestUser;
  let groupId: string;
  let user1MemberId: string;
  let user2MemberId: string;
  let user3MemberId: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);

    // Create user 1
    const user1Response = await spec()
      .post('/user')
      .withJson({
        name: 'Alice',
        email: 'alice@example.com',
        password: 'password123',
      })
      .returns('res.body');

    const login1Response = await spec()
      .post('/auth/login')
      .withJson({
        email: 'alice@example.com',
        password: 'password123',
      })
      .returns('res.body');

    user1 = {
      id: user1Response.id,
      name: 'Alice',
      email: 'alice@example.com',
      accessToken: login1Response.access_token,
    };

    // Create user 2
    const user2Response = await spec()
      .post('/user')
      .withJson({
        name: 'Bob',
        email: 'bob@example.com',
        password: 'password123',
      })
      .returns('res.body');

    const login2Response = await spec()
      .post('/auth/login')
      .withJson({
        email: 'bob@example.com',
        password: 'password123',
      })
      .returns('res.body');

    user2 = {
      id: user2Response.id,
      name: 'Bob',
      email: 'bob@example.com',
      accessToken: login2Response.access_token,
    };

    // Create user 3
    const user3Response = await spec()
      .post('/user')
      .withJson({
        name: 'Charlie',
        email: 'charlie@example.com',
        password: 'password123',
      })
      .returns('res.body');

    const login3Response = await spec()
      .post('/auth/login')
      .withJson({
        email: 'charlie@example.com',
        password: 'password123',
      })
      .returns('res.body');

    user3 = {
      id: user3Response.id,
      name: 'Charlie',
      email: 'charlie@example.com',
      accessToken: login3Response.access_token,
    };

    // Create a group with user1 as creator (automatically becomes member)
    groupId = await spec()
      .post('/group')
      .withBearerToken(user1.accessToken)
      .withJson({ name: 'Trip Expenses' })
      .returns('id');

    // User2 joins the group
    await spec()
      .post('/group/{id}/join')
      .withPathParams('id', groupId)
      .withBearerToken(user2.accessToken);

    // User3 joins the group
    await spec()
      .post('/group/{id}/join')
      .withPathParams('id', groupId)
      .withBearerToken(user3.accessToken);

    // Get member IDs
    const members = await spec()
      .get('/group/{id}/members')
      .withPathParams('id', groupId)
      .withBearerToken(user1.accessToken)
      .returns('res.body');

    user1MemberId = (members as { id: string; user: { id: string } }[]).find(
      (m) => m.user.id === user1.id,
    )!.id;
    user2MemberId = (members as { id: string; user: { id: string } }[]).find(
      (m) => m.user.id === user2.id,
    )!.id;
    user3MemberId = (members as { id: string; user: { id: string } }[]).find(
      (m) => m.user.id === user3.id,
    )!.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /balance/group/:groupId', () => {
    it('should return zero balances for a group with no expenses', async () => {
      await spec()
        .get('/balance/group/{groupId}')
        .withPathParams('groupId', groupId)
        .withBearerToken(user1.accessToken)
        .expectStatus(200)
        .expect((ctx) => {
          const body = ctx.res.body as BalanceResponse;
          expect(body.groupId).toBe(groupId);
          expect(body.groupName).toBe('Trip Expenses');
          expect(body.totalExpenses).toBe(0);
          expect(body.totalSettled).toBe(0);
          expect(body.balances).toHaveLength(3);
          body.balances.forEach((b) => {
            expect(b.netBalance).toBe(0);
            expect(b.totalPaid).toBe(0);
            expect(b.totalOwed).toBe(0);
          });
        });
    });

    it('should return correct balances after one expense', async () => {
      // Alice pays 9000 cents for dinner, split equally among 3 members
      await spec()
        .post('/expense')
        .withBearerToken(user1.accessToken)
        .withJson({
          groupId,
          description: 'Dinner',
          centAmount: 9000,
        });

      await spec()
        .get('/balance/group/{groupId}')
        .withPathParams('groupId', groupId)
        .withBearerToken(user1.accessToken)
        .expectStatus(200)
        .expect((ctx) => {
          const body = ctx.res.body as BalanceResponse;
          expect(body.totalExpenses).toBe(9000);
          expect(body.totalSettled).toBe(0);

          // Find balances by user name
          const aliceBalance = body.balances.find(
            (b) => b.userName === 'Alice',
          );
          const bobBalance = body.balances.find((b) => b.userName === 'Bob');
          const charlieBalance = body.balances.find(
            (b) => b.userName === 'Charlie',
          );

          // Alice paid 9000, owes 3000, net = +6000 (is owed 6000)
          expect(aliceBalance!.totalPaid).toBe(9000);
          expect(aliceBalance!.totalOwed).toBe(3000);
          expect(aliceBalance!.netBalance).toBe(6000);

          // Bob paid 0, owes 3000, net = -3000 (owes 3000)
          expect(bobBalance!.totalPaid).toBe(0);
          expect(bobBalance!.totalOwed).toBe(3000);
          expect(bobBalance!.netBalance).toBe(-3000);

          // Charlie paid 0, owes 3000, net = -3000 (owes 3000)
          expect(charlieBalance!.totalPaid).toBe(0);
          expect(charlieBalance!.totalOwed).toBe(3000);
          expect(charlieBalance!.netBalance).toBe(-3000);
        });
    });

    it('should include settlements in balance calculation', async () => {
      // Alice pays 9000 cents
      await spec()
        .post('/expense')
        .withBearerToken(user1.accessToken)
        .withJson({
          groupId,
          description: 'Dinner',
          centAmount: 9000,
        });

      // Bob settles 2000 to Alice
      await spec()
        .post('/settlement')
        .withBearerToken(user2.accessToken)
        .withJson({
          groupId,
          fromMemberId: user2MemberId,
          toMemberId: user1MemberId,
          centAmount: 2000,
        });

      await spec()
        .get('/balance/group/{groupId}')
        .withPathParams('groupId', groupId)
        .withBearerToken(user1.accessToken)
        .expectStatus(200)
        .expect((ctx) => {
          const body = ctx.res.body as BalanceResponse;
          expect(body.totalSettled).toBe(2000);

          const aliceBalance = body.balances.find(
            (b) => b.userName === 'Alice',
          );
          const bobBalance = body.balances.find((b) => b.userName === 'Bob');

          // Alice: (9000 + 0) - (3000 + 2000) = 4000 (still owed 4000)
          expect(aliceBalance!.settlementsReceived).toBe(2000);
          expect(aliceBalance!.settlementsPaid).toBe(0);
          expect(aliceBalance!.netBalance).toBe(4000);

          // Bob: (0 + 2000) - (3000 + 0) = -1000 (still owes 1000)
          expect(bobBalance!.settlementsReceived).toBe(0);
          expect(bobBalance!.settlementsPaid).toBe(2000);
          expect(bobBalance!.netBalance).toBe(-1000);
        });
    });

    it('should handle uneven split (remainder distributed to first members)', async () => {
      // 10001 cents split among 3 = 3334 + 3334 + 3333
      await spec()
        .post('/expense')
        .withBearerToken(user1.accessToken)
        .withJson({
          groupId,
          description: 'Lunch',
          centAmount: 10001,
        });

      await spec()
        .get('/balance/group/{groupId}')
        .withPathParams('groupId', groupId)
        .withBearerToken(user1.accessToken)
        .expectStatus(200)
        .expect((ctx) => {
          const body = ctx.res.body as BalanceResponse;
          expect(body.totalExpenses).toBe(10001);

          // Sum of all totalOwed should equal totalExpenses
          const totalOwedSum = body.balances.reduce(
            (sum, b) => sum + b.totalOwed,
            0,
          );
          expect(totalOwedSum).toBe(10001);

          // Sum of all netBalances should be 0
          const netBalanceSum = body.balances.reduce(
            (sum, b) => sum + b.netBalance,
            0,
          );
          expect(netBalanceSum).toBe(0);
        });
    });

    it('should return 401 without authentication', async () => {
      await spec()
        .get('/balance/group/{groupId}')
        .withPathParams('groupId', groupId)
        .expectStatus(401);
    });

    it('should return 400 for non-existent group', async () => {
      await spec()
        .get('/balance/group/{groupId}')
        .withPathParams('groupId', '00000000-0000-0000-0000-000000000000')
        .withBearerToken(user1.accessToken)
        .expectStatus(400);
    });

    it('should return 400 for non-member', async () => {
      // Create a fourth user who is not in the group
      await spec().post('/user').withJson({
        name: 'Dave',
        email: 'dave@example.com',
        password: 'password123',
      });

      const loginResponse = await spec()
        .post('/auth/login')
        .withJson({
          email: 'dave@example.com',
          password: 'password123',
        })
        .returns('res.body');

      await spec()
        .get('/balance/group/{groupId}')
        .withPathParams('groupId', groupId)
        .withBearerToken(loginResponse.access_token)
        .expectStatus(400);
    });
  });

  describe('GET /balance/group/:groupId/suggest', () => {
    it('should return empty array when all balances are zero', async () => {
      await spec()
        .get('/balance/group/{groupId}/suggest')
        .withPathParams('groupId', groupId)
        .withBearerToken(user1.accessToken)
        .expectStatus(200)
        .expectJsonLength(0);
    });

    it('should suggest settlements to balance the group', async () => {
      // Alice pays 9000 cents, split equally among 3 members
      await spec()
        .post('/expense')
        .withBearerToken(user1.accessToken)
        .withJson({
          groupId,
          description: 'Dinner',
          centAmount: 9000,
        });

      await spec()
        .get('/balance/group/{groupId}/suggest')
        .withPathParams('groupId', groupId)
        .withBearerToken(user1.accessToken)
        .expectStatus(200)
        .expect((ctx) => {
          const suggestions = ctx.res.body as {
            fromMemberId: string;
            toMemberId: string;
            centAmount: number;
          }[];

          // Should have 2 suggestions (Bob → Alice, Charlie → Alice)
          expect(suggestions).toHaveLength(2);

          // All suggestions should be TO Alice
          suggestions.forEach((s) => {
            expect(s.toMemberId).toBe(user1MemberId);
          });

          // Total suggested amount should equal what Alice is owed (6000)
          const totalSuggested = suggestions.reduce(
            (sum, s) => sum + s.centAmount,
            0,
          );
          expect(totalSuggested).toBe(6000);
        });
    });

    it('should account for existing settlements in suggestions', async () => {
      // Alice pays 9000 cents
      await spec()
        .post('/expense')
        .withBearerToken(user1.accessToken)
        .withJson({
          groupId,
          description: 'Dinner',
          centAmount: 9000,
        });

      // Bob settles 3000 to Alice (his full share)
      await spec()
        .post('/settlement')
        .withBearerToken(user2.accessToken)
        .withJson({
          groupId,
          fromMemberId: user2MemberId,
          toMemberId: user1MemberId,
          centAmount: 3000,
        });

      await spec()
        .get('/balance/group/{groupId}/suggest')
        .withPathParams('groupId', groupId)
        .withBearerToken(user1.accessToken)
        .expectStatus(200)
        .expect((ctx) => {
          const suggestions = ctx.res.body as {
            fromMemberId: string;
            toMemberId: string;
            centAmount: number;
          }[];

          // Should only have 1 suggestion now (Charlie → Alice)
          expect(suggestions).toHaveLength(1);
          expect(suggestions[0].fromMemberId).toBe(user3MemberId);
          expect(suggestions[0].toMemberId).toBe(user1MemberId);
          expect(suggestions[0].centAmount).toBe(3000);
        });
    });

    it('should return empty when group is fully settled', async () => {
      // Alice pays 6000 cents, split equally among 3 members (2000 each)
      await spec()
        .post('/expense')
        .withBearerToken(user1.accessToken)
        .withJson({
          groupId,
          description: 'Lunch',
          centAmount: 6000,
        });

      // Bob settles his share
      await spec()
        .post('/settlement')
        .withBearerToken(user2.accessToken)
        .withJson({
          groupId,
          fromMemberId: user2MemberId,
          toMemberId: user1MemberId,
          centAmount: 2000,
        });

      // Charlie settles his share
      await spec()
        .post('/settlement')
        .withBearerToken(user3.accessToken)
        .withJson({
          groupId,
          fromMemberId: user3MemberId,
          toMemberId: user1MemberId,
          centAmount: 2000,
        });

      await spec()
        .get('/balance/group/{groupId}/suggest')
        .withPathParams('groupId', groupId)
        .withBearerToken(user1.accessToken)
        .expectStatus(200)
        .expectJsonLength(0);
    });

    it('should handle multiple payers correctly', async () => {
      // Alice pays 6000 cents
      await spec()
        .post('/expense')
        .withBearerToken(user1.accessToken)
        .withJson({
          groupId,
          description: 'Dinner',
          centAmount: 6000,
        });

      // Bob pays 3000 cents
      await spec()
        .post('/expense')
        .withBearerToken(user2.accessToken)
        .withJson({
          groupId,
          description: 'Drinks',
          centAmount: 3000,
          paidByMemberId: user2MemberId,
        });

      // Total: 9000, each owes 3000
      // Alice: paid 6000, owes 3000, net = +3000
      // Bob: paid 3000, owes 3000, net = 0
      // Charlie: paid 0, owes 3000, net = -3000

      await spec()
        .get('/balance/group/{groupId}/suggest')
        .withPathParams('groupId', groupId)
        .withBearerToken(user1.accessToken)
        .expectStatus(200)
        .expect((ctx) => {
          const suggestions = ctx.res.body as {
            fromMemberId: string;
            toMemberId: string;
            centAmount: number;
          }[];

          // Should have 1 suggestion (Charlie → Alice for 3000)
          expect(suggestions).toHaveLength(1);
          expect(suggestions[0].fromMemberId).toBe(user3MemberId);
          expect(suggestions[0].toMemberId).toBe(user1MemberId);
          expect(suggestions[0].centAmount).toBe(3000);
        });
    });

    it('should return 401 without authentication', async () => {
      await spec()
        .get('/balance/group/{groupId}/suggest')
        .withPathParams('groupId', groupId)
        .expectStatus(401);
    });

    it('should return 400 for non-existent group', async () => {
      await spec()
        .get('/balance/group/{groupId}/suggest')
        .withPathParams('groupId', '00000000-0000-0000-0000-000000000000')
        .withBearerToken(user1.accessToken)
        .expectStatus(400);
    });

    it('should return 400 for non-member', async () => {
      // Create a fourth user who is not in the group
      await spec().post('/user').withJson({
        name: 'Dave',
        email: 'dave@example.com',
        password: 'password123',
      });

      const loginResponse = await spec()
        .post('/auth/login')
        .withJson({
          email: 'dave@example.com',
          password: 'password123',
        })
        .returns('res.body');

      await spec()
        .get('/balance/group/{groupId}/suggest')
        .withPathParams('groupId', groupId)
        .withBearerToken(loginResponse.access_token)
        .expectStatus(400);
    });
  });
});
