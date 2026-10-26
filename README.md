# HookRelay V1
## Webhook Delivery, Retry & Observability Platform

HookRelay is a lightweight developer infrastructure platform for reliable, asynchronous webhook delivery. It provides at-least-once HTTP delivery, automatic exponential backoff retries with jitter, HMAC-SHA256 request signing, server-side request forgery (SSRF) protection, full delivery attempt history, and manual replay capabilities from an interactive developer dashboard.

---

## Table of Contents

- [System Architecture](#system-architecture)
- [Core Features](#core-features)
- [Tech Stack](#tech-stack)
- [Repository Structure](#repository-structure)
- [Quick Start](#quick-start)
- [Running in Development](#running-in-development)
- [Running Automated Tests](#running-automated-tests)
- [REST API Reference](#rest-api-reference)
- [Delivery Semantics & Backoff Formula](#delivery-semantics--backoff-formula)
- [Security & SSRF Mitigation](#security--ssrf-mitigation)
- [Webhook Signing & Verification](#webhook-signing--verification)
- [Production Deployment Strategy](#production-deployment-strategy)
- [Known Limitations & Roadmap](#known-limitations--roadmap)

---

## System Architecture

HookRelay separates event ingestion from HTTP delivery through an asynchronous queue backed by SQLite:

```
[ Your Application ]
         │
         ▼  (HTTP POST /api/endpoints/:id/events)
┌──────────────────────────────────────────────┐
│             HookRelay API (Express)          │
│   • Validates endpoint state & body size    │
│   • Persists event in SQLite (status=QUEUED) │
│   • Returns HTTP 202 Accepted immediately    │
└──────────────────────┬───────────────────────┘
                       │
                       ▼  (SQLite WAL Mode)
┌──────────────────────────────────────────────┐
│            Persistent Database               │
│   • Endpoints, Events, DeliveryAttempts      │
│   • Worker heartbeats & atomic leases        │
└──────────────────────▲───────────────────────┘
                       │
                       ▼  (Atomic Conditional Claim)
┌──────────────────────────────────────────────┐
│        Delivery Worker Process (Node.js)     │
│   • Atomically claims due events             │
│   • Re-validates destination URL & SSRF      │
│   • Signs payload with HMAC-SHA256           │
│   • Sends HTTP POST with AbortController     │
│   • Records attempt, latency & response body │
│   • Schedules exponential backoff if retryable│
└──────────────────────┬───────────────────────┘
                       │
                       ▼  (HTTP POST)
┌──────────────────────────────────────────────┐
│         Destination Webhook Receiver         │
│   • Header: X-HookRelay-Signature            │
│   • Header: X-HookRelay-Event-Id             │
│   • Header: X-HookRelay-Delivery-Attempt     │
└──────────────────────────────────────────────┘
```

---

## Core Features

1. **Decoupled Asynchronous Delivery**: Event ingestion returns `HTTP 202 Accepted` immediately upon database persistence; delivery never blocks your API.
2. **Atomic Job Claiming**: Database-backed conditional state updates prevent concurrent workers from claiming the same job.
3. **Stale Lease Recovery**: Automatically recovers jobs stuck in `DELIVERING` state if a worker crashes mid-flight.
4. **Transparent Retries with Backoff**: Exponential backoff (`2s, 4s, 8s, 16s...`) with random jitter and `Retry-After` header support.
5. **Detailed Attempt History**: Every delivery attempt is permanently recorded with response code, latency, error messages, and truncated response snippets.
6. **Manual Replay**: Instantly replay failed or delivered events without deleting prior delivery history.
7. **HMAC-SHA256 Signing**: Every outbound webhook is cryptographically signed using an endpoint-specific secret. Secrets are never exposed after creation.
8. **SSRF Protection**: Validates protocols (`http:`, `https:`), resolves DNS, and rejects loopback, RFC 1918 private ranges, link-local, and cloud metadata (`169.254.169.254`).
9. **Dark-First Developer Dashboard**: Built with React, Tailwind CSS, Lucide icons, and TanStack Query, offering real-time status badges, live event inspection, and health monitoring.

---

## Tech Stack

### Backend
- **Runtime**: Node.js v20+ LTS (tested on Node v24)
- **Framework**: Express.js
- **ORM**: Prisma ORM with SQLite (WAL mode + busy timeout)
- **Validation**: Zod
- **Security**: `ipaddr.js` for IP/CIDR validation, native Node `crypto` for HMAC-SHA256
- **Testing**: Vitest and Supertest

### Frontend
- **Framework**: React 18 with Vite
- **Styling**: Tailwind CSS
- **Data Fetching**: TanStack Query (React Query)
- **Routing**: React Router v6
- **Icons**: Lucide React

---

## Repository Structure

```
HookRelay/
├── package.json              # Monorepo workspaces & orchestrator scripts
├── README.md                 # Complete documentation & guide
├── .gitignore                # Source control exclusions
├── server/
│   ├── package.json          # Backend dependencies & test scripts
│   ├── vitest.config.js      # Vitest test configuration
│   ├── .env.example          # Environment variable template
│   ├── prisma/
│   │   └── schema.prisma     # Prisma data models & SQLite datasource
│   ├── src/
│   │   ├── app.js            # Express app, CORS, routes & static client serving
│   │   ├── server.js         # API server entrypoint & graceful shutdown
│   │   ├── worker.js         # Delivery worker process & heartbeat loop
│   │   ├── config/           # Environment configuration parser
│   │   ├── db/               # Prisma singleton with SQLite WAL initialization
│   │   ├── lib/              # ID generation, HMAC signing, structured logger
│   │   ├── middleware/       # Centralized error handler & Zod validation
│   │   ├── routes/           # Health, Endpoints, Events, Metrics
│   │   └── services/         # SSRF, Signing, Endpoint, Event, Queue, Delivery
│   └── tests/                # 8 comprehensive Vitest suites (47 tests)
└── client/
    ├── package.json          # Frontend dependencies & build scripts
    ├── vite.config.js        # Vite build & API proxy setup
    ├── tailwind.config.js    # Tailwind dark theme configuration
    ├── index.html            # Single page app entrypoint
    └── src/
        ├── main.jsx          # React DOM render
        ├── App.jsx           # QueryClientProvider & BrowserRouter
        ├── api/client.js     # Typed fetch client
        ├── components/       # Layout, StatusBadge, CodeBlock, Modal, Toast
        └── pages/            # Overview, Endpoints, Events, EventDetail, Docs
```

---

## Quick Start

### 1. Prerequisites
- Node.js v20+ LTS
- npm v10+

### 2. Install Dependencies
```bash
npm run install:all
```

### 3. Initialize Database
Initialize the SQLite database schema:
```bash
npm run setup:db
```

### 4. Build Frontend Bundle
```bash
npm run build
```

---

## Running in Development

You can run the entire system (API, Delivery Worker, and Vite Dev Server) concurrently with one command:

```bash
npm run dev
```

Or run each service independently in separate terminal tabs:

```bash
# Terminal 1: Express API Server (port 4000)
npm run dev:api

# Terminal 2: Delivery Worker Process
npm run dev:worker

# Terminal 3: React Dashboard with Vite (port 5173)
npm run dev:client
```

Open your browser to:
- **Frontend Dashboard**: `http://localhost:5173` (or `http://localhost:4000` when built)
- **API Health Check**: `http://localhost:4000/api/health`

---

## Running Automated Tests

HookRelay includes an extensive automated test suite covering all API routes, signing, SSRF validation, atomic job claiming, delivery semantics, and end-to-end acceptance scenarios using an isolated temporary SQLite database (`test.db`). The development database (`dev.db`) is never modified during tests.

Run all tests:
```bash
npm run test
```

Expected output:
```
✓ tests/e2e-acceptance.test.js (5 tests)
✓ tests/worker.test.js (5 tests)
✓ tests/events.test.js (8 tests)
✓ tests/endpoints.test.js (7 tests)
✓ tests/stale-jobs.test.js (2 tests)
✓ tests/signing.test.js (7 tests)
✓ tests/ssrf.test.js (10 tests)
✓ tests/health.test.js (3 tests)

Test Files  8 passed (8)
     Tests  47 passed (47)
```

---

## REST API Reference

### Health Check

#### `GET /api/health`
Returns the status of the API, database connectivity, and worker process heartbeat.

**Response (HTTP 200)**:
```json
{
  "status": "ok",
  "api": "healthy",
  "database": "healthy",
  "worker": {
    "status": "healthy",
    "lastHeartbeat": "2026-10-26T15:30:00.000Z"
  },
  "uptime": 120,
  "timestamp": "2026-10-26T15:30:05.000Z"
}
```

---

### Endpoints

#### `POST /api/endpoints`
Registers a new destination endpoint. Generates a secure HMAC-SHA256 signing secret.

**Request Body**:
```json
{
  "name": "Stripe Webhook Receiver",
  "destinationUrl": "https://api.example.com/webhooks",
  "maxRetries": 5
}
```

**Response (HTTP 201)**:
```json
{
  "id": "ep_98b3c10aef7a",
  "name": "Stripe Webhook Receiver",
  "destinationUrl": "https://api.example.com/webhooks",
  "signingSecret": "whsec_7d98b...32bytes",
  "maxRetries": 5,
  "enabled": true,
  "warning": "Save this signing secret now. It will never be displayed again."
}
```

#### `GET /api/endpoints`
Lists all endpoints. Note: `signingSecret` is intentionally excluded.

#### `GET /api/endpoints/:id`
Retrieves endpoint details. Note: `signingSecret` is intentionally excluded.

#### `PATCH /api/endpoints/:id`
Updates endpoint settings (`name`, `destinationUrl`, `maxRetries`, `enabled`).

#### `DELETE /api/endpoints/:id`
Safely removes or disables an endpoint. If historical events exist, disables the endpoint (`enabled: false`) to preserve delivery logs and foreign key integrity.

---

### Events

#### `POST /api/endpoints/:id/events`
Enqueues an event for asynchronous delivery.

**Headers**:
- `Content-Type: application/json`
- `Idempotency-Key`: *(Optional)* String to guarantee deduplication.

**Request Body**:
```json
{
  "event_type": "payment.completed",
  "data": {
    "payment_id": "pay_98213",
    "amount": 4900,
    "currency": "usd"
  }
}
```

**Response (HTTP 202 Accepted)**:
```json
{
  "event_id": "evt_4a12c8b09d",
  "status": "QUEUED"
}
```

#### `GET /api/events`
Lists events with filtering and pagination.
- Query parameters: `page`, `limit`, `status` (`QUEUED`, `DELIVERING`, `RETRYING`, `DELIVERED`, `FAILED`), `endpointId`, `eventType`.

#### `GET /api/events/:id`
Returns event metadata, the original JSON payload, and the chronological list of delivery attempts.

#### `POST /api/events/:id/replay`
Manually queues an eligible failed or delivered event for re-delivery.
- Preserves all historical attempts permanently.
- Allocates a fresh retry quota (`attempts + maxRetries`).
- Prevents concurrent replays if currently `DELIVERING`.

---

### Dashboard Metrics

#### `GET /api/overview`
Returns summary metrics: `totalEvents`, `deliveredEvents`, `failedEvents`, `pendingEvents`, `successRate`, and recent attempts stream.

---

## Delivery Semantics & Backoff Formula

HookRelay guarantees **at-least-once delivery** with transparent attempt observability.

### Outbound Envelope
Every webhook POST request sends the following JSON envelope:
```json
{
  "event_id": "evt_4a12c8b09d",
  "event_type": "payment.completed",
  "timestamp": "2026-10-26T15:30:00.000Z",
  "data": { ... }
}
```

### Outbound Headers
- `Content-Type: application/json`
- `User-Agent: HookRelay-Worker/1.0`
- `X-HookRelay-Event-Id: <eventId>`
- `X-HookRelay-Event-Type: <eventType>`
- `X-HookRelay-Delivery-Attempt: <attemptNumber>`
- `X-HookRelay-Signature: sha256=<hex_digest>`

### Status Handling
| Response | Classification | Behavior |
| :--- | :--- | :--- |
| `2xx` (e.g. 200, 201, 204) | Success | Status -> `DELIVERED` |
| `408`, `429`, `5xx` | Retryable Failure | Status -> `RETRYING`, schedule next attempt |
| Network Timeout / DNS Error | Retryable Failure | Status -> `RETRYING`, schedule next attempt |
| Other `4xx` (e.g. 400, 401, 404) | Permanent Failure | Status -> `FAILED` immediately |

### Exponential Backoff
$$\text{delay} = \min\left(\text{initialDelay} \times 2^{(\text{attempt} - 1)} + \text{jitter},\; \text{maxDelay}\right)$$
- **Attempt 1**: $\sim 2\text{s} + [0\text{--}500\text{ms}]$ jitter
- **Attempt 2**: $\sim 4\text{s} + [0\text{--}500\text{ms}]$ jitter
- **Attempt 3**: $\sim 8\text{s} + [0\text{--}500\text{ms}]$ jitter
- **Attempt 4**: $\sim 16\text{s} + [0\text{--}500\text{ms}]$ jitter
- Automatically parses and respects HTTP `Retry-After` headers if present.

---

## Security & SSRF Mitigation

Because HookRelay makes outbound HTTP calls to user-specified URLs, Server-Side Request Forgery (SSRF) protection is strictly enforced:

1. **Protocol Restrictions**: Only `http:` and `https:` are permitted.
2. **IP Range Blocking**:
   - Loopback: `127.0.0.0/8`, `::1`
   - RFC 1918 Private: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
   - Link-Local & Cloud Metadata: `169.254.0.0/16` (including `169.254.169.254`)
   - Carrier-Grade NAT: `100.64.0.0/10`
   - Broadcast & Multicast: `255.255.255.255`, `224.0.0.0/4`, `ff00::/8`
3. **DNS Resolution Verification**: Destination hostnames are resolved via DNS, and *all* resolved IP addresses are checked against the blocked ranges.
4. **Delivery-Time Revalidation**: Destination URLs are validated during endpoint creation and re-validated at delivery time to mitigate DNS rebinding.
5. **Redirect Protection**: Outbound requests configure `redirect: 'manual'` to prevent redirect-based SSRF bypasses.
6. **Local Testing Override**: In development/testing, set `ALLOW_LOCAL_DESTINATIONS=true` to target local mock servers. In production, this defaults to `false`.

---

## Webhook Signing & Verification

HookRelay signs outbound payloads using HMAC-SHA256 with the secret generated during endpoint registration.

### Signature Header Format
```
X-HookRelay-Signature: sha256=<hex_digest>
```

### Verification Example (Node.js)
```javascript
import crypto from 'node:crypto';

function verifyWebhook(rawBodyString, signatureHeader, signingSecret) {
  const hmac = crypto.createHmac('sha256', signingSecret);
  hmac.update(rawBodyString, 'utf8');
  const expectedSignature = `sha256=${hmac.digest('hex')}`;

  return crypto.timingSafeEqual(
    Buffer.from(signatureHeader || ''),
    Buffer.from(expectedSignature)
  );
}
```

### Verification Example (Python)
```python
import hmac
import hashlib

def verify_webhook(raw_body_bytes, signature_header, signing_secret):
    expected = "sha256=" + hmac.new(
        signing_secret.encode('utf-8'),
        raw_body_bytes,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature_header, expected)
```

---

## Production Deployment Guide

HookRelay is architected for clean cloud deployment with decoupled processes sharing a persistent database:

- **Frontend**: Deployed to [Vercel](https://vercel.com) (SPA static hosting)
- **API Server**: Deployed to [Render](https://render.com) (Web Service)
- **Delivery Worker**: Deployed to [Render](https://render.com) (Background Worker)
- **Database**: Managed PostgreSQL on [Render](https://render.com), [Neon](https://neon.tech), or [Supabase](https://supabase.com)

```
┌─────────────────────────┐
│     Vercel (Client)     │
│   React / Vite Dashboard│
└────────────┬────────────┘
             │ HTTPS (VITE_API_BASE_URL)
             ▼
┌─────────────────────────┐        ┌─────────────────────────┐
│    Render API (Web)     │        │  Render Worker Process  │
│  Express.js API Server  │        │   Node.js Polling Loop  │
└────────────┬────────────┘        └────────────┬────────────┘
             │                                  │
             │   PostgreSQL (DATABASE_URL)      │
             └────────────────┬─────────────────┘
                              ▼
                 ┌─────────────────────────┐
                 │   Managed PostgreSQL    │
                 │   (Render/Neon/Supabase)│
                 └─────────────────────────┘
```

### Environment Variables Reference

| Variable | Target Service | Default / Example | Purpose |
| :--- | :--- | :--- | :--- |
| `VITE_API_BASE_URL` | Frontend (Vercel) | `https://hookrelay-api.onrender.com` | Base URL of the backend API |
| `PORT` | API Server (Render) | `10000` | Port for Express HTTP listener |
| `NODE_ENV` | API & Worker | `production` | Node environment flag |
| `DATABASE_URL` | API & Worker | `postgresql://user:pass@host/db?sslmode=require` | Managed PostgreSQL connection string |
| `CORS_ORIGIN` | API Server | `https://your-hookrelay.vercel.app` (or `*`) | Permitted CORS frontend origins |
| `ALLOW_LOCAL_DESTINATIONS` | API & Worker | `false` | Must be `false` in production for SSRF safety |
| `WORKER_POLL_INTERVAL_MS` | Worker | `1000` | Polling interval in milliseconds |
| `WORKER_BATCH_SIZE` | Worker | `10` | Max jobs claimed per batch |
| `DELIVERY_TIMEOUT_MS` | Worker | `10000` | Outbound HTTP request timeout (10s) |

---

### Step-by-Step Deployment Instructions

#### 1. Deploy the Database (PostgreSQL)
1. In your cloud provider (Render, Neon, or Supabase), create a new PostgreSQL database.
2. Copy the external connection string (`DATABASE_URL`).

#### 2. Deploy the API & Delivery Worker to Render

##### Option A: Using the Render Blueprint (`render.yaml`)
1. Connect your HookRelay Git repository to Render.
2. Select **New** -> **Blueprint**.
3. Render will read `render.yaml` and automatically provision the `hookrelay-api` web service, the `hookrelay-worker` background process, and a managed PostgreSQL database.

##### Option B: Manual Setup on Render
1. **API Web Service**:
   - **Name**: `hookrelay-api`
   - **Root Directory**: `server`
   - **Build Command**: `npm install && npx prisma db push --schema=prisma/schema.postgresql.prisma`
   - **Start Command**: `npm run start`
   - **Health Check Path**: `/api/health`
   - **Environment Variables**:
     - `NODE_ENV`: `production`
     - `DATABASE_URL`: `your-postgres-connection-string`
     - `CORS_ORIGIN`: `*` (or your Vercel URL)
     - `ALLOW_LOCAL_DESTINATIONS`: `false`

2. **Delivery Worker Service**:
   - **Name**: `hookrelay-worker`
   - **Service Type**: **Background Worker**
   - **Root Directory**: `server`
   - **Build Command**: `npm install`
   - **Start Command**: `npm run worker`
   - **Environment Variables**:
     - `NODE_ENV`: `production`
     - `DATABASE_URL`: `your-postgres-connection-string`
     - `ALLOW_LOCAL_DESTINATIONS`: `false`

#### 3. Deploy the Frontend to Vercel
1. Import your Git repository in Vercel.
2. Set **Root Directory** to `client`.
3. Set **Framework Preset** to **Vite**.
4. In **Environment Variables**, add:
   - `VITE_API_BASE_URL`: `https://hookrelay-api.onrender.com` (your Render API URL)
5. Click **Deploy**. Vercel will build the frontend using `client/vercel.json` for seamless SPA client-side routing.

---

## Known Limitations & Roadmap

- **Database Engine**: V1 supports SQLite locally with WAL mode and PostgreSQL in cloud deployments.
- **Authentication**: V1 focuses on the developer environment without multi-tenant authentication. V2 roadmap includes API keys and team organizations.
- **Payload Size**: Default maximum payload size is capped at 1 MB.

