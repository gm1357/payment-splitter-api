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

| Feature                            | Status     | Notes |
| ---------------------------------- | ---------- | ----- |
| Upload CSV with batch expenses     | ❌ Missing |       |
| Cloud storage integration (AWS S3) | ❌ Missing |       |
| Process uploaded file              | ❌ Missing |       |

### Implementation needed:

- AWS S3 integration for file storage
- `POST /expense/upload` endpoint (multipart/form-data)
- CSV parsing and validation
- Batch expense creation
- Consider: SQS for async processing at scale

---

## 6. Email Notification

| Feature                    | Status     | Notes |
| -------------------------- | ---------- | ----- |
| Notify on expense recorded | ❌ Missing |       |
| Notify on debt settled     | ❌ Missing |       |

### Implementation needed:

- AWS SES or similar email service integration
- Notification service module
- Event-driven architecture (emit events on expense/settlement creation)
- Consider: SQS/SNS for decoupling and handling high loads

---

## Summary

| Category           | Progress         |
| ------------------ | ---------------- |
| Group Management   | ✅ 100% Complete |
| Add Expenses       | ✅ 100% Complete |
| View Balances      | ✅ 100% Complete |
| Settle Debts       | ✅ 100% Complete |
| File Upload        | ❌ 0%            |
| Email Notification | ❌ 0%            |

---

## Suggested Implementation Order

1. **Email Notification** - Can be added as event listeners
2. **File Upload** - Most complex, requires AWS integration

---

## Architecture Notes

- **Database**: PostgreSQL with Prisma ORM ✅
- **Authentication**: JWT + Passport (implemented, though not required by assignment)
- **Validation**: class-validator with global ValidationPipe ✅
- **Testing:**
  - Unit tests: Co-located with source (`src/**/*.spec.ts`), Jest with mocked dependencies (66 tests)
  - Integration tests: `test/integration/*.e2e-spec.ts`, uses pactum for HTTP assertions (80 tests)
  - Test utilities: `createTestApp()`, `resetDatabase()`, `spec()` in `test-utils.ts`
- **CI/CD:**
  - GitHub Actions workflows in `.github/workflows/`
  - `unit-tests.yml` - Runs on push/PR, no database required
  - `e2e-tests.yml` - Runs on push/PR, uses PostgreSQL service container
