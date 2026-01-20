import { INestApplication } from '@nestjs/common';
import { createTestApp, resetDatabase, spec, TestUser } from './test-utils';

interface ExpenseSplit {
  centAmount: number;
  groupMemberId: string;
}

describe('ExpenseController (e2e)', () => {
  let app: INestApplication;
  let user1: TestUser;
  let user2: TestUser;
  let groupId: string;
  let user2MemberId: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);

    // Create user 1
    const user1Response = await spec()
      .post('/user')
      .withJson({
        name: 'User One',
        email: 'user1@example.com',
        password: 'password123',
      })
      .returns('res.body');

    const login1Response = await spec()
      .post('/auth/login')
      .withJson({
        email: 'user1@example.com',
        password: 'password123',
      })
      .returns('res.body');

    user1 = {
      id: user1Response.id,
      name: 'User One',
      email: 'user1@example.com',
      accessToken: login1Response.access_token,
    };

    // Create user 2
    const user2Response = await spec()
      .post('/user')
      .withJson({
        name: 'User Two',
        email: 'user2@example.com',
        password: 'password123',
      })
      .returns('res.body');

    const login2Response = await spec()
      .post('/auth/login')
      .withJson({
        email: 'user2@example.com',
        password: 'password123',
      })
      .returns('res.body');

    user2 = {
      id: user2Response.id,
      name: 'User Two',
      email: 'user2@example.com',
      accessToken: login2Response.access_token,
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

    // Get member IDs
    const members = await spec()
      .get('/group/{id}/members')
      .withPathParams('id', groupId)
      .withBearerToken(user1.accessToken)
      .returns('res.body');

    user2MemberId = (members as { id: string; user: { id: string } }[]).find(
      (m) => m.user.id === user2.id,
    )!.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /expense', () => {
    it('should create an expense with equal split among all members', async () => {
      await spec()
        .post('/expense')
        .withBearerToken(user1.accessToken)
        .withJson({
          groupId,
          description: 'Dinner',
          centAmount: 10000,
        })
        .expectStatus(201)
        .expect((ctx) => {
          expect(ctx.res.body.id).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
          );
          expect(ctx.res.body.description).toBe('Dinner');
          expect(ctx.res.body.centAmount).toBe(10000);
          expect(ctx.res.body.groupId).toBe(groupId);
          expect(ctx.res.body.splits).toHaveLength(2);
          // Each member should owe 5000 cents
          expect(
            (ctx.res.body.splits as ExpenseSplit[]).every(
              (s) => s.centAmount === 5000,
            ),
          ).toBe(true);
        });
    });

    it('should handle uneven splits correctly (remainder goes to first members by joinedAt)', async () => {
      await spec()
        .post('/expense')
        .withBearerToken(user1.accessToken)
        .withJson({
          groupId,
          description: 'Lunch',
          centAmount: 10001, // Odd amount, cannot split evenly
        })
        .expectStatus(201)
        .expect((ctx) => {
          const splits = ctx.res.body.splits as ExpenseSplit[];
          expect(splits).toHaveLength(2);
          // First member (user1 joined first) gets 5001, second gets 5000
          const amounts = splits.map((s) => s.centAmount).sort((a, b) => b - a);
          expect(amounts).toEqual([5001, 5000]);
        });
    });

    it('should allow specifying paidByMemberId', async () => {
      await spec()
        .post('/expense')
        .withBearerToken(user1.accessToken)
        .withJson({
          groupId,
          description: 'Taxi',
          centAmount: 3000,
          paidByMemberId: user2MemberId,
        })
        .expectStatus(201)
        .expect((ctx) => {
          expect(ctx.res.body.paidBy).toBe(user2MemberId);
        });
    });

    it('should return 401 without authentication', async () => {
      await spec()
        .post('/expense')
        .withJson({
          groupId,
          description: 'Dinner',
          centAmount: 10000,
        })
        .expectStatus(401);
    });

    it('should return 400 for missing required fields', async () => {
      await spec()
        .post('/expense')
        .withBearerToken(user1.accessToken)
        .withJson({})
        .expectStatus(400);
    });

    it('should return 400 if user is not a member of the group', async () => {
      // Create a third user who is not in the group
      await spec().post('/user').withJson({
        name: 'User Three',
        email: 'user3@example.com',
        password: 'password123',
      });

      const login3Response = await spec()
        .post('/auth/login')
        .withJson({
          email: 'user3@example.com',
          password: 'password123',
        })
        .returns('res.body');

      await spec()
        .post('/expense')
        .withBearerToken(login3Response.access_token)
        .withJson({
          groupId,
          description: 'Dinner',
          centAmount: 10000,
        })
        .expectStatus(400);
    });

    it('should return 400 for non-existent group', async () => {
      await spec()
        .post('/expense')
        .withBearerToken(user1.accessToken)
        .withJson({
          groupId: '00000000-0000-0000-0000-000000000000',
          description: 'Dinner',
          centAmount: 10000,
        })
        .expectStatus(400);
    });

    it('should return 400 for invalid paidByMemberId', async () => {
      await spec()
        .post('/expense')
        .withBearerToken(user1.accessToken)
        .withJson({
          groupId,
          description: 'Dinner',
          centAmount: 10000,
          paidByMemberId: '00000000-0000-0000-0000-000000000000',
        })
        .expectStatus(400);
    });

    it('should return 400 for negative amount', async () => {
      await spec()
        .post('/expense')
        .withBearerToken(user1.accessToken)
        .withJson({
          groupId,
          description: 'Dinner',
          centAmount: -100,
        })
        .expectStatus(400);
    });
  });

  describe('GET /expense/group/:groupId', () => {
    it('should return all expenses for a group', async () => {
      // Create two expenses
      await spec()
        .post('/expense')
        .withBearerToken(user1.accessToken)
        .withJson({
          groupId,
          description: 'Dinner',
          centAmount: 10000,
        });

      await spec()
        .post('/expense')
        .withBearerToken(user2.accessToken)
        .withJson({
          groupId,
          description: 'Lunch',
          centAmount: 5000,
        });

      await spec()
        .get('/expense/group/{groupId}')
        .withPathParams('groupId', groupId)
        .withBearerToken(user1.accessToken)
        .expectStatus(200)
        .expectJsonLength(2);
    });

    it('should return empty array if no expenses exist', async () => {
      await spec()
        .get('/expense/group/{groupId}')
        .withPathParams('groupId', groupId)
        .withBearerToken(user1.accessToken)
        .expectStatus(200)
        .expectJsonLength(0);
    });

    it('should return 401 without authentication', async () => {
      await spec()
        .get('/expense/group/{groupId}')
        .withPathParams('groupId', groupId)
        .expectStatus(401);
    });

    it('should return empty array if user is not a member of the group', async () => {
      // Create a third user who is not in the group
      await spec().post('/user').withJson({
        name: 'User Three',
        email: 'user3@example.com',
        password: 'password123',
      });

      const login3Response = await spec()
        .post('/auth/login')
        .withJson({
          email: 'user3@example.com',
          password: 'password123',
        })
        .returns('res.body');

      // Create an expense first
      await spec()
        .post('/expense')
        .withBearerToken(user1.accessToken)
        .withJson({
          groupId,
          description: 'Dinner',
          centAmount: 10000,
        });

      // Non-member trying to view expenses
      await spec()
        .get('/expense/group/{groupId}')
        .withPathParams('groupId', groupId)
        .withBearerToken(login3Response.access_token)
        .expectStatus(200)
        .expectJsonLength(0);
    });
  });
});
