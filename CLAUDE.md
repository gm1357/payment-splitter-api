# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Payment Splitter API - A NestJS-based REST API for expense splitting between group members. Uses Prisma ORM with PostgreSQL.

## Common Commands

```bash
# Development
yarn run start:dev        # Start with hot reload
yarn run build            # Compile TypeScript to /dist

# Testing
yarn run test             # Run unit tests
yarn run test:watch       # Unit tests with watch mode
yarn run test:e2e         # Run end-to-end tests

# Code Quality
yarn run lint             # ESLint with auto-fix
yarn run format           # Prettier formatting

# Database
docker-compose up         # Start PostgreSQL and Adminer (DB UI at localhost:8080)
npx prisma migrate dev    # Create and apply migrations during development
npx prisma generate       # Regenerate Prisma client after schema changes
npx prisma studio         # Visual database browser
```

## Architecture

### Module Structure
The app follows NestJS modular architecture. Each feature module contains:
- `*.module.ts` - Module definition with imports/exports
- `*.controller.ts` - Route handlers
- `*.service.ts` - Business logic and Prisma queries
- `dto/` - Request validation with class-validator decorators
- `entity/` - Type definitions

### Key Modules
- **auth/** - JWT + Passport authentication (LocalStrategy for login, JwtStrategy for protected routes)
- **user/** - User CRUD with soft delete
- **group/** - Group management with membership (create, join, leave, list members)
- **expense/** - Expense creation with automatic equal splitting
- **prisma/** - Database access layer wrapping PrismaClient

### Authentication Flow
1. `POST /auth/login` with email/password returns JWT
2. Protected routes use `@UseGuards(JwtAuthGuard)`
3. Access user in controller via `request.user as JWTUser`

### Data Models
Core entities in `prisma/schema.prisma`: User, Group, GroupMember, Expense, ExpenseSplit, Settlement. All models support soft delete via `deletedAt` field.

### Key Patterns
- **Soft Delete**: Query with `where: { deletedAt: null }`, delete sets `deletedAt = new Date()`
- **DTO Validation**: Global `ValidationPipe` in main.ts validates all incoming requests
- **Circular Dependencies**: Use `forwardRef()` when modules reference each other (auth ↔ user)

## Environment Variables

Required in `.env` (see `.env.example`):
```
DATABASE_URL=postgresql://postgres:password@0.0.0.0:5432/payment-splitter-db?schema=public
JWT_SECRET=<your_secret>
```

## Testing Patterns

### Test Structure
- **Unit tests**: Co-located with source files (`src/**/*.spec.ts`)
- **Integration tests**: Separate folder (`test/integration/*.e2e-spec.ts`)

### Unit Tests
Located alongside source files (e.g., `src/group/group.service.spec.ts`). Mock dependencies using Jest:

```typescript
const mockPrismaService = {
  group: {
    create: jest.fn(),
    findUnique: jest.fn(),
  },
};

const module = await Test.createTestingModule({
  providers: [
    GroupService,
    { provide: PrismaService, useValue: mockPrismaService },
  ],
}).compile();
```

### Integration Tests
Located in `test/integration/`. Uses pactum for HTTP assertions and shared utilities in `test-utils.ts`:

- `createTestApp()` - Bootstraps NestJS app on random port
- `resetDatabase(app)` - Clears all tables between tests
- `spec()` - Pactum request builder with base URL configured

```typescript
beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  await resetDatabase(app);
});

it('should create a user', async () => {
  await spec()
    .post('/user')
    .withJson({ name: 'John', email: 'john@example.com', password: 'pass' })
    .expectStatus(201);
});
```

Integration tests require a running PostgreSQL database.
