import { INestApplication } from '@nestjs/common';
import { createTestApp, resetDatabase, spec } from './test-utils';

describe('AuthController (e2e)', () => {
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

  describe('POST /auth/login', () => {
    it('should return access token for valid credentials', async () => {
      await spec().post('/user').withJson({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
      });

      await spec()
        .post('/auth/login')
        .withJson({
          email: 'john@example.com',
          password: 'password123',
        })
        .expectStatus(201)
        .expect((ctx) => {
          expect(ctx.res.body.access_token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
        });
    });

    it('should return 401 for invalid password', async () => {
      await spec().post('/user').withJson({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
      });

      await spec()
        .post('/auth/login')
        .withJson({
          email: 'john@example.com',
          password: 'wrongpassword',
        })
        .expectStatus(401);
    });

    it('should return 401 for non-existent user', async () => {
      await spec()
        .post('/auth/login')
        .withJson({
          email: 'nonexistent@example.com',
          password: 'password123',
        })
        .expectStatus(401);
    });
  });

  describe('GET /user/profile', () => {
    it('should return user profile with valid token', async () => {
      await spec().post('/user').withJson({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
      });

      const accessToken = await spec()
        .post('/auth/login')
        .withJson({
          email: 'john@example.com',
          password: 'password123',
        })
        .returns('access_token');

      await spec()
        .get('/user/profile')
        .withBearerToken(accessToken)
        .expectStatus(200)
        .expect((ctx) => {
          expect(ctx.res.body.id).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
          );
          expect(ctx.res.body.email).toBe('john@example.com');
        });
    });

    it('should return 401 without token', async () => {
      await spec().get('/user/profile').expectStatus(401);
    });

    it('should return 401 with invalid token', async () => {
      await spec()
        .get('/user/profile')
        .withBearerToken('invalid-token')
        .expectStatus(401);
    });
  });
});
