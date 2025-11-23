# Social Scheduler (demo)

Lightweight demo app that plans, schedules, and (mock) publishes social posts using a planner agent (LLM), an executor, and provider adapters. Built with Node.js + TypeScript and a file-based `lowdb` store for easy local development.

**Contents**
- `src/` — TypeScript source
- `src/static/index.html` — simple frontend chat UI
- `data/db.json` — local JSON database (tokens, posts, analytics)

Quick start
1. Install dependencies:
```powershell
npm install
```
2. Start in dev mode:
```powershell
npm run dev
```
3. Open the UI: `http://localhost:3000/`

Key features
- Planner: `src/agent/planner.ts` — uses OpenAI (if `OPENAI_API_KEY` present) or a deterministic fallback to produce planned posts.
- Executor: `src/agent/executor.ts` — posts to providers with retries/backoff (uses `src/social/providers.ts`).
- Providers: `src/social/providers.ts` — calls real provider endpoints when tokens/config are present, otherwise falls back to `src/social/mockProviders.ts`.
- OAuth helpers: `src/oauth.ts` — builds auth URLs, exchanges codes, refreshes tokens, and persists tokens to `data/db.json`.
- Reasoner: `src/agent/reasoner.ts` — Q3 reasoning, post improvement, and scheduling suggestions via LLM (with fallbacks).

Environment variables
Create a `.env` with values appropriate for your setup. Common variables used:
- `PORT` (default 3000)
- `OPENAI_API_KEY`, `OPENAI_MODEL` (optional; planner & reasoner)
- OAuth provider config (optional):
  - `TWITTER_AUTH_URL`, `TWITTER_TOKEN_URL`, `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`, `TWITTER_SCOPE`
  - `FACEBOOK_AUTH_URL`, `FACEBOOK_TOKEN_URL`, `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`, `FACEBOOK_SCOPE`
  - `LINKEDIN_AUTH_URL`, `LINKEDIN_TOKEN_URL`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_SCOPE`
  - `OAUTH_REDIRECT_URI` (default: `http://localhost:3000/api/oauth/callback`)
  - `FACEBOOK_PAGE_ID` (for posting to a page)
  - `LINKEDIN_OWNER_URN` (e.g. `urn:li:organization:12345`)

Testing & useful endpoints
- Frontend: `GET /` (chat UI)
- Plan a post: `POST /api/posts/plan` { prompt }
- Schedule a post: `POST /api/posts/schedule` { text, platforms, at }
- Chat UI endpoint: `POST /api/chat` { message }
- OAuth:
  - `GET /api/oauth/:platform/url` — build auth URL (Twitter supports PKCE)
  - `GET /api/oauth/callback?platform=<>&code=<>` — exchange code and store token
  - `GET /api/oauth/tokens` — list stored tokens (dev helper)
  - `POST /api/oauth/mock-token` — create/upsert a mock token for testing (dev helper)
  - `POST /api/oauth/refresh/:platform` — refresh stored token
- Reasoner: `POST /api/reason` { type: 'improve'|'schedule'|'q3', text?, platform?, context? }

Database
- File: `data/db.json` managed by `lowdb`.
- Top-level collections: `tokens`, `posts`, `analytics`, `oauthStates`.
- Timestamps are stored as epoch milliseconds.

Security notes
- This project includes dev-only helpers (e.g. `/api/oauth/tokens`, `/api/oauth/mock-token`) that expose tokens and should NEVER be used in production.
- Keep `.env` and `data/db.json` out of version control (already added to `.gitignore`).

Extending and productionizing
- Replace `lowdb` with a real database for persistence and concurrency.
- Harden OAuth flows, validate tokens, and implement secure storage for secrets.
- Add provider-specific analytics fetchers and mapping to a unified schema.

License
This repository is a demo; add a license file if you plan to publish.

If you want, I can also add a small README section describing how to configure a GitHub Actions workflow to run tests or deploy this app.
