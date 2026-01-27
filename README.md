# Payment Splitter API

A NestJS-based REST API for splitting expenses among group members. Users can create groups, add members, record expenses, and track balances.

## Tech Stack

- **Framework**: NestJS
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Authentication**: JWT + Passport
- **Testing**: Jest + Pactum

## Prerequisites

- Node.js 20+
- Yarn
- Docker (for PostgreSQL)

## Getting Started

### 1. Install dependencies

```bash
yarn install
```

### 2. Start the database

```bash
docker-compose up -d
```

This starts:
- PostgreSQL on port 5432
- Adminer (DB UI) on port 8080
- MailCatcher (email testing) - SMTP on port 1025, Web UI on port 1080

### 3. Configure environment

```bash
cp .env.example .env
```

Required variables:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret key for JWT signing

Email configuration (defaults work with MailCatcher for local dev):
- `EMAIL_SMTP_HOST` - SMTP server host
- `EMAIL_SMTP_PORT` - SMTP server port
- `EMAIL_SMTP_USER` - SMTP username (optional for MailCatcher)
- `EMAIL_SMTP_PASSWORD` - SMTP password (optional for MailCatcher)
- `EMAIL_HTTP_HOST` - MailCatcher HTTP API host (for tests)
- `EMAIL_HTTP_PORT` - MailCatcher HTTP API port (for tests)

### 4. Run database migrations

```bash
npx prisma migrate dev
```

### 5. Start the server

```bash
yarn run start:dev
```

The API will be available at `http://localhost:3000`.

## Scripts

| Command | Description |
|---------|-------------|
| `yarn run start:dev` | Start with hot reload |
| `yarn run start:prod` | Start in production mode |
| `yarn run build` | Compile TypeScript to `/dist` |
| `yarn run test` | Run unit tests |
| `yarn run test:e2e` | Run integration tests |
| `yarn run test:cov` | Run tests with coverage |
| `yarn run lint` | Run ESLint with auto-fix |
| `yarn run format` | Format code with Prettier |

## Database Commands

| Command | Description |
|---------|-------------|
| `npx prisma migrate dev` | Create and apply migrations |
| `npx prisma generate` | Regenerate Prisma client |
| `npx prisma studio` | Open visual database browser |

## API Endpoints

### Authentication
- `POST /auth/login` - Login with email/password, returns JWT

### Users
- `POST /user` - Create a new user
- `GET /user` - List all users
- `GET /user/:id` - Get user by ID
- `GET /user/profile` - Get current user profile (authenticated)
- `PATCH /user/:id` - Update user
- `DELETE /user/:id` - Soft delete user

### Groups
- `POST /group` - Create a group (authenticated)
- `GET /group/joined` - List groups user has joined (authenticated)
- `POST /group/:id/join` - Join a group (authenticated)
- `POST /group/:id/leave` - Leave a group (authenticated)
- `GET /group/:id/members` - List group members (authenticated)

### Expenses
- `POST /expense` - Create an expense with automatic splitting (authenticated)
- `GET /expense/group/:groupId` - List expenses for a group (authenticated)

### Balances
- `GET /balance/group/:groupId` - View member balances (authenticated)
- `GET /balance/group/:groupId/suggest` - Get settlement suggestions (authenticated)

### Settlements
- `POST /settlement` - Record a settlement between members (authenticated)
- `GET /settlement/group/:groupId` - List settlements for a group (authenticated)

## Email Notifications

The API sends email notifications for:
- **Expense creation**: Payer receives confirmation, split members receive their share details
- **Settlement creation**: Payer receives payment confirmation, receiver receives payment notice

For local development, MailCatcher captures all emails. View them at `http://localhost:1080`.

## Project Structure

```
src/
├── auth/           # Authentication (JWT, Passport strategies)
├── user/           # User management
├── group/          # Group and membership management
├── expense/        # Expense tracking and splitting
├── settlement/     # Debt settlement between members
├── balance/        # Balance calculation and settlement suggestions
├── infra/          # Infrastructure (email service)
├── prisma/         # Database service
└── main.ts         # Application entry point

test/
└── integration/    # End-to-end tests
```
