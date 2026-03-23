# First Login Authorization Plan

## Goal

Implement secure "first login" onboarding so admins no longer set or know employee passwords:

- admin creates user with login/profile/role (without password),
- employee opens "Первая авторизация" on login page,
- sets personal password (with confirmation),
- account becomes fully active for regular login.

Additionally:

- admin UI must clearly show whether account is activated,
- first-login window must match existing login page visual style.

## Current State (verified)

- User model stores `passwordHash` and `isActive`.
- Regular login endpoint: `src/app/api/auth/login/route.ts`.
- Login UI: `src/app/login/page.tsx` + `src/app/login/login.css`.
- Admin create/edit users:
  - page: `src/app/admin/users/page.tsx`
  - create API: `src/app/api/admin/users/route.ts`
  - edit API: `src/app/api/admin/users/[id]/route.ts`
- `isActive` already exists and is editable in user edit modal.
- Create modal currently requires password.

## Required Product Behavior

1. Admin creates account **without password**.
2. Account is marked as "not activated" until first password setup is completed.
3. "Первая авторизация" flow:
   - step 1: enter login,
   - step 2: set password + repeat password,
   - on success: account becomes activated for normal login.
4. Admin panel:
   - explicit activation status in table (activated / not activated / blocked),
   - ability to set active flag on create (or default to active with "not activated" state).
5. Login page:
   - first-login form in same design language as main login card.

## Data Model Changes

Prefer explicit onboarding flag.

### Prisma `User` additions

- `mustSetPassword Boolean @default(false)`
- `passwordSetAt DateTime?`

Rationale:

- `isActive` controls access policy (block/unblock),
- `mustSetPassword` controls onboarding state,
- `passwordSetAt` provides auditability.

### Backward Compatibility

For existing users:

- set `mustSetPassword = false`,
- set `passwordSetAt = NOW()` via migration for users with existing `passwordHash`.

## API Changes

## 1) Admin Create User (`POST /api/admin/users`)

Current behavior requires password. New behavior:

- remove required `password` from schema,
- create user with:
  - temporary safe hash placeholder (or generated random one not disclosed),
  - `mustSetPassword = true`,
  - `passwordSetAt = null`.

Optional field:

- `isActive` on create (default `true`).

Response should include activation flags:

- `isActive`,
- `mustSetPassword`,
- derived `isActivated = !mustSetPassword`.

## 2) New First Login Endpoint (`POST /api/auth/first-login`)

Request body:

- `login: string`
- `password: string`
- `passwordConfirm: string`

Server rules:

- fail with generic message for non-existing login,
- fail if user blocked (`isActive=false`),
- fail if `mustSetPassword=false` (already activated),
- enforce password policy,
- hash password,
- atomically update:
  - `passwordHash`,
  - `mustSetPassword=false`,
  - `passwordSetAt=NOW()`.

Response:

- `{ ok: true }`

Do not create session automatically in v1 (safer UX parity). User logs in normally after success.

## 3) Login Endpoint (`POST /api/auth/login`)

Add guard:

- if `mustSetPassword=true`, return 403 with dedicated code (e.g. `FIRST_LOGIN_REQUIRED`) and generic safe message to switch flow.

## 4) Admin List/Edit APIs

Expose and allow update for:

- `isActive`,
- `mustSetPassword` (optional admin reset action: "Сбросить первую авторизацию").

## UI Changes

## 1) Login Page (`src/app/login/page.tsx`)

Add secondary action:

- button/link: "Первая авторизация".

Open first-login form with same shell/style (`wow-form`, same cards, same inputs/icons):

- login,
- password,
- repeat password,
- submit.

Keep it in same visual component family to satisfy design consistency.

## 2) Admin Users Page (`src/app/admin/users/page.tsx`)

Create modal:

- remove password field,
- keep login/displayName/role/telegram,
- add `Активирован` status hint (initially "Нет, ожидает первую авторизацию"),
- optional create toggle `Активен`.

Table status column:

- `Заблокирован` if `isActive=false`,
- `Не активирован` if `isActive=true && mustSetPassword=true`,
- `Активирован` if `isActive=true && mustSetPassword=false`.

Edit modal:

- preserve `isActive`,
- optional admin action:
  - "Сбросить первую авторизацию" => set `mustSetPassword=true`, `passwordSetAt=null`.

## Security Requirements

- Rate limit on first-login endpoint (IP + login).
- Password policy (min length >= 8 recommended).
- Uniform auth errors where possible.
- Transactional update for first-login to avoid races.
- Audit log entry on first password setup and reset-first-login action.

## Rollout Plan (safe)

1. **Migration first**
   - add new columns,
   - backfill existing users.
2. **Backend guards**
   - update login route + add first-login route.
3. **Admin API update**
   - create without password, add activation flags.
4. **Admin UI update**
   - create modal and status labels.
5. **Login UI update**
   - first-login view with same design.
6. **QA**
   - new user first-login,
   - blocked user behavior,
   - existing users unaffected,
   - reset-first-login path.

## Test Checklist

- New user cannot login via regular form before first authorization.
- New user can set password once.
- Repeat first-login attempt after activation is rejected.
- Existing users still login as before.
- `isActive=false` blocks both regular and first-login.
- Admin sees correct status labels for all 3 states.
- Password fields handle validation and mismatch correctly.

## Risk Assessment

- Complexity: medium.
- Main risks:
  - accidental lockout due to wrong migration defaults,
  - missing guard in regular login,
  - inconsistent status display in admin table.

Mitigation:

- explicit migration defaults + backfill SQL,
- integration tests for all auth states,
- staged rollout with rollback script.

