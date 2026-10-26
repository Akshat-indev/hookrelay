# HookRelay Deployment Guide (Zero Credit Card Required)

This guide walks you through deploying **HookRelay** completely free of charge, with **zero credit card requirements** and no payment verification friction.

---

## Architecture Overview

```
┌─────────────────────────────────┐       ┌──────────────────────────────────────────┐
│  Cloudflare Pages (Frontend)    │ HTTP  │  Render or Koyeb Web Service (Backend)   │
│  - React 19 + Vite SPA          ├──────►│  - Express REST API (port 10000/8000)   │
│  - Instant global CDN edge      │       │  - Delivery Worker Loop (in background)  │
│  - Free bandwidth & SSL         │       │  - Unified Process: npm run start:all    │
└─────────────────────────────────┘       └────────────────────┬─────────────────────┘
                                                               │
                                                               ▼
                                                  ┌──────────────────────────┐
                                                  │ PostgreSQL Database      │
                                                  │ - Free on Render or Neon │
                                                  └──────────────────────────┘
```

> **Why the unified runner?** Free cloud tiers (Render, Koyeb) charge money for separate background worker services. With HookRelay's `npm run start:all`, the API server and the delivery worker run concurrently in a single process, fitting 100% inside free tiers!

---

## Step 1: Deploy Backend (Choose Option A or Option B)

### Option A: Render (Recommended - Free Web Service + Free Postgres)

Render allows sign-up directly via GitHub without a credit card.

#### 1. Create a Free PostgreSQL Database on Render
1. Go to [dashboard.render.com](https://dashboard.render.com/) and sign in with GitHub.
2. Click **New +** -> **PostgreSQL**.
3. Fill in:
   - **Name:** `hookrelay-db`
   - **Database:** `hookrelay`
   - **User:** `hookrelay_user`
   - **Region:** Choose the region closest to you (e.g., Frankfurt, Oregon, Singapore)
   - **Instance Type:** Select **Free**
4. Click **Create Database**.
5. Once created, copy the **Internal Database URL** (or External Database URL).

#### 2. Create the Free Backend Web Service
1. Click **New +** -> **Web Service**.
2. Connect your GitHub repository: `Akshat-indev/hookrelay`.
3. Configure the settings:
   - **Name:** `hookrelay-backend`
   - **Region:** Same region as your database
   - **Root Directory:** `server`
   - **Runtime:** `Node`
   - **Build Command:** 
     ```bash
     npm install && npx prisma db push --schema=prisma/schema.postgresql.prisma
     ```
   - **Start Command:**
     ```bash
     npm run start:all
     ```
   - **Instance Type:** Select **Free**
4. Expand **Advanced** and add the following **Environment Variables**:
   - `NODE_ENV` = `production`
   - `DATABASE_URL` = *(Paste the Database URL from Step 1)*
   - `CORS_ORIGIN` = `*`
   - `ALLOW_LOCAL_DESTINATIONS` = `false`
5. Set **Health Check Path** to: `/api/health`
6. Click **Create Web Service**.

> Render will build the server, push the Prisma database schema, and launch the unified API and delivery worker. Once live, note your backend URL (e.g., `https://hookrelay-backend.onrender.com`).

---

### Option B: Koyeb + Neon.tech (Alternative 100% Free Stack)

If Render has region limits or delays, Koyeb + Neon is a blazing fast combination that also requires no credit card.

#### 1. Create Free Database on Neon.tech
1. Sign in to [neon.tech](https://neon.tech/) with GitHub (no card needed).
2. Create a project named `hookrelay`.
3. Copy the pooled PostgreSQL connection string (starts with `postgresql://...`).

#### 2. Deploy on Koyeb
1. Sign in to [koyeb.com](https://www.koyeb.com/) with GitHub.
2. Click **Create App** -> **GitHub**.
3. Select your repository `Akshat-indev/hookrelay`.
4. Configure service:
   - **Root Directory:** `server`
   - **Build Command:** `npm install && npx prisma db push --schema=prisma/schema.postgresql.prisma`
   - **Run Command:** `npm run start:all`
   - **Port:** `8000` (set `PORT=8000` in env vars)
5. Add Environment Variables:
   - `DATABASE_URL` = *(Your Neon database connection string)*
   - `NODE_ENV` = `production`
   - `CORS_ORIGIN` = `*`
   - `PORT` = `8000`
6. Deploy the service. Koyeb gives you a live URL like `https://hookrelay-xxxx.koyeb.app`.

---

## Step 2: Deploy Frontend on Cloudflare Pages

Cloudflare Pages offers unlimited bandwidth, instant edge distribution, and built-in SSL with zero payment verification.

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/) and go to **Compute (Workers & Pages)** -> **Pages**.
2. Click **Connect to Git** and choose your repository `Akshat-indev/hookrelay`.
3. Configure the Build Settings:
   - **Framework preset:** `Vite`
   - **Root directory:** `client`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. Expand **Environment variables (advanced)**:
   - Add variable:
     - **Variable name:** `VITE_API_BASE_URL`
     - **Value:** Your backend URL from Step 1 (e.g., `https://hookrelay-backend.onrender.com`)
5. Click **Save and Deploy**.

> **Note on Client-Side Routing:** Cloudflare Pages automatically recognizes the `client/public/_redirects` file (`/* /index.html 200`) included in this repository, ensuring direct navigation to routes like `/endpoints` and `/events/:id` works smoothly without 404 errors.

---

## Step 3: Verification & Smoke Test

Once both frontend and backend are live:

1. **Verify Backend Health:**
   Visit `https://<your-backend-url>/api/health` in your browser. You should receive:
   ```json
   {
     "status": "healthy",
     "timestamp": "2026-10-26T...",
     "services": {
       "api": "healthy",
       "database": "healthy",
       "worker": "healthy"
     }
   }
   ```
2. **Open the Cloudflare Pages Frontend:**
   - Navigate to your `https://<your-project>.pages.dev` URL.
   - Go to **Endpoints** -> **Create Endpoint**.
   - Destination URL: Create a free webhook receiver on [webhook.site](https://webhook.site) and paste the URL.
   - Send a test event from the endpoint detail page.
   - Observe real-time delivery status transition from `PENDING` -> `DELIVERED` with latency and status code 200.
