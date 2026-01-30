import { INestApplication } from '@nestjs/common';
import {
  clearS3Bucket,
  createTestApp,
  deleteAllEmails,
  getEmails,
  getEmailTextById,
  getS3ObjectContent,
  listS3Objects,
  purgeQueue,
  resetDatabase,
  spec,
  TestUser,
  waitForExpenses,
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
    await purgeQueue();

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
    it('should accept upload and create expenses asynchronously', async () => {
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
        .expectStatus(202)
        .expect((ctx) => {
          expect(ctx.res.body.message).toBe('Upload accepted for processing');
          expect(ctx.res.body.s3Key).toBeDefined();
        });

      // Wait for async processing
      const expenses = await waitForExpenses(
        app,
        groupId,
        2,
        user1.accessToken,
      );

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
        .expectStatus(202);

      // Wait for async processing
      const expenses = (await waitForExpenses(
        app,
        groupId,
        1,
        user1.accessToken,
      )) as { paidBy: string }[];

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
        .expectStatus(202);

      const expenses = (await waitForExpenses(
        app,
        groupId,
        1,
        user1.accessToken,
      )) as {
        splitType: string;
        splits: { groupMemberId: string; centAmount: number }[];
      }[];

      expect(expenses[0].splitType).toBe('PARTIAL');
      expect(expenses[0].splits).toHaveLength(2);
      expect(expenses[0].splits.every((s) => s.centAmount === 3000)).toBe(true);
      expect(expenses[0].splits.map((s) => s.groupMemberId)).toContain(
        user1MemberId,
      );
      expect(expenses[0].splits.map((s) => s.groupMemberId)).toContain(
        user2MemberId,
      );
      expect(expenses[0].splits.map((s) => s.groupMemberId)).not.toContain(
        user3MemberId,
      );
    });

    it('should send batch notification emails after async processing', async () => {
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
        .expectStatus(202);

      // Wait for async processing to complete
      await waitForExpenses(app, groupId, 2, user1.accessToken);

      // Wait a bit more for emails to be sent
      await new Promise((resolve) => setTimeout(resolve, 500));

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
        .expectStatus(202)
        .expect((ctx) => {
          expect(ctx.res.body.message).toBe('Upload accepted for processing');
          expect(ctx.res.body.s3Key).toBeDefined();
        });

      const expenses = (await waitForExpenses(
        app,
        groupId,
        1,
        user1.accessToken,
      )) as { description: string }[];

      expect(expenses[0].description).toBe(
        'Dinner at fancy restaurant, with wine',
      );
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
        .expectStatus(202);

      const expenses = (await waitForExpenses(
        app,
        groupId,
        1,
        user1.accessToken,
      )) as {
        splits: { centAmount: number }[];
      }[];

      // 10001 / 3 = 3333 with remainder 2
      // First 2 members get 3334, third gets 3333
      const amounts = expenses[0].splits
        .map((s) => s.centAmount)
        .sort((a, b) => b - a);
      expect(amounts).toEqual([3334, 3334, 3333]);
    });

    it('should upload CSV to S3 on accepted upload', async () => {
      const csv = `description,centAmount,paidByMemberId,includedMemberIds
Dinner,9000,,`;

      const response = await spec()
        .post('/expense/upload/{groupId}')
        .withPathParams('groupId', groupId)
        .withBearerToken(user1.accessToken)
        .withMultiPartFormData('file', Buffer.from(csv), {
          filename: 'expenses.csv',
        })
        .expectStatus(202)
        .returns('res.body');

      // S3 upload is now synchronous (awaited), so object should exist immediately
      const objects = await listS3Objects(`expenses/${groupId}/`);
      expect(objects).toHaveLength(1);
      expect(objects[0].Key).toBe(response.s3Key);

      const content = await getS3ObjectContent(objects[0].Key!);
      expect(content).toBe(csv);
    });

    it('should not upload to S3 when CSV structure validation fails', async () => {
      const csv = `description,amount
Dinner,15000`;

      await spec()
        .post('/expense/upload/{groupId}')
        .withPathParams('groupId', groupId)
        .withBearerToken(user1.accessToken)
        .withMultiPartFormData('file', Buffer.from(csv), {
          filename: 'expenses.csv',
        })
        .expectStatus(400);

      const objects = await listS3Objects(`expenses/${groupId}/`);
      expect(objects).toHaveLength(0);
    });
  });
});
