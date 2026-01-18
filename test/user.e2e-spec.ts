import { INestApplication } from '@nestjs/common';
import { createTestApp, resetDatabase, spec } from './test-utils';

describe('UserController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /user', () => {
    it('should create a user', async () => {
      await spec()
        .post('/user')
        .withJson({
          name: 'John Doe',
          email: 'john@example.com',
          password: 'password123',
        })
        .expectStatus(201)
        .expect((ctx) => {
          expect(ctx.res.body.id).toMatch(/^[0-9a-f-]{36}$/);
          expect(ctx.res.body.name).toBe('John Doe');
          expect(ctx.res.body.email).toBe('john@example.com');
          expect(ctx.res.body.password).toBeUndefined();
        });
    });

    it('should return 400 for invalid email', async () => {
      await spec()
        .post('/user')
        .withJson({
          name: 'John Doe',
          email: 'invalid-email',
          password: 'password123',
        })
        .expectStatus(400);
    });

    it('should return 400 for missing required fields', async () => {
      await spec()
        .post('/user')
        .withJson({
          name: 'John Doe',
        })
        .expectStatus(400);
    });

    it('should return 400 for duplicate email', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
      };

      await spec().post('/user').withJson(userData).expectStatus(201);

      await spec().post('/user').withJson(userData).expectStatus(400);
    });
  });

  describe('GET /user', () => {
    it('should return all users', async () => {
      await spec()
        .post('/user')
        .withJson({
          name: 'User 1',
          email: 'user1@example.com',
          password: 'password123',
        });

      await spec()
        .post('/user')
        .withJson({
          name: 'User 2',
          email: 'user2@example.com',
          password: 'password123',
        });

      await spec()
        .get('/user')
        .expectStatus(200)
        .expectJsonLength(2)
        .expect((ctx) => {
          expect(ctx.res.body[0].name).toBe('User 1');
          expect(ctx.res.body[0].email).toBe('user1@example.com');
        });
    });
  });

  describe('GET /user/:id', () => {
    it('should return a user by id', async () => {
      const createResponse = await spec()
        .post('/user')
        .withJson({
          name: 'John Doe',
          email: 'john@example.com',
          password: 'password123',
        })
        .returns('id');

      await spec()
        .get('/user/{id}')
        .withPathParams('id', createResponse)
        .expectStatus(200)
        .expectJsonMatch({
          id: createResponse,
          name: 'John Doe',
          email: 'john@example.com',
        });
    });

    it('should return 404 for non-existent user', async () => {
      await spec()
        .get('/user/00000000-0000-0000-0000-000000000000')
        .expectStatus(404);
    });
  });

  describe('PATCH /user/:id', () => {
    it('should update a user', async () => {
      const userId = await spec()
        .post('/user')
        .withJson({
          name: 'John Doe',
          email: 'john@example.com',
          password: 'password123',
        })
        .returns('id');

      await spec()
        .patch('/user/{id}')
        .withPathParams('id', userId)
        .withJson({
          name: 'John Updated',
        })
        .expectStatus(200)
        .expect((ctx) => {
          expect(ctx.res.body.name).toBe('John Updated');
          expect(ctx.res.body.email).toBe('john@example.com');
        });
    });
  });

  describe('DELETE /user/:id', () => {
    it('should soft delete a user', async () => {
      const userId = await spec()
        .post('/user')
        .withJson({
          name: 'John Doe',
          email: 'john@example.com',
          password: 'password123',
        })
        .returns('id');

      await spec()
        .delete('/user/{id}')
        .withPathParams('id', userId)
        .expectStatus(200);

      await spec()
        .get('/user/{id}')
        .withPathParams('id', userId)
        .expectStatus(404);
    });
  });
});
