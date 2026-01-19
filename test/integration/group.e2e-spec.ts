import { INestApplication } from '@nestjs/common';
import { createTestApp, resetDatabase, spec, TestUser } from './test-utils';

describe('GroupController (e2e)', () => {
  let app: INestApplication;
  let user1: TestUser;
  let user2: TestUser;

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
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /group', () => {
    it('should create a group and add creator as member', async () => {
      await spec()
        .post('/group')
        .withBearerToken(user1.accessToken)
        .withJson({
          name: 'Trip to Paris',
        })
        .expectStatus(201)
        .expect((ctx) => {
          expect(ctx.res.body.id).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
          );
          expect(ctx.res.body.name).toBe('Trip to Paris');
          expect(ctx.res.body.createdBy).toBe(user1.id);
        });
    });

    it('should return 401 without authentication', async () => {
      await spec()
        .post('/group')
        .withJson({
          name: 'Trip to Paris',
        })
        .expectStatus(401);
    });

    it('should return 400 for missing name', async () => {
      await spec()
        .post('/group')
        .withBearerToken(user1.accessToken)
        .withJson({})
        .expectStatus(400);
    });
  });

  describe('GET /group/joined', () => {
    it('should return groups the user has joined', async () => {
      await spec()
        .post('/group')
        .withBearerToken(user1.accessToken)
        .withJson({ name: 'Group 1' });

      await spec()
        .post('/group')
        .withBearerToken(user1.accessToken)
        .withJson({ name: 'Group 2' });

      await spec()
        .get('/group/joined')
        .withBearerToken(user1.accessToken)
        .expectStatus(200)
        .expectJsonLength(2);
    });

    it('should return empty array if user has no groups', async () => {
      await spec()
        .get('/group/joined')
        .withBearerToken(user1.accessToken)
        .expectStatus(200)
        .expectJsonLength(0);
    });
  });

  describe('POST /group/:id/join', () => {
    it('should allow a user to join an existing group', async () => {
      const groupId = await spec()
        .post('/group')
        .withBearerToken(user1.accessToken)
        .withJson({ name: 'Shared Expenses' })
        .returns('id');

      await spec()
        .post('/group/{id}/join')
        .withPathParams('id', groupId)
        .withBearerToken(user2.accessToken)
        .expectStatus(201)
        .expect((ctx) => {
          expect(ctx.res.body.groupId).toBe(groupId);
          expect(ctx.res.body.userId).toBe(user2.id);
        });
    });

    it('should return 400 if already a member', async () => {
      const groupId = await spec()
        .post('/group')
        .withBearerToken(user1.accessToken)
        .withJson({ name: 'Shared Expenses' })
        .returns('id');

      await spec()
        .post('/group/{id}/join')
        .withPathParams('id', groupId)
        .withBearerToken(user1.accessToken)
        .expectStatus(400);
    });

    it('should return 400 for non-existent group', async () => {
      await spec()
        .post('/group/00000000-0000-0000-0000-000000000000/join')
        .withBearerToken(user1.accessToken)
        .expectStatus(400);
    });
  });

  describe('POST /group/:id/leave', () => {
    it('should allow a user to leave a group', async () => {
      const groupId = await spec()
        .post('/group')
        .withBearerToken(user1.accessToken)
        .withJson({ name: 'Shared Expenses' })
        .returns('id');

      await spec()
        .post('/group/{id}/join')
        .withPathParams('id', groupId)
        .withBearerToken(user2.accessToken);

      await spec()
        .post('/group/{id}/leave')
        .withPathParams('id', groupId)
        .withBearerToken(user2.accessToken)
        .expectStatus(200);

      await spec()
        .get('/group/joined')
        .withBearerToken(user2.accessToken)
        .expectStatus(200)
        .expectJsonLength(0);
    });

    it('should return 400 for non-existent group', async () => {
      await spec()
        .post('/group/00000000-0000-0000-0000-000000000000/leave')
        .withBearerToken(user1.accessToken)
        .expectStatus(400);
    });
  });

  describe('GET /group/:id/members', () => {
    it('should return all members of a group', async () => {
      const groupId = await spec()
        .post('/group')
        .withBearerToken(user1.accessToken)
        .withJson({ name: 'Shared Expenses' })
        .returns('id');

      await spec()
        .post('/group/{id}/join')
        .withPathParams('id', groupId)
        .withBearerToken(user2.accessToken);

      await spec()
        .get('/group/{id}/members')
        .withPathParams('id', groupId)
        .withBearerToken(user1.accessToken)
        .expectStatus(200)
        .expectJsonLength(2);
    });

    it('should return empty if user is not a member of the group', async () => {
      const groupId = await spec()
        .post('/group')
        .withBearerToken(user1.accessToken)
        .withJson({ name: 'Private Group' })
        .returns('id');

      await spec()
        .get('/group/{id}/members')
        .withPathParams('id', groupId)
        .withBearerToken(user2.accessToken)
        .expectStatus(200)
        .expectJsonLength(0);
    });
  });
});
