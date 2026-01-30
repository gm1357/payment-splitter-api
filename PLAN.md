# Payment Splitter API - Implementation Plan

## Requirements Overview

Based on the take-home assignment for a peer-to-peer payment splitter backend system.

---

## 1. Group Management

| Feature                 | Status       | Notes                       |
| ----------------------- | ------------ | --------------------------- |
| Create expense groups   | ✅ Completed | `POST /group`               |
| Group has name          | ✅ Completed | `name` field in Group model |
| Group members have name | ✅ Completed | Via User model relationship |
| Join group              | ✅ Completed | `POST /group/:id/join`      |
| Leave group             | ✅ Completed | `POST /group/:id/leave`     |
| List group members      | ✅ Completed | `GET /group/:id/members`    |
| List user's groups      | ✅ Completed | `GET /group/joined`         |

---

## 2. Add Expenses

| Feature                           | Status       | Notes                                            |
| --------------------------------- | ------------ | ------------------------------------------------ |
| Record expenses to a group        | ✅ Completed | `POST /expense`                                  |
| List expenses for a group         | ✅ Completed | `GET /expense/group/:groupId` (member-only)      |
| Expense has description           | ✅ Completed | `description` field                              |
| Expense has dollar amount         | ✅ Completed | `centAmount` field (stored as cents)             |
| Expense has payer                 | ✅ Completed | `paidBy` field, optional `paidByMemberId` in DTO |
| Deterministic remainder handling  | ✅ Completed | First members (by join date) receive extra cents |
| Equal split among all members     | ✅ Completed | Default behavior with `splitType: EQUAL_ALL`     |
| Partial split (subset of members) | ✅ Completed | `includedMemberIds` field in CreateExpenseDto    |

### Partial Split Details:

- `includedMemberIds`: Optional UUID array to specify which members to include in the split
- When omitted or empty, defaults to all members (`EQUAL_ALL`)
- When a subset is specified, uses `splitType: PARTIAL`
- Payer can be outside the split (e.g., buying a gift)
- Remainder distribution follows same `joinedAt` order logic

---

## 3. View Balances

| Feature                           | Status       | Notes                                 |
| --------------------------------- | ------------ | ------------------------------------- |
| View each member's net balance    | ✅ Completed | `GET /balance/group/:groupId`         |
| Positive balance = owed to member | ✅ Completed |                                       |
| Negative balance = member owes    | ✅ Completed |                                       |
| Suggest optimal settlements       | ✅ Completed | `GET /balance/group/:groupId/suggest` |

### Implementation details:

- `GET /balance/group/:groupId` - Returns balances for all members
- `GET /balance/group/:groupId/suggest` - Returns minimal settlement suggestions
- Formula: netBalance = (totalPaid + settlementsPaid) - (totalOwed + settlementsReceived)
- Validates: group exists, requester is member

---

## 4. Settle Debts

| Feature                            | Status       | Notes                                         |
| ---------------------------------- | ------------ | --------------------------------------------- |
| Record settlements between members | ✅ Completed | `POST /settlement`                            |
| List settlements for a group       | ✅ Completed | `GET /settlement/group/:groupId`              |
| Update balances after settlement   | ✅ Completed | Settlements factored into balance calculation |

### Implementation details:

- `POST /settlement` - Creates a settlement with `groupId`, `fromMemberId`, `toMemberId`, `centAmount`, optional `notes`
- `GET /settlement/group/:groupId` - Lists settlements ordered by `settledAt` desc, includes member details
- Validates: group exists, requester is member, fromMember and toMember belong to group, no self-settlement

---

## 5. File Upload Feature (CSV)

| Feature                            | Status       | Notes                                                  |
| ---------------------------------- | ------------ | ------------------------------------------------------ |
| Upload CSV with batch expenses     | ✅ Completed | `POST /expense/upload/:groupId` (multipart/form-data)  |
| Cloud storage integration (AWS S3) | ✅ Completed | S3 for file storage, LocalStack for local dev          |
| Async processing (AWS SQS)        | ✅ Completed | SQS consumer polls and processes uploads asynchronously |
| CSV parsing and validation         | ✅ Completed | `CsvParserService` with row-level error reporting      |
| Batch expense creation             | ✅ Completed | Transactional batch creation via `createBatch()`       |
| Batch email notifications          | ✅ Completed | Single summary email per affected user                 |

### Implementation details:

- **Upload Flow**: Two-stage async architecture
  1. `POST /expense/upload/:groupId` - Validates CSV structure, uploads to S3, sends SQS message, returns 202
  2. SQS consumer polls messages, downloads CSV from S3, creates expenses in a transaction
- **CSV Format**: Headers: `description`, `centAmount`, `paidByMemberId` (optional), `includedMemberIds` (optional, pipe-separated UUIDs)
- **Validation**: Max 500 rows, positive integer amounts, UUID format checks, group membership validation
- **S3 Key Format**: `expenses/{groupId}/{timestamp}-{filename}`
- **Infrastructure**: LocalStack for local S3/SQS mocking via docker-compose
- **Batch Notifications**: Groups expenses by user, sends one summary email per affected member

---

## 6. Email Notification

| Feature                    | Status       | Notes                                          |
| -------------------------- | ------------ | ---------------------------------------------- |
| Notify on expense recorded | ✅ Completed | Emails sent to payer and all split members     |
| Notify on debt settled     | ✅ Completed | Emails sent to both payer and receiver         |

### Implementation details:

- **Email Service**: Nodemailer with SMTP transport (`src/infra/email.ts`)
- **Expense Notifications**: Payer receives confirmation, split members receive their share details
- **Settlement Notifications**: Payer receives payment confirmation, receiver receives payment notice
- **Development**: MailCatcher for local email testing (SMTP: 1025, Web UI: 1080)
- **Testing**: E2E tests verify email content via MailCatcher HTTP API

---

## Summary

| Category           | Progress         |
| ------------------ | ---------------- |
| Group Management   | ✅ 100% Complete |
| Add Expenses       | ✅ 100% Complete |
| View Balances      | ✅ 100% Complete |
| Settle Debts       | ✅ 100% Complete |
| File Upload        | ✅ 100% Complete |
| Email Notification | ✅ 100% Complete |

---

## Remaining Work

All features are complete.

---

## Architecture Notes

- **Database**: PostgreSQL with Prisma ORM ✅
- **Authentication**: JWT + Passport (implemented, though not required by assignment)
- **Validation**: class-validator with global ValidationPipe ✅
- **Cloud Services**: AWS S3 (file storage) + SQS (async job queue), LocalStack for local dev
- **Testing:**
  - Unit tests: Co-located with source (`src/**/*.spec.ts`), Jest with mocked dependencies
  - Integration tests: `test/integration/*.e2e-spec.ts`, uses pactum for HTTP assertions
  - Test utilities: `createTestApp()`, `resetDatabase()`, `spec()`, S3/SQS helpers in `test-utils.ts`
- **CI/CD:**
  - GitHub Actions workflows in `.github/workflows/`
  - `unit-tests.yml` - Runs on push/PR, no database required
  - `e2e-tests.yml` - Runs on push/PR, uses PostgreSQL and LocalStack service containers
