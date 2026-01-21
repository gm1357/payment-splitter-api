import { INestApplication } from '@nestjs/common';
import { createTestApp, resetDatabase, spec, TestUser } from './test-utils';
import { PrismaService } from 'src/prisma/prisma.service';

describe('SettlementController (e2e)', () => {
  let app: INestApplication;
  let user1: TestUser;
  let user2: TestUser;
  let groupId: string;
  let user1MemberId: string;
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

    user1MemberId = (members as { id: string; user: { id: string } }[]).find(
      (m) => m.user.id === user1.id,
    )!.id;
    user2MemberId = (members as { id: string; user: { id: string } }[]).find(
      (m) => m.user.id === user2.id,
    )!.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /settlement', () => {
    it('should create a settlement between two members', async () => {
      await spec()
        .post('/settlement')
        .withBearerToken(user1.accessToken)
        .withJson({
          groupId,
          fromMemberId: user1MemberId,
          toMemberId: user2MemberId,
          centAmount: 5000,
          notes: 'Payment for dinner',
        })
        .expectStatus(201)
        .expect((ctx) => {
          expect(ctx.res.body.id).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
          );
          expect(ctx.res.body.groupId).toBe(groupId);
          expect(ctx.res.body.fromMemberId).toBe(user1MemberId);
          expect(ctx.res.body.toMemberId).toBe(user2MemberId);
          expect(ctx.res.body.centAmount).toBe(5000);
          expect(ctx.res.body.notes).toBe('Payment for dinner');
          expect(ctx.res.body.fromMember).toBeDefined();
          expect(ctx.res.body.toMember).toBeDefined();
        });
    });

    it('should create a settlement without notes', async () => {
      await spec()
        .post('/settlement')
        .withBearerToken(user1.accessToken)
        .withJson({
          groupId,
          fromMemberId: user1MemberId,
          toMemberId: user2MemberId,
          centAmount: 3000,
        })
        .expectStatus(201)
        .expect((ctx) => {
          expect(ctx.res.body.id).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
          );
          expect(ctx.res.body.notes).toBeNull();
        });
    });

    it('should return 401 without authentication', async () => {
      await spec()
        .post('/settlement')
        .withJson({
          groupId,
          fromMemberId: user1MemberId,
          toMemberId: user2MemberId,
          centAmount: 5000,
        })
        .expectStatus(401);
    });

    it('should return 400 for missing required fields', async () => {
      await spec()
        .post('/settlement')
        .withBearerToken(user1.accessToken)
        .withJson({})
        .expectStatus(400);
    });

    it('should return 400 if requester is not a member of the group', async () => {
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
        .post('/settlement')
        .withBearerToken(login3Response.access_token)
        .withJson({
          groupId,
          fromMemberId: user1MemberId,
          toMemberId: user2MemberId,
          centAmount: 5000,
        })
        .expectStatus(400);
    });

    it('should return 400 for non-existent group', async () => {
      await spec()
        .post('/settlement')
        .withBearerToken(user1.accessToken)
        .withJson({
          groupId: '00000000-0000-0000-0000-000000000000',
          fromMemberId: user1MemberId,
          toMemberId: user2MemberId,
          centAmount: 5000,
        })
        .expectStatus(400);
    });

    it('should return 400 for invalid fromMemberId', async () => {
      await spec()
        .post('/settlement')
        .withBearerToken(user1.accessToken)
        .withJson({
          groupId,
          fromMemberId: '00000000-0000-0000-0000-000000000000',
          toMemberId: user2MemberId,
          centAmount: 5000,
        })
        .expectStatus(400);
    });

    it('should return 400 for invalid toMemberId', async () => {
      await spec()
        .post('/settlement')
        .withBearerToken(user1.accessToken)
        .withJson({
          groupId,
          fromMemberId: user1MemberId,
          toMemberId: '00000000-0000-0000-0000-000000000000',
          centAmount: 5000,
        })
        .expectStatus(400);
    });

    it('should return 400 for self-settlement', async () => {
      await spec()
        .post('/settlement')
        .withBearerToken(user1.accessToken)
        .withJson({
          groupId,
          fromMemberId: user1MemberId,
          toMemberId: user1MemberId,
          centAmount: 5000,
        })
        .expectStatus(400);
    });

    it('should return 400 for negative amount', async () => {
      await spec()
        .post('/settlement')
        .withBearerToken(user1.accessToken)
        .withJson({
          groupId,
          fromMemberId: user1MemberId,
          toMemberId: user2MemberId,
          centAmount: -100,
        })
        .expectStatus(400);
    });

    it('should return 400 for zero amount', async () => {
      await spec()
        .post('/settlement')
        .withBearerToken(user1.accessToken)
        .withJson({
          groupId,
          fromMemberId: user1MemberId,
          toMemberId: user2MemberId,
          centAmount: 0,
        })
        .expectStatus(400);
    });

    it('should return 400 for non-integer amount', async () => {
      await spec()
        .post('/settlement')
        .withBearerToken(user1.accessToken)
        .withJson({
          groupId,
          fromMemberId: user1MemberId,
          toMemberId: user2MemberId,
          centAmount: 50.5,
        })
        .expectStatus(400);
    });
  });

  describe('GET /settlement/group/:groupId', () => {
    it('should return all settlements for a group with member details', async () => {
      // Create two settlements
      await spec()
        .post('/settlement')
        .withBearerToken(user1.accessToken)
        .withJson({
          groupId,
          fromMemberId: user1MemberId,
          toMemberId: user2MemberId,
          centAmount: 5000,
        });

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
        .get('/settlement/group/{groupId}')
        .withPathParams('groupId', groupId)
        .withBearerToken(user1.accessToken)
        .expectStatus(200)
        .expectJsonLength(2)
        .expect((ctx) => {
          const settlements = ctx.res.body as {
            fromMember: object;
            toMember: object;
          }[];
          // Verify member details are included
          settlements.forEach((s) => {
            expect(s.fromMember).toBeDefined();
            expect(s.toMember).toBeDefined();
          });
        });
    });

    it('should return settlements ordered by settledAt descending', async () => {
      // Create settlements with a delay to ensure different timestamps
      await spec()
        .post('/settlement')
        .withBearerToken(user1.accessToken)
        .withJson({
          groupId,
          fromMemberId: user1MemberId,
          toMemberId: user2MemberId,
          centAmount: 1000,
        });

      // Wait a bit before creating the second settlement
      await new Promise((resolve) => setTimeout(resolve, 50));

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
        .get('/settlement/group/{groupId}')
        .withPathParams('groupId', groupId)
        .withBearerToken(user1.accessToken)
        .expectStatus(200)
        .expect((ctx) => {
          const settlements = ctx.res.body as { settledAt: string }[];
          expect(settlements).toHaveLength(2);
          // Most recent should be first
          const dates = settlements.map((s) => new Date(s.settledAt).getTime());
          expect(dates[0]).toBeGreaterThanOrEqual(dates[1]);
        });
    });

    it('should return empty array for no settlements', async () => {
      await spec()
        .get('/settlement/group/{groupId}')
        .withPathParams('groupId', groupId)
        .withBearerToken(user1.accessToken)
        .expectStatus(200)
        .expectJsonLength(0);
    });

    it('should return 401 without authentication', async () => {
      await spec()
        .get('/settlement/group/{groupId}')
        .withPathParams('groupId', groupId)
        .expectStatus(401);
    });

    it('should return empty array for non-member', async () => {
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

      // Create a settlement first
      await spec()
        .post('/settlement')
        .withBearerToken(user1.accessToken)
        .withJson({
          groupId,
          fromMemberId: user1MemberId,
          toMemberId: user2MemberId,
          centAmount: 5000,
        });

      // Non-member trying to view settlements
      await spec()
        .get('/settlement/group/{groupId}')
        .withPathParams('groupId', groupId)
        .withBearerToken(login3Response.access_token)
        .expectStatus(200)
        .expectJsonLength(0);
    });

    it('should return empty array for soft-deleted group', async () => {
      // Create a settlement first
      await spec()
        .post('/settlement')
        .withBearerToken(user1.accessToken)
        .withJson({
          groupId,
          fromMemberId: user1MemberId,
          toMemberId: user2MemberId,
          centAmount: 5000,
        });

      // Soft-delete the group directly via Prisma
      const prisma = app.get(PrismaService);
      await prisma.group.update({
        where: { id: groupId },
        data: { deletedAt: new Date() },
      });

      // User trying to view settlements for soft-deleted group
      await spec()
        .get('/settlement/group/{groupId}')
        .withPathParams('groupId', groupId)
        .withBearerToken(user1.accessToken)
        .expectStatus(200)
        .expectJsonLength(0);
    });
  });
});
