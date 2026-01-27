import { INestApplication } from '@nestjs/common';
import {
  createTestApp,
  deleteAllEmails,
  getEmails,
  getEmailTextById,
  resetDatabase,
  spec,
  TestUser,
} from './test-utils';

interface ExpenseSplit {
  centAmount: number;
  groupMemberId: string;
}

describe('ExpenseController (e2e)', () => {
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
    await deleteAllEmails();

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

    // Create user 3
    const user3Response = await spec()
      .post('/user')
      .withJson({
        name: 'User Three',
        email: 'user3@example.com',
        password: 'password123',
      })
      .returns('res.body');

    const login3Response = await spec()
      .post('/auth/login')
      .withJson({
        email: 'user3@example.com',
        password: 'password123',
      })
      .returns('res.body');

    user3 = {
      id: user3Response.id,
      name: 'User Three',
      email: 'user3@example.com',
      accessToken: login3Response.access_token,
    };

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

    const membersList = members as { id: string; user: { id: string } }[];
    user1MemberId = membersList.find((m) => m.user.id === user1.id)!.id;
    user2MemberId = membersList.find((m) => m.user.id === user2.id)!.id;
    user3MemberId = membersList.find((m) => m.user.id === user3.id)!.id;
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
          centAmount: 9000,
        })
        .expectStatus(201)
        .expect((ctx) => {
          expect(ctx.res.body.id).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
          );
          expect(ctx.res.body.description).toBe('Dinner');
          expect(ctx.res.body.centAmount).toBe(9000);
          expect(ctx.res.body.groupId).toBe(groupId);
          expect(ctx.res.body.splits).toHaveLength(3);
          // Each member should owe 3000 cents
          expect(
            (ctx.res.body.splits as ExpenseSplit[]).every(
              (s) => s.centAmount === 3000,
            ),
          ).toBe(true);
        });
    });

    it('should send emails to payer and involved members', async () => {
      await spec()
        .post('/expense')
        .withBearerToken(user1.accessToken)
        .withJson({
          groupId,
          description: 'Team Lunch',
          centAmount: 6000,
        })
        .expectStatus(201);

      const emailsSent = await getEmails();
      // Expect 3 emails: 1 for payer (user1), 1 for user2, 1 for user3
      expect(emailsSent.length).toBe(3);

      const recipients = emailsSent.flatMap((e) => e.recipients);
      expect(recipients).toContain(`<${user1.email}>`);
      expect(recipients).toContain(`<${user2.email}>`);
      expect(recipients).toContain(`<${user3.email}>`);

      const subjects = emailsSent.map((e) => e.subject);
      expect(subjects).toContain('Expense added - Trip Expenses');
      expect(
        subjects.filter((s) => s === 'New expense - Trip Expenses').length,
      ).toBe(2);

      // Verify content for payer
      const payerEmail = emailsSent.find((e) =>
        e.subject.includes('Expense added'),
      );
      const payerEmailText = await getEmailTextById(payerEmail!.id);

      expect(payerEmailText).toContain('Hi User One');
      expect(payerEmailText).toContain('Description: Team Lunch');
      expect(payerEmailText).toContain('Amount: $60.00');

      // Verify content for one of the split members
      const memberEmail = emailsSent.find(
        (e) =>
          e.subject.includes('New expense') &&
          e.recipients.includes(`<${user2.email}>`),
      );
      const memberEmailText = await getEmailTextById(memberEmail!.id);

      expect(memberEmailText).toContain('Hi User Two');
      expect(memberEmailText).toContain('User One added an expense');
      expect(memberEmailText).toContain('Description: Team Lunch');
      expect(memberEmailText).toContain('Total Amount: $60.00');
      expect(memberEmailText).toContain('Your Share: $20.00');
    });

    it('should handle uneven splits correctly (remainder goes to first members by joinedAt)', async () => {
      await spec()
        .post('/expense')
        .withBearerToken(user1.accessToken)
        .withJson({
          groupId,
          description: 'Lunch',
          centAmount: 10001, // Cannot split evenly among 3 members
        })
        .expectStatus(201)
        .expect((ctx) => {
          const splits = ctx.res.body.splits as ExpenseSplit[];
          expect(splits).toHaveLength(3);
          // 10001 / 3 = 3333 with remainder 2
          // First 2 members get 3334, third gets 3333
          const amounts = splits.map((s) => s.centAmount).sort((a, b) => b - a);
          expect(amounts).toEqual([3334, 3334, 3333]);
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
      // Create a fourth user who is not in the group
      await spec().post('/user').withJson({
        name: 'User Four',
        email: 'user4@example.com',
        password: 'password123',
      });

      const login4Response = await spec()
        .post('/auth/login')
        .withJson({
          email: 'user4@example.com',
          password: 'password123',
        })
        .returns('res.body');

      await spec()
        .post('/expense')
        .withBearerToken(login4Response.access_token)
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
      // Create a fourth user who is not in the group
      await spec().post('/user').withJson({
        name: 'User Four',
        email: 'user4@example.com',
        password: 'password123',
      });

      const login4Response = await spec()
        .post('/auth/login')
        .withJson({
          email: 'user4@example.com',
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
        .withBearerToken(login4Response.access_token)
        .expectStatus(200)
        .expectJsonLength(0);
    });
  });

  describe('POST /expense (partial splits)', () => {
    it('should create partial split with specified members only', async () => {
      await spec()
        .post('/expense')
        .withBearerToken(user1.accessToken)
        .withJson({
          groupId,
          description: 'Taxi',
          centAmount: 3000,
          includedMemberIds: [user1MemberId, user2MemberId],
        })
        .expectStatus(201)
        .expect((ctx) => {
          expect(ctx.res.body.splitType).toBe('PARTIAL');
          const splits = ctx.res.body.splits as ExpenseSplit[];
          expect(splits).toHaveLength(2);
          // Each of the 2 included members should owe 1500 cents
          expect(splits.every((s) => s.centAmount === 1500)).toBe(true);
          // Verify only included members are in splits
          const memberIds = splits.map((s) => s.groupMemberId);
          expect(memberIds).toContain(user1MemberId);
          expect(memberIds).toContain(user2MemberId);
          expect(memberIds).not.toContain(user3MemberId);
        });
    });

    it('should allow payer not in split (e.g., buying a gift)', async () => {
      await spec()
        .post('/expense')
        .withBearerToken(user1.accessToken)
        .withJson({
          groupId,
          description: 'Birthday gift for User 2',
          centAmount: 6000,
          paidByMemberId: user1MemberId,
          includedMemberIds: [user2MemberId, user3MemberId],
        })
        .expectStatus(201)
        .expect((ctx) => {
          expect(ctx.res.body.paidBy).toBe(user1MemberId);
          expect(ctx.res.body.splitType).toBe('PARTIAL');
          const splits = ctx.res.body.splits as ExpenseSplit[];
          expect(splits).toHaveLength(2);
          // user1 paid but is not in the split
          const memberIds = splits.map((s) => s.groupMemberId);
          expect(memberIds).not.toContain(user1MemberId);
          expect(memberIds).toContain(user2MemberId);
          expect(memberIds).toContain(user3MemberId);
        });
    });

    it('should return 400 for invalid member ID in includedMemberIds', async () => {
      await spec()
        .post('/expense')
        .withBearerToken(user1.accessToken)
        .withJson({
          groupId,
          description: 'Dinner',
          centAmount: 10000,
          includedMemberIds: [
            user1MemberId,
            '00000000-0000-0000-0000-000000000000',
          ],
        })
        .expectStatus(400);
    });

    it('should return 400 for non-UUID in includedMemberIds', async () => {
      await spec()
        .post('/expense')
        .withBearerToken(user1.accessToken)
        .withJson({
          groupId,
          description: 'Dinner',
          centAmount: 10000,
          includedMemberIds: [user1MemberId, 'not-a-uuid'],
        })
        .expectStatus(400);
    });

    it('should default to EQUAL_ALL when includedMemberIds is empty array', async () => {
      await spec()
        .post('/expense')
        .withBearerToken(user1.accessToken)
        .withJson({
          groupId,
          description: 'Dinner',
          centAmount: 9000,
          includedMemberIds: [],
        })
        .expectStatus(201)
        .expect((ctx) => {
          expect(ctx.res.body.splitType).toBe('EQUAL_ALL');
          const splits = ctx.res.body.splits as ExpenseSplit[];
          expect(splits).toHaveLength(3);
        });
    });

    it('should set EQUAL_ALL when all members explicitly included', async () => {
      await spec()
        .post('/expense')
        .withBearerToken(user1.accessToken)
        .withJson({
          groupId,
          description: 'Dinner',
          centAmount: 9000,
          includedMemberIds: [user1MemberId, user2MemberId, user3MemberId],
        })
        .expectStatus(201)
        .expect((ctx) => {
          expect(ctx.res.body.splitType).toBe('EQUAL_ALL');
          const splits = ctx.res.body.splits as ExpenseSplit[];
          expect(splits).toHaveLength(3);
        });
    });

    it('should handle remainder distribution by joinedAt order in partial splits', async () => {
      await spec()
        .post('/expense')
        .withBearerToken(user1.accessToken)
        .withJson({
          groupId,
          description: 'Lunch',
          centAmount: 10001, // Cannot split evenly among 2 members
          includedMemberIds: [user1MemberId, user3MemberId],
        })
        .expectStatus(201)
        .expect((ctx) => {
          const splits = ctx.res.body.splits as ExpenseSplit[];
          expect(splits).toHaveLength(2);
          // 10001 / 2 = 5000 with remainder 1
          // user1 joined first, so gets the extra cent
          const amounts = splits.map((s) => s.centAmount).sort((a, b) => b - a);
          expect(amounts).toEqual([5001, 5000]);
        });
    });
  });
});
