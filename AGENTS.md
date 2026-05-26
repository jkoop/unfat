# AGENTS.md

Guidance for coding agents and contributors working in this repository.

## Project Snapshot

- **App:** Unfat (food/photo + sleep + weight tracking)
- **Runtime:** Bun (`bun src/index.ts`)
- **DB:** SQLite (`bun:sqlite`)
- **UI:** Server-rendered HTML + minimal vanilla JS
- **Async AI:** Ollama jobs processed via in-process queue + SSE updates

## Local Dev Commands

- Install deps: `bun install`
- Run app: `bun src/index.ts`
- Run tests: `bun test`
- Docker: `docker compose up --build`

## Architecture Rules

- Keep server routes in `src/index.ts` unless a refactor is explicitly requested.
- Keep DB schema and constants in `src/db.ts`.
- Food image uploads are stored under `data/photos/{user_id}/{uuid}.jpg`.
- Any code that reads food images for AI must use `join(DATA_DIR, "photos", photoPath)`.
- Ollama calls must remain async through the queue (`src/queue.ts`) and never block request/response.
- Live UI updates for queue results should happen through SSE (`src/sse.ts` + `public/app.js`).

## UI/UX Rules

- Mobile-first layout.
- Dark theme with neutral grays.
- Orange is primary CTA color; avoid multiple competing orange CTAs on the same screen.
- Keep forms friction-light: default datetime inputs to now.
- When status changes asynchronously, update UI in-place without requiring refresh.

## Auth/Admin Rules

- Multi-user system is required.
- Admin can: create users, reset passwords, disable/enable users, delete users and related data.
- No self-service password reset flow exists; admin reset is the only reset path.
- Seed admin account is `admin/admin` and must change password on first login.

## Testing Expectations

- Add or update tests for behavior changes, especially:
  - route/page availability
  - form submissions
  - auth/admin actions
  - async food/AI flows
- Maintain passing `bun test` before finishing work.

## Safety / Data Integrity

- Do not delete or reset unrelated user changes.
- Avoid destructive git commands unless explicitly requested.
- For user deletion, remove DB records (via FK cascade) and photo directory.

## Preferred Change Style

- Keep changes small and focused.
- Preserve existing coding style (TypeScript strict mode, straightforward functions).
- Add brief comments only when logic is non-obvious.
