# Tech Stack — Build Your Network

**Verified from repository files. Last updated: 2026-05-16.**

## Backend
- **Runtime:** Node.js ≥20, ESM (`"type":"module"`)
- **Framework:** Express.js 4.18.2
- **Entry point:** `server.js` (single monolithic file, 2,607 lines)
- **Database client:** @supabase/supabase-js 2.105.3 (service_role key, no ORM, raw SQL via PostgREST)
- **Auth:** bcryptjs 2.4.3 (password hashing, cost 12), jsonwebtoken 9.0.0 (JWT HS256, 24h TTL)
- **File uploads:** multer 1.4.5-lts.1 + multer-storage-cloudinary 4.0.0
- **Image CDN:** Cloudinary v1 API (primary); local `public/uploads/` fallback
- **Email:** Resend 2.1.0 (transactional OTP + payment confirmation)
- **Payments:** Razorpay 2.9.2 (orders + HMAC-SHA256 webhook verification)
- **Push notifications:** expo-server-sdk 6.1.0 (Expo Push Service)
- **Security middleware:** helmet 7.0.0, cors 2.8.5, express-rate-limit 7.0.0

## Database
- **Engine:** PostgreSQL (hosted on Supabase)
- **RLS:** Disabled on all tables — backend uses service_role key exclusively
- **Schema file:** `supabase_schema.sql`

## Mobile — NetworkApp (ACTIVE)
- **Framework:** Expo 54.0.33, React Native 0.81.5, React 19.1.0
- **Navigation:** React Navigation 7.x (stack + bottom tabs)
- **Location:** `NetworkApp/`
- **API client:** axios 1.15.2 with SecureStore token interceptor
- **Token storage:** expo-secure-store 15.0.8
- **Build system:** EAS (Expo Application Services), channels: development/preview/production

## Mobile — NetworkMobile (LEGACY / INACTIVE)
- **Framework:** Expo 49.0.23, React Native ~0.85.2, React 18.2.0
- **Location:** `NetworkMobile/`
- **Status:** Not actively developed; kept for reference. Do NOT deploy.

## Hosting & Deployment
- **Backend:** Railway (nixpacks builder, `node server.js` start command)
- **Database:** Supabase (cloud PostgreSQL)
- **Images:** Cloudinary CDN
- **No Cloudflare:** Zero Cloudflare config files or references found anywhere in the repo

## Environment Variables (required)
| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin DB key (bypasses RLS) |
| `JWT_SECRET` | JWT signing secret — server exits if missing |
| `ADMIN_SECRET` | Bootstrap endpoint secret — server exits if missing |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary account |
| `CLOUDINARY_API_KEY` | Cloudinary key |
| `CLOUDINARY_API_SECRET` | Cloudinary secret |
| `RESEND_API_KEY` | Email service key |
| `RESEND_FROM` | Sender address (default: `onboarding@resend.dev` — sandbox only) |
| `RAZORPAY_KEY_ID` | Payment gateway public key |
| `RAZORPAY_KEY_SECRET` | Payment HMAC signing key |
| `RAZORPAY_WEBHOOK_SECRET` | Separate secret for webhook validation |
| `PORT` | Server port (default 3000) |
| `BASE_URL` | Used in sitemap/robots (default buildyournetwork.in) |
| `ADMIN_EMAILS` | Comma-separated emails always granted admin (default: dkhadikar@gmail.com) |
| `APK_DOWNLOAD_URL` | Optional EAS APK redirect URL |

## Domain / CORS Allowlist (from server.js:144-153)
- `https://buildyournetwork.online`
- `https://www.buildyournetwork.online`
- `https://urnetwork.online`
- `https://www.urnetwork.online`
- `http://localhost:8081`, `http://localhost:19000`, `http://localhost:19006` (dev)
