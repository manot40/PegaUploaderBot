# Uniport Auth Specification

## Purpose

Handles startup network and license validation, authenticates users against the Uniport service using RFC 9449 DPoP ES256 proofs, and maintains a valid Mitra JWT session across batches.

## Requirements

### Requirement: Startup network and license verification

The system SHALL verify network connectivity to the configured base URL (`BOT_URL`, defaulting to `https://hcq.payrollq.id`) and, when build-time `LICENSE_URL` and `LICENSE_TOKEN` constants are defined, validate the license with `LICENSE_USER` against `/api/collections/users/auth-with-password` before allowing authentication.

#### Scenario: Reachable network and active license

- **WHEN** the CLI starts and `BOT_URL` is reachable and the license server returns `record.active === true`
- **THEN** the system displays the licensed name and version and proceeds to credential input

#### Scenario: Expired or inactive license

- **WHEN** the CLI starts and the license server returns `record.active !== true`
- **THEN** the system displays an expiration error message in Bahasa Indonesia and exits with a non-zero code

#### Scenario: Unreachable target server

- **WHEN** connection to `BOT_URL` times out after 5 seconds
- **THEN** the system warns the user in Bahasa Indonesia and retries until reachable or exits on non-OK fatal response

### Requirement: Uniport session creation and password login

The system SHALL create a Uniport session via `POST /api/uniport/create-session`, check its status via `GET /api/uniport/check-session`, and authenticate credentials via `POST /api/uniport/login-password`.

#### Scenario: Successful password authentication

- **WHEN** valid `login` and `password` are submitted to `POST /api/uniport/login-password` with the active `sessionId`
- **THEN** the server responds with `{ status: "verified" }` and the system proceeds to consume the session

#### Scenario: Invalid credentials rejected

- **WHEN** `POST /api/uniport/login-password` returns an authentication error or status other than `"verified"`
- **THEN** the system displays an error message in Bahasa Indonesia and prompts the user to re-enter credentials without terminating the process

### Requirement: RFC 9449 DPoP token exchange

The system SHALL generate an ephemeral EC P-256 keypair per authentication flow and attach a valid signed `dpop` (`typ: "dpop+jwt"`, `alg: "ES256"`) header to `POST /api/uniport/consume-session` and `POST /api/uniport/handoff-token`, including the `ath` (base64url SHA-256 digest of the handoff token) claim on `/handoff-token`.

#### Scenario: Handoff token exchange produces Mitra JWT

- **WHEN** `/api/uniport/consume-session` returns a single-use `identityToken` and the system sends it as `Authorization: Bearer <token>` with a matching `dpop` proof (containing `ath`) to `/api/uniport/handoff-token` for `{ tenantId: "MITRA", monolithKey: "hcqxpayrollq", as: "token" }`
- **THEN** the system receives and stores the Mitra JWT `identityToken` for subsequent API calls

### Requirement: Automatic token refresh on mid-session expiration

The system SHALL transparently re-authenticate using the stored credentials in memory if a Mitra API request returns HTTP `401 Unauthorized`.

#### Scenario: Token expires between activity batches

- **WHEN** a Mitra API call returns HTTP `401 Unauthorized` during an active CLI session
- **THEN** the system executes a fresh Uniport + DPoP authentication flow in the background and retries the failed Mitra API request with the new `identityToken`

### Requirement: PocketBase session caching and restoration

When a valid license is active, the system SHALL query and persist authenticated session data (`email`, `token`, `cookies`, and `expires_at` decoded from the JWT `exp` claim) in the `mitrabot_sessions` PocketBase collection on `LICENSE_URL` using the license bearer token, updating (`PATCH`) an existing record for the email or creating (`POST`) a new record.

#### Scenario: Saving a newly authenticated session for a new email

- **WHEN** a user authenticates with email and password while the license is active and no record exists for that email in `mitrabot_sessions`
- **THEN** the system decodes `exp` from the Mitra JWT `identityToken` and creates (`POST`) a record in `/api/collections/mitrabot_sessions/records` with `email`, `token`, `cookies`, and `expires_at`

#### Scenario: Updating an existing session record for a returning email

- **WHEN** a user authenticates with email and password while the license is active and a record already exists for that email in `mitrabot_sessions`
- **THEN** the system updates (`PATCH`) the existing record in `/api/collections/mitrabot_sessions/records/<id>` with the new `token`, `cookies`, and `expires_at`

#### Scenario: Restoring a valid cached session

- **WHEN** a cached session record for the email is retrieved from `mitrabot_sessions` and its `expires_at` timestamp is in the future (with at least 60 seconds remaining)
- **THEN** the system restores `identityToken` and `cookies` into the API client without executing the Uniport session or DPoP login requests

#### Scenario: Skipping session cache when license is not active

- **WHEN** `LICENSE_URL` or `LICENSE_TOKEN` is unconfigured or inactive
- **THEN** the system skips all `mitrabot_sessions` queries and writes
