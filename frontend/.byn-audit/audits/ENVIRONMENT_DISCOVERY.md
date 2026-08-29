# BYN Environment Discovery

**Audit Date:** 2026-08-17  
**Auditor:** BYN Frontend Audit Agent (Antigravity)  
**Branch:** `audit/byn-audit` (Application source: `C:\Networking\frontend`)  
**Status:** Discovery Complete  

---

## Repository
- **Application Directory:** `C:\Networking\frontend`
- **Audit Framework Directory:** `.byn-audit/` (integrated within frontend repo and audit agent workspace)
- **Monorepo / Workspace Context:** Standalone Next.js web application residing alongside Express backend services in `C:\Networking`
- **Source Code Integrity:** Read-only mode preserved. 0 modifications to application source, `package.json`, or production configuration.

---

## Framework
- **Core Framework:** Next.js **16.2.6** (App Router architecture with Turbopack bundler)
- **React Core:** React **19.2.4**
- **DOM Renderer:** React DOM **19.2.4**
- **TypeScript:** TypeScript **5.x** (`tsconfig.json` targeting ES2017 with path aliases `@/*` mapping to root)
- **Next Config Features:** Standalone build output (`output: "standalone"`), static security headers, strict Content Security Policy (CSP), image optimization remote patterns (Cloudinary, BYN domains), and reverse proxy rewrites for backend API routes.

---

## Package Manager
- **Package Manager:** `npm`
- **Lockfile:** `package-lock.json` (Lockfile version 3 present and verified)
- **Installation Status:** All required production and dev dependencies resolved in `node_modules`.

---

## Scripts
Discovered in `package.json`:
- `dev`: `next dev` — Starts local Turbopack development server (default port 3000)
- `build`: `next build` — Generates optimized production build with SSG and TypeScript validation
- `start`: `next start` — Starts standalone production HTTP server
- `lint`: `eslint` — Runs ESLint checks with `eslint-config-next` (16.2.6)

---

## Application Architecture
- **Router Pattern:** Next.js App Router (`app/`) utilizing Route Groups:
  - `(app)`: Authenticated application shell with global app layout (`app/(app)/layout.tsx`), header/navigation, profile drawers, toast notifications, and client route guards.
  - `(auth)`: Public guest auth flows (`login`, `signup`, `verify`, `forgot-password`, `reset-password`) wrapped in `(auth)/layout.tsx`.
  - `(legal)`: Static legal & company pages (`about`, `contact`, `privacy`, `terms`).
  - `(seo)`: Programmatic SEO landing pages generated statically (SSG) for 23 Indian cities, 8 industries, 8 roles, and targeted persona landing pages.
  - Root standalone routes: `/` (Marketing landing page with interactive previews), `/onboarding` (multi-step user onboarding flow), `/opportunities` (collaboration requests feed), `/retention` (momentum and daily recommendation engine).
- **Entry Points:**
  - `app/layout.tsx`: Root HTML shell with Inter typography, `AuthProvider`, `CookieBanner`, and metadata configuration.
  - `app/(app)/layout.tsx`: Protected shell providing `ToastProvider`, `ProfileDrawerProvider`, `DesktopNav`, `BottomNav`, and `ShellDrawer`.

---

## Route Inventory
Discovered **38 distinct route patterns** (compiling into 85 statically pre-rendered and dynamic pages):

| Category | Route | Auth Level | Purpose |
|---|---|---|---|
| **Marketing & Home** | `/` | Public | Primary landing page with dynamic UI previews |
| **Auth** | `/login` | Public (Guest) | Email/Password login |
| **Auth** | `/signup` | Public (Guest) | User registration |
| **Auth** | `/verify` | Authenticated (unverified) | 6-digit Email OTP verification |
| **Auth** | `/forgot-password` | Public | Password recovery request |
| **Auth** | `/reset-password` | Public (Token) | Set new password |
| **Onboarding** | `/onboarding` | Authenticated (incomplete) | Multi-step onboarding (Intent, Skills, Photos, Suggestions) |
| **Core Discovery** | `/discover` | Authenticated (complete) | Intent-based discovery feed with swipe cards & filters |
| **Networking** | `/likes` | Authenticated (complete) | Inbound likes and pending connection requests |
| **Messaging** | `/chat` | Authenticated (complete) | Matches list & conversation directory |
| **Messaging** | `/chat/[id]` | Authenticated (complete) | 1-on-1 direct messaging conversation |
| **Community** | `/circles` | Authenticated (complete) | Community feed with posts and link previews |
| **Community** | `/circles/groups` | Authenticated (complete) | Circle interest groups directory |
| **Community** | `/circles/groups/[id]` | Authenticated (complete) | Circle group thread & member panel |
| **Profile** | `/profile` | Authenticated (complete) | Own user profile view & inline editor |
| **Profile** | `/profile/[id]` | Authenticated (complete) | Public inspection of another member's profile |
| **Monetization** | `/upgrade` | Authenticated (complete) | Membership tiers with Razorpay payment modal |
| **Engagement** | `/opportunities` | Authenticated | High-signal collaboration opportunity feed |
| **Engagement** | `/retention` | Authenticated | Daily recommendations & network momentum score |
| **Legal** | `/about`, `/contact`, `/privacy`, `/terms` | Public | Informational & compliance pages |
| **SEO & Directories** | `/cities`, `/cities/[city]` (23 cities) | Public | City-specific landing directories |
| **SEO & Directories** | `/industries`, `/industries/[industry]` (8) | Public | Industry-specific networking pages |
| **SEO & Directories** | `/roles`, `/roles/[role]` (8 roles) | Public | Role-targeted networking pages |
| **SEO & Directories** | `/professionals/[slug]` (8 slugs) | Public | Specialty category landing pages |
| **SEO Target Pages** | `/business-networking-app`, `/linkedin-alternative`, `/startup-community-india`, `/networking-for-founders`, `/networking-for-investors`, `/networking-for-creators`, `/networking-for-freelancers`, `/networking-for-entrepreneurs` | Public | Keyword-targeted acquisition landing pages |
| **API** | `/api/network-density` | Internal API | Route Handler for network graph density metrics |

*(Full details recorded in `.byn-audit/ROUTES.md`)*

---

## Authentication
- **Mechanism:** HttpOnly cookie-based session token (`byn_token`) carrying JWT with `{ credentials: 'include' }` on all API requests.
- **Client State:** `context/AuthContext.tsx` handles `user`, `loading`, `login()`, `signup()`, `logout()`, `refreshUser()`, and automatic session recovery on page load via `GET /api/me`.
- **Route Guard:** `app/(app)/layout.tsx` enforces three-tier access control:
  1. Unauthenticated users (`!user`) -> Redirected to `/login`
  2. Unverified email (`!user.email_verified`) -> Redirected to `/verify`
  3. Incomplete onboarding (`user.onboarding_stage !== 'complete'`) -> Redirected to `/onboarding`
- **Session Expiry Handling:** Dispatches `byn:unauthorized` window event on any `401 Unauthorized` response to clear user state and force login redirection gracefully without infinite error loops.

---

## Data Fetching
- **Client Fetching Wrapper:** `lib/api.ts` providing typed helper functions: `apiGet`, `apiPost`, `apiPut`, `apiPatch`, `apiDelete`, `apiUpload`.
- **Reverse Proxy:** Next.js `next.config.ts` rewrites `/api/:path*` directly to the backend service configured via `BACKEND_URL` (defaults to Railway cloud backend: `https://adequate-dedication-production-69aa.up.railway.app`).
- **Static Pre-rendering:** SSG dynamic route generators (`generateStaticParams`) for programmatic SEO pages (`cities`, `industries`, `roles`, `professionals`).

---

## State Management
- **Global Contexts:**
  - `AuthContext` (`context/AuthContext.tsx`): User profile, authentication state, login/signup/logout actions.
  - `ProfileDrawerContext` (`context/ProfileDrawerContext.tsx`): Shared modal drawer state for previewing profiles from any view without navigating away.
  - `ToastProvider` (`components/ui/Toast.tsx`): Floating transient toast notifications.
- **Form Management:** `react-hook-form` paired with `@hookform/resolvers/zod` and `zod` validation schemas for robust client-side validation.
- **Local State:** Native React hooks (`useState`, `useReducer`, `useEffect`, `useCallback`, `useMemo`).

---

## Styling
- **Styling Framework:** Tailwind CSS v4 (`tailwindcss: ^4`, `@tailwindcss/postcss: ^4`, `postcss.config.mjs`).
- **Global Design Tokens:** `app/globals.css` and `app/(app)/app.css` defining dark theme color variables (`--bg`, `--card-bg`, `--text`, `--accent`, `--border`), blur/glassmorphism utilities, and touch targets.
- **Typography:** Self-hosted Google Font `Inter` via `next/font/google` (zero external CDN dependency).
- **Motion & Transitions:** `framer-motion` (v12.39.0) powering card gesture swiping, drawer slide-outs, modal transitions, and micro-interactions.

---

## Local Development
- **Dev Command:** `npm run dev` (running `next dev` with Turbopack)
- **Local URL:** `http://localhost:3000`
- **Startup Test Status:** **SUCCESSFUL** — Dev server boots in ~4.9s and responds with HTTP 200 OK (`Build Your Network — High-Signal Networking for Builders`).
- **Production Build Status:** **PASS** — `npm run build` completed with zero TypeScript errors and generated 85 static/dynamic pages.

---

## Browser Testing Readiness
- **Browser Automation:** Playwright (v1.60.0) is installed and operational.
- **Headless Execution:** Successfully validated via headless Chromium launcher with DOM inspection and screenshot capabilities.
- **Responsive Viewport Support:** Ready to evaluate viewports across all required device widths:
  - Mobile: `320px`, `375px`, `390px`, `430px`
  - Tablet: `768px`, `1024px`
  - Desktop: `1440px`

---

## Environment Variables
Discovered variables in frontend codebase:
- `BACKEND_URL`: Target backend URL for API proxy rewrites (defaults cleanly to production Railway endpoint `https://adequate-dedication-production-69aa.up.railway.app`).
- `NEXT_PUBLIC_APP_URL`: Base application URL (defaults to `https://buildyournetwork.online`).
- `NODE_ENV`: Standard environment indicator (`development` / `production`).
- **Missing Required Variables:** **None**. The application starts, compiles, and serves pages without missing configuration blocks.

---

## Audit Blockers
- **Build / Compilation Blockers:** None (Build: PASS).
- **Runtime / Server Blockers:** None (Dev server operational on `http://localhost:3000`).
- **Automation Blockers:** None (Playwright automation tested and operational).
- **Authentication Note for Journey Testing:** For Phase 3 core journey execution (`/discover`, `/likes`, `/chat`, `/profile`, `/circles`), test user accounts can be dynamically provisioned via `/signup` + OTP or test credentials supplied for the Railway backend.

---

## Recommended Next Step
Proceed to **Phase 2 & Phase 3 Full Browser Audit**:
1. Execute browser automation scripts across all 38 discoverable routes.
2. Test responsive behavior at 320px, 375px, 390px, 430px, 768px, 1024px, and 1440px.
3. Test core user journeys: Authentication, Onboarding, Discovery (swipe/cards/filters), Likes, Matches/Chat, Circles/Groups, Profile editing, and Upgrade modal.
4. Capture console logs, network payloads, and visual evidence in `.byn-audit/evidence/`.
5. Compile findings into `.byn-audit/reports/BYN_FRONTEND_AUDIT.md`.

---

## Readiness Verdict

**READY FOR BROWSER AUDIT**
