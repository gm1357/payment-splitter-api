import { INestApplication } from '@nestjs/common';
import {
  clearS3Bucket,
  createTestApp,
  deleteAllEmails,
  getEmails,
  getEmailTextById,
  getS3ObjectContent,
  listS3Objects,
  resetDatabase,
  spec,
  TestUser,
} from './test-utils';

describe('Expense Upload (e2e)', () => {
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
    await clearS3Bucket();

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

    // Create a group with user1 as creator
    groupId = await spec()
      .post('/group')
      .withBearerToken(user1.accessToken)
      .withJson({ name: 'Trip Expenses' })
      .returns('id');

    // User2 and User3 join the group
    await spec()
      .post('/group/{id}/join')
      .withPathParams('id', groupId)
      .withBearerToken(user2.accessToken);

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

  describe('POST /expense/upload/:groupId', () => {
    it('should create multiple expenses from valid CSV', async () => {
      const csv = `description,centAmount,paidByMemberId,includedMemberIds
Dinner at restaurant,15000,,
Taxi ride,3000,,`;

      await spec()
        .post('/expense/upload/{groupId}')
        .withPathParams('groupId', groupId)
        .withBearerToken(user1.accessToken)
        .withMultiPartFormData('file', Buffer.from(csv), {
          filename: 'expenses.csv',
        })
        .expectStatus(201)
        .expect((ctx) => {
          expect(ctx.res.body.created).toBe(2);
          expect(ctx.res.body.expenses).toHaveLength(2);
          expect(ctx.res.body.expenses[0].description).toBe(
            'Dinner at restaurant',
          );
          expect(ctx.res.body.expenses[0].centAmount).toBe(15000);
          expect(ctx.res.body.expenses[1].description).toBe('Taxi ride');
          expect(ctx.res.body.expenses[1].centAmount).toBe(3000);
        });

      // Verify expenses were created
      const expenses = await spec()
        .get('/expense/group/{groupId}')
        .withPathParams('groupId', groupId)
        .withBearerToken(user1.accessToken)
        .returns('res.body');

      expect(expenses).toHaveLength(2);
    });

    it('should create expense with specified paidByMemberId', async () => {
      const csv = `description,centAmount,paidByMemberId,includedMemberIds
Team Lunch,9000,${user2MemberId},`;

      await spec()
        .post('/expense/upload/{groupId}')
        .withPathParams('groupId', groupId)
        .withBearerToken(user1.accessToken)
        .withMultiPartFormData('file', Buffer.from(csv), {
          filename: 'expenses.csv',
        })
        .expectStatus(201)
        .expect((ctx) => {
          expect(ctx.res.body.created).toBe(1);
        });

      // Verify the payer was set correctly
      const expenses = await spec()
        .get('/expense/group/{groupId}')
        .withPathParams('groupId', groupId)
        .withBearerToken(user1.accessToken)
        .returns('res.body');

      expect(expenses[0].paidBy).toBe(user2MemberId);
    });

    it('should create partial split with specified includedMemberIds', async () => {
      const csv = `description,centAmount,paidByMemberId,includedMemberIds
Gift for user3,6000,,${user1MemberId}|${user2MemberId}`;

      await spec()
        .post('/expense/upload/{groupId}')
        .withPathParams('groupId', groupId)
        .withBearerToken(user1.accessToken)
        .withMultiPartFormData('file', Buffer.from(csv), {
          filename: 'expenses.csv',
        })
        .expectStatus(201);

      const expensesResponse: {
        splitType: string;
        splits: { groupMemberId: string; centAmount: number }[];
      }[] = await spec()
        .get('/expense/group/{groupId}')
        .withPathParams('groupId', groupId)
        .withBearerToken(user1.accessToken)
        .returns('res.body');

      expect(expensesResponse[0].splitType).toBe('PARTIAL');
      expect(expensesResponse[0].splits).toHaveLength(2);
      expect(
        expensesResponse[0].splits.every((s) => s.centAmount === 3000),
      ).toBe(true);
      expect(expensesResponse[0].splits.map((s) => s.groupMemberId)).toContain(
        user1MemberId,
      );
      expect(expensesResponse[0].splits.map((s) => s.groupMemberId)).toContain(
        user2MemberId,
      );
      expect(
        expensesResponse[0].splits.map((s) => s.groupMemberId),
      ).not.toContain(user3MemberId);
    });

    it('should send batch notification emails', async () => {
      const csv = `description,centAmount,paidByMemberId,includedMemberIds
Dinner,9000,,
Taxi,3000,,`;

      await spec()
        .post('/expense/upload/{groupId}')
        .withPathParams('groupId', groupId)
        .withBearerToken(user1.accessToken)
        .withMultiPartFormData('file', Buffer.from(csv), {
          filename: 'expenses.csv',
        })
        .expectStatus(201);

      const emailsSent = await getEmails();
      // Expect 3 batch emails: one per user
      expect(emailsSent.length).toBe(3);

      // Check subjects contain expense count and group name
      const subjects = emailsSent.map((e) => e.subject);
      expect(subjects.every((s) => s.includes('2 new expenses'))).toBe(true);
      expect(subjects.every((s) => s.includes('Trip Expenses'))).toBe(true);

      // Check email content
      const user1Email = emailsSent.find((e) =>
        e.recipients.includes(`<${user1.email}>`),
      );
      const user1EmailText = await getEmailTextById(user1Email!.id);
      expect(user1EmailText).toContain('Hi User One');
      expect(user1EmailText).toContain('2 expenses were added');
      expect(user1EmailText).toContain('Dinner');
      expect(user1EmailText).toContain('Taxi');
      expect(user1EmailText).toContain('Your total share');
    });

    it('should return 400 for missing required headers', async () => {
      const csv = `description,amount
Dinner,15000`;

      await spec()
        .post('/expense/upload/{groupId}')
        .withPathParams('groupId', groupId)
        .withBearerToken(user1.accessToken)
        .withMultiPartFormData('file', Buffer.from(csv), {
          filename: 'expenses.csv',
        })
        .expectStatus(400)
        .expect((ctx) => {
          expect(ctx.res.body.message).toBe('CSV validation failed');
          expect(ctx.res.body.errors).toBeDefined();
          expect(ctx.res.body.errors[0].field).toBe('headers');
        });
    });

    it('should return 400 for empty CSV', async () => {
      const csv = '';

      await spec()
        .post('/expense/upload/{groupId}')
        .withPathParams('groupId', groupId)
        .withBearerToken(user1.accessToken)
        .withMultiPartFormData('file', Buffer.from(csv), {
          filename: 'expenses.csv',
        })
        .expectStatus(400);
    });

    it('should return 400 for invalid centAmount', async () => {
      const csv = `description,centAmount,paidByMemberId,includedMemberIds
Dinner,-100,,`;

      await spec()
        .post('/expense/upload/{groupId}')
        .withPathParams('groupId', groupId)
        .withBearerToken(user1.accessToken)
        .withMultiPartFormData('file', Buffer.from(csv), {
          filename: 'expenses.csv',
        })
        .expectStatus(400)
        .expect((ctx) => {
          expect(ctx.res.body.errors[0].field).toBe('centAmount');
          expect(ctx.res.body.errors[0].message).toBe(
            'Must be a positive integer',
          );
        });
    });

    it('should return 400 for invalid paidByMemberId (non-member)', async () => {
      const csv = `description,centAmount,paidByMemberId,includedMemberIds
Dinner,15000,00000000-0000-0000-0000-000000000000,`;

      await spec()
        .post('/expense/upload/{groupId}')
        .withPathParams('groupId', groupId)
        .withBearerToken(user1.accessToken)
        .withMultiPartFormData('file', Buffer.from(csv), {
          filename: 'expenses.csv',
        })
        .expectStatus(400)
        .expect((ctx) => {
          expect(ctx.res.body.errors[0].field).toBe('paidByMemberId');
          expect(ctx.res.body.errors[0].message).toBe(
            'Not a member of this group',
          );
        });
    });

    it('should return 400 for invalid includedMemberIds (non-member)', async () => {
      const csv = `description,centAmount,paidByMemberId,includedMemberIds
Dinner,15000,,00000000-0000-0000-0000-000000000000|${user1MemberId}`;

      await spec()
        .post('/expense/upload/{groupId}')
        .withPathParams('groupId', groupId)
        .withBearerToken(user1.accessToken)
        .withMultiPartFormData('file', Buffer.from(csv), {
          filename: 'expenses.csv',
        })
        .expectStatus(400)
        .expect((ctx) => {
          expect(ctx.res.body.errors[0].field).toBe('includedMemberIds');
          expect(ctx.res.body.errors[0].message).toContain(
            'Not a member of this group',
          );
        });
    });

    it('should return row-level errors for multiple invalid rows', async () => {
      const csv = `description,centAmount,paidByMemberId,includedMemberIds
,15000,,
Dinner,-100,,
Valid expense,3000,,`;

      await spec()
        .post('/expense/upload/{groupId}')
        .withPathParams('groupId', groupId)
        .withBearerToken(user1.accessToken)
        .withMultiPartFormData('file', Buffer.from(csv), {
          filename: 'expenses.csv',
        })
        .expectStatus(400)
        .expect((ctx) => {
          const errors = ctx.res.body.errors as { row: number }[];
          expect(errors.length).toBeGreaterThan(0);
          // Row 2 has missing description
          expect(errors.some((e) => e.row === 2)).toBe(true);
          // Row 3 has negative amount
          expect(errors.some((e) => e.row === 3)).toBe(true);
        });

      // No expenses should be created (all-or-nothing)
      const expenses = await spec()
        .get('/expense/group/{groupId}')
        .withPathParams('groupId', groupId)
        .withBearerToken(user1.accessToken)
        .returns('res.body');

      expect(expenses).toHaveLength(0);
    });

    it('should return 400 for missing file', async () => {
      await spec()
        .post('/expense/upload/{groupId}')
        .withPathParams('groupId', groupId)
        .withBearerToken(user1.accessToken)
        .expectStatus(400);
    });

    it('should return 401 without authentication', async () => {
      const csv = `description,centAmount,paidByMemberId,includedMemberIds
Dinner,15000,,`;

      await spec()
        .post('/expense/upload/{groupId}')
        .withPathParams('groupId', groupId)
        .withMultiPartFormData('file', Buffer.from(csv), {
          filename: 'expenses.csv',
        })
        .expectStatus(401);
    });

    it('should return 400 for non-existent group', async () => {
      const csv = `description,centAmount,paidByMemberId,includedMemberIds
Dinner,15000,,`;

      await spec()
        .post('/expense/upload/{groupId}')
        .withPathParams('groupId', '00000000-0000-0000-0000-000000000000')
        .withBearerToken(user1.accessToken)
        .withMultiPartFormData('file', Buffer.from(csv), {
          filename: 'expenses.csv',
        })
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

      const csv = `description,centAmount,paidByMemberId,includedMemberIds
Dinner,15000,,`;

      await spec()
        .post('/expense/upload/{groupId}')
        .withPathParams('groupId', groupId)
        .withBearerToken(login4Response.access_token)
        .withMultiPartFormData('file', Buffer.from(csv), {
          filename: 'expenses.csv',
        })
        .expectStatus(400);
    });

    it('should return 400 for invalid groupId format', async () => {
      const csv = `description,centAmount,paidByMemberId,includedMemberIds
Dinner,15000,,`;

      await spec()
        .post('/expense/upload/{groupId}')
        .withPathParams('groupId', 'not-a-uuid')
        .withBearerToken(user1.accessToken)
        .withMultiPartFormData('file', Buffer.from(csv), {
          filename: 'expenses.csv',
        })
        .expectStatus(400);
    });

    it('should handle CSV with quoted fields containing commas', async () => {
      const csv = `description,centAmount,paidByMemberId,includedMemberIds
"Dinner at fancy restaurant, with wine",15000,,`;

      await spec()
        .post('/expense/upload/{groupId}')
        .withPathParams('groupId', groupId)
        .withBearerToken(user1.accessToken)
        .withMultiPartFormData('file', Buffer.from(csv), {
          filename: 'expenses.csv',
        })
        .expectStatus(201)
        .expect((ctx) => {
          expect(ctx.res.body.expenses[0].description).toBe(
            'Dinner at fancy restaurant, with wine',
          );
        });
    });

    it('should distribute remainder correctly for uneven splits', async () => {
      const csv = `description,centAmount,paidByMemberId,includedMemberIds
Dinner,10001,,`;

      await spec()
        .post('/expense/upload/{groupId}')
        .withPathParams('groupId', groupId)
        .withBearerToken(user1.accessToken)
        .withMultiPartFormData('file', Buffer.from(csv), {
          filename: 'expenses.csv',
        })
        .expectStatus(201);

      const expensesResponse: {
        splits: { centAmount: number }[];
      }[] = await spec()
        .get('/expense/group/{groupId}')
        .withPathParams('groupId', groupId)
        .withBearerToken(user1.accessToken)
        .returns('res.body');

      // 10001 / 3 = 3333 with remainder 2
      // First 2 members get 3334, third gets 3333
      const amounts = expensesResponse[0].splits
        .map((s) => s.centAmount)
        .sort((a, b) => b - a);
      expect(amounts).toEqual([3334, 3334, 3333]);
    });

    it('should upload CSV to S3 after successful batch creation', async () => {
      const csv = `description,centAmount,paidByMemberId,includedMemberIds
Dinner,9000,,`;

      await spec()
        .post('/expense/upload/{groupId}')
        .withPathParams('groupId', groupId)
        .withBearerToken(user1.accessToken)
        .withMultiPartFormData('file', Buffer.from(csv), {
          filename: 'expenses.csv',
        })
        .expectStatus(201);

      // Poll for fire-and-forget upload to complete
      let objects = await listS3Objects(`expenses/${groupId}/`);
      const deadline = Date.now() + 5000;
      while (objects.length === 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        objects = await listS3Objects(`expenses/${groupId}/`);
      }
      expect(objects).toHaveLength(1);
      expect(objects[0].Key).toContain(`expenses/${groupId}/`);
      expect(objects[0].Key).toContain('expenses.csv');

      const content = await getS3ObjectContent(objects[0].Key!);
      expect(content).toBe(csv);
    });

    it('should not upload to S3 when CSV validation fails', async () => {
      const csv = `description,centAmount,paidByMemberId,includedMemberIds
,-100,,`;

      await spec()
        .post('/expense/upload/{groupId}')
        .withPathParams('groupId', groupId)
        .withBearerToken(user1.accessToken)
        .withMultiPartFormData('file', Buffer.from(csv), {
          filename: 'expenses.csv',
        })
        .expectStatus(400);

      // Proving a negative requires a fixed wait; 1s is a reasonable trade-off
      // between CI reliability and test speed.
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const objects = await listS3Objects(`expenses/${groupId}/`);
      expect(objects).toHaveLength(0);
    });
  });
});
