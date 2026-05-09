# Onboarding Extension Spec
**Scope:** Post-OTP-verification onboarding only. Auth system untouched.
**Trigger:** `users.verified = true` AND `users.onboarding_stage != 'complete'`

---

## 1. Onboarding State Machine

```
[verified = true]
      │
      ▼
  stage: 'acquisition'     → Screen 1: How did you hear about us?
      │ (submitted)
      ▼
  stage: 'intent'          → Screen 2: What brings you here?
      │ (submitted)
      ▼
  stage: 'profile'         → Screen 3: Complete your profile
      │ (submitted)
      ▼
  stage: 'complete'        → Enter app
```

**Rules:**
- Stage is stored server-side. The frontend requests the current stage on every app-load and routes accordingly.
- A user at `stage: 'intent'` cannot submit to acquisition endpoint again.
- A user at `stage: 'complete'` bypasses all onboarding screens on every future login.
- A user who closes the app mid-onboarding resumes at their saved stage.
- Stage is only advanced by a successful API response. Never optimistically advanced on the frontend before the server confirms.

---

## 2. Database Schema

All additions are backward-compatible. Existing tables and columns are unchanged.

### 2a. `users` table — new columns

```sql
ALTER TABLE users
  ADD COLUMN onboarding_stage TEXT NOT NULL DEFAULT 'acquisition'
    CHECK (onboarding_stage IN ('acquisition','intent','profile','complete')),
  ADD COLUMN trust_score      INTEGER NOT NULL DEFAULT 0;
```

- Existing users: set `onboarding_stage = 'complete'`, `trust_score` recalculated on next profile save.
- `onboarding_stage` is NOT NULL with a default so existing rows are never null.

### 2b. `user_acquisition` table — new table

```sql
CREATE TABLE user_acquisition (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  source     TEXT NOT NULL
    CHECK (source IN (
      'LinkedIn','Instagram','Twitter/X','WhatsApp',
      'Friend/Referral','Google Search','Community/Event','YouTube','Other'
    )),
  referral   TEXT,          -- NULL unless source = 'Friend/Referral'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- `UNIQUE` on `user_id` prevents duplicate submissions.
- `referral` trimmed server-side, max 50 chars. Stored as NULL if source is not 'Friend/Referral'.

### 2c. `user_intents` table — new table

```sql
CREATE TABLE user_intents (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  intent     TEXT NOT NULL
    CHECK (intent IN (
      'Networking','Find Opportunities','Build Startup Connections',
      'Find Co-founder','Hiring','Find Clients','Mentorship',
      'Learn from People','Community','Investment Opportunities'
    )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, intent)   -- prevents duplicate intent entries per user
);
```

### 2d. `user_education` table — new table

```sql
CREATE TABLE user_education (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school       TEXT,
  university   TEXT,
  degree       TEXT,
  field        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- Multiple rows per user allowed.
- Duplicate prevention: reject insert if another row for the same `user_id` has the same `(school, university, degree, field)` tuple.

### 2e. `user_work` table — new table

```sql
CREATE TABLE user_work (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company         TEXT,
  job_title       TEXT,
  industry        TEXT,
  employment_type TEXT
    CHECK (employment_type IN (
      'Full-time','Part-time','Freelancer','Founder',
      'Self-employed','Student','Intern','Consultant',
      'Open to Work','Other'
    )),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- Multiple rows per user allowed.
- Duplicate prevention: reject insert if same `(company, job_title, employment_type)` already exists for `user_id`.

### 2f. `user_interests` table — new table

```sql
CREATE TABLE user_interests (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  interest   TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, interest)
);
```

- No fixed enum — interests are free text tags, trimmed, lowercased for comparison on duplicate check.

### 2g. `user_social_links` table — new table

```sql
CREATE TABLE user_social_links (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform   TEXT NOT NULL
    CHECK (platform IN ('linkedin','twitter','portfolio','website','github','instagram')),
  url        TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, platform)   -- one URL per platform per user
);
```

### 2h. Existing `users` table — new profile columns

Add only if not already present. Do not overwrite existing columns.

```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS headline          TEXT,       -- max 80 chars
  ADD COLUMN IF NOT EXISTS bio               TEXT,       -- 30–180 chars when set
  ADD COLUMN IF NOT EXISTS profession        TEXT,
  ADD COLUMN IF NOT EXISTS industry          TEXT,
  ADD COLUMN IF NOT EXISTS experience_level  TEXT
    CHECK (experience_level IN ('Beginner','Intermediate','Advanced','Expert'));
```

---

## 3. API Endpoints

All endpoints require `Authorization: Bearer <token>`. All inputs are validated server-side. Frontend validation is UX-only.

### 3a. GET `/api/onboarding/stage`

Returns the user's current onboarding stage.

**Response:**
```json
{ "stage": "acquisition" }
```
Values: `acquisition | intent | profile | complete`

Used on every app-load to route the user correctly.

---

### 3b. POST `/api/onboarding/acquisition`

Submits Screen 1.

**Guard:** Reject with `409` if `onboarding_stage != 'acquisition'` (prevents re-submission or skipping).

**Request body:**
```json
{
  "source": "Friend/Referral",
  "referral": "John Smith"        // required only when source = Friend/Referral
}
```

**Validation:**
- `source`: required, must match enum exactly. Reject null, empty string, or unlisted values.
- `referral`: ignored unless `source = 'Friend/Referral'`. If provided, trim whitespace, max 50 chars.
- If `source != 'Friend/Referral'` and `referral` is provided, silently discard `referral`.

**On success:**
1. Insert row into `user_acquisition`.
2. Set `users.onboarding_stage = 'intent'`.
3. Return `{ "stage": "intent" }`.

**Error responses:**
- `400` — invalid or missing `source`
- `409` — already submitted (duplicate `user_id` in `user_acquisition`)

---

### 3c. POST `/api/onboarding/intent`

Submits Screen 2.

**Guard:** Reject with `409` if `onboarding_stage != 'intent'`.

**Request body:**
```json
{ "intents": ["Networking", "Hiring", "Find Co-founder"] }
```

**Validation:**
- `intents`: non-empty array, min 1 item, each value must match enum.
- Reject: empty array, null, duplicates within the submitted array, any unlisted value.
- Deduplicate silently on insert (via `ON CONFLICT DO NOTHING` on `user_intents`).

**On success:**
1. Insert rows into `user_intents` (deduplicated).
2. Set `users.onboarding_stage = 'profile'`.
3. Return `{ "stage": "profile" }`.

**Error responses:**
- `400` — empty array, invalid values, or missing field
- `409` — wrong stage

---

### 3d. POST `/api/onboarding/profile`

Submits Screen 3 and completes onboarding.

**Guard:** Reject with `409` if `onboarding_stage != 'profile'`.

**Request body:**

```json
{
  "headline":         "Founder",
  "bio":              "Building a professional network for high-intent connections.",
  "profession":       "Engineer",
  "industry":         "Technology",
  "experience_level": "Advanced",
  "interests":        ["AI", "Startups", "SaaS"],
  "education": [
    {
      "school":      "Lincoln High School",
      "university":  "MIT",
      "degree":      "B.Sc",
      "field":       "Computer Science"
    }
  ],
  "work": [
    {
      "company":         "Acme Inc",
      "job_title":       "CTO",
      "industry":        "SaaS",
      "employment_type": "Founder"
    }
  ],
  "social_links": [
    { "platform": "linkedin", "url": "https://linkedin.com/in/example" },
    { "platform": "github",   "url": "https://github.com/example" }
  ]
}
```

All fields are optional. An empty body is a valid partial submission (user tapped Continue with nothing filled in).

**Validation per field:**
- `headline`: if present, max 80 chars after trim. Reject only-whitespace string.
- `bio`: if present and non-empty, min 30 chars after trim, max 180 chars. Reject 1–29 char non-empty bio.
- `experience_level`: if present, must match enum.
- `interests`: if present, non-empty array of non-empty strings. Trim each. Deduplicate case-insensitively.
- `education`: array of objects. For each entry, reject if all four fields are blank. Prevent duplicate `(school, university, degree, field)` tuples per user.
- `work`: array of objects. `employment_type` must match enum if present. Prevent duplicate `(company, job_title, employment_type)` per user.
- `social_links`: each `url` validated with URL regex (must start with `https://` or `http://`). `platform` must match enum. One entry per platform — if duplicate platform submitted, use the last value.
- `photo`: handled by existing upload endpoint. Not re-uploaded via this endpoint.

**On success:**
1. Update `users` with `headline`, `bio`, `profession`, `industry`, `experience_level`.
2. Insert into `user_interests` (deduplicated via `ON CONFLICT DO NOTHING`).
3. Insert into `user_education`, `user_work` (duplicate-checked).
4. Upsert into `user_social_links` (one row per platform).
5. Recalculate and store `trust_score`.
6. Set `users.onboarding_stage = 'complete'`.
7. Return `{ "stage": "complete", "trust_score": <int> }`.

**Error responses:**
- `400` — validation failure (include field name and reason in `error`)
- `409` — wrong stage

---

### 3e. POST `/api/me/photo` (existing — preserve as-is)

Profile photo upload is handled by the existing photo upload endpoint. Not duplicated here.

---

## 4. Trust Score — Server-Side Calculation

Calculated exclusively server-side. Never accept a trust score value from the frontend.

| Signal | Points |
|---|---|
| Email verified (`users.verified = true`) | 15 |
| Profile photo uploaded (`photos` not empty) | 20 |
| Bio present and ≥ 30 chars | 15 |
| At least 1 interest added | 10 |
| At least 1 work entry added | 10 |
| At least 1 education entry added | 10 |
| At least 1 social link added | 10 |
| Onboarding completed (`stage = 'complete'`) | 10 |
| **Max** | **100** |

Recalculated on: onboarding profile submit, profile edits, photo add/remove, education/work/link add/remove.

---

## 5. Screen-by-Screen UX Spec

### Screen 1 — "How did you hear about us?"

| Element | Spec |
|---|---|
| Title | "How did you hear about us?" |
| Input | Single-select dropdown |
| Placeholder | "Select an option" |
| Options | LinkedIn, Instagram, Twitter/X, WhatsApp, Friend/Referral, Google Search, Community/Event, YouTube, Other |
| Continue button | Disabled until selection made |
| Referral field | Appears only when "Friend/Referral" selected. Optional. Max 50 chars. |
| Referral placeholder | "Referral name or code (optional)" |
| Value persistence | Store selection in component state; restore on mount from server stage |
| Progress | Show step indicator: 1 of 3 |

**Continue button behaviour:**
- Disabled: no selection made
- Enabled: valid selection made
- On click: POST `/api/onboarding/acquisition`, disable button + show inline loading, advance to Screen 2 on success

---

### Screen 2 — "What brings you here?"

| Element | Spec |
|---|---|
| Title | "What brings you here?" |
| Subtitle | "Select all that match your current intent" |
| Input | Multi-select card grid |
| Cards | Networking, Find Opportunities, Build Startup Connections, Find Co-founder, Hiring, Find Clients, Mentorship, Learn from People, Community, Investment Opportunities |
| Default state | All cards unselected |
| Selected state | Visually distinct (border highlight + background tint using app primary colour) |
| Continue button | Disabled until ≥ 1 card selected |
| Value persistence | Selected cards stored in component state |
| Progress | Show step indicator: 2 of 3 |

**Card behaviour:**
- Tap to select. Tap again to deselect.
- No card is pre-selected on mount.
- Keyboard accessible: Enter/Space toggles selected state.

**Continue button behaviour:**
- Disabled: 0 cards selected
- Enabled: ≥ 1 card selected
- On click: POST `/api/onboarding/intent`, disable button + show inline loading, advance to Screen 3 on success

---

### Screen 3 — "Complete your profile"

| Element | Spec |
|---|---|
| Title | "Complete your profile" |
| Subtitle | "Help people find and connect with you" |
| Progress | Show step indicator: 3 of 3 |
| Continue button label | "Finish" |
| Continue button | Always enabled (all fields optional). Tapping Finish with nothing filled is valid. |

#### Always Visible Fields

**Profile Photo**
- Tapping opens existing photo upload picker
- Shows selected photo preview; fallback avatar initials
- Upload via existing `/api/me/photo` endpoint
- Optional

**Headline**
- Single-line text input
- Placeholder: "e.g. Founder, Software Engineer, Investor"
- Max 80 chars
- Live char count shown at 60+ chars

**Bio**
- Multi-line text area
- Placeholder: "Tell people what you're about…"
- Live character counter always visible (e.g. "0 / 180")
- Error shown inline when length is 1–29: "Bio must be at least 30 characters long."
- Error clears when field becomes empty or reaches 30 chars
- Max 180 chars (hard limit on input)

**Professional Identity**
- Profession: text input, placeholder "e.g. Software Engineer, Investor"
- Industry: text input, placeholder "e.g. Technology, Finance"
- Experience Level: single-select dropdown. Options: Beginner, Intermediate, Advanced, Expert. Placeholder: "Select level"

**Interests**
- Searchable multi-select tag input
- Suggested tags: AI, Startups, Sales, Marketing, Design, Finance, Investing, Technology, Fitness, Networking, SaaS, Business Development
- User can also type custom interests
- Selected interests shown as dismissible tags
- No minimum required

#### "Show More" — Expandable Sections

Collapsed by default. Expanding one section does not collapse others.

Each section has a chevron indicator. Animated expand/collapse (slide + fade, ~200ms). Values preserved on collapse/reopen.

**Education**
- School (text input)
- College/University (text input)
- Degree (text input)
- Field of Study (text input)
- "+ Add Another" button adds a second entry block
- No duplicate entry allowed: block "Add Another" if current entry is fully blank

**Current Work**
- Company (text input)
- Job Title (text input)
- Industry (text input)
- Employment Type (dropdown): Full-time, Part-time, Freelancer, Founder, Self-employed, Student, Intern, Consultant, Open to Work, Other
- "+ Add Another" button adds a second entry block

**Location**
- No new location fields
- Display only: show detected GPS location if available ("📍 Mumbai, India")
- If GPS denied: show nothing (no error, no input)
- No manual city/country inputs
- Existing GPS system handles all location logic

**Social Links**
- LinkedIn (URL input)
- Twitter/X (URL input)
- Portfolio (URL input)
- Website (URL input)
- GitHub (URL input)
- Instagram (URL input)
- All optional
- Invalid URL shows inline error: "Please enter a valid URL"

#### Finish Button Behaviour
- Always enabled
- On click: POST `/api/onboarding/profile`, show inline loading on button, navigate to main app on success
- On server validation error: show field-level inline error messages, do not advance

---

## 6. State Handling Rules

| Scenario | Behaviour |
|---|---|
| App closed mid-Screen 1 | On reload: `GET /api/onboarding/stage` returns `acquisition`. Re-show Screen 1. Dropdown selection not persisted (re-select). |
| App closed mid-Screen 2 | On reload: stage = `intent`. Re-show Screen 2. Card selections not persisted (re-select). |
| App closed mid-Screen 3 | On reload: stage = `profile`. Re-show Screen 3. Form values not persisted (re-fill). |
| Network error on submit | Show error toast. Button re-enabled. Stage not advanced. User retries. |
| Server returns 409 on acquisition | Stage is already past acquisition. Advance frontend to correct stage from `GET /api/onboarding/stage`. |
| User submits Screen 2 twice (double-tap) | Second request returns 409. Frontend ignores 409 if stage has already advanced; proceed to next screen. |
| Existing user (pre-onboarding) logs in | `onboarding_stage = 'complete'`. Skip all onboarding screens. Enter app directly. |
| User force-refreshes on Screen 3 | Re-show Screen 3 (stage still `profile`). Fields empty — no server-side draft persistence for optional profile fields. |

---

## 7. Existing User Migration

Run once on deploy:

```sql
UPDATE users
SET onboarding_stage = 'complete'
WHERE verified = true
  AND onboarding_stage = 'acquisition';

-- Recalculate trust scores for existing users via application code on next profile access.
```

Existing users who are verified but have not gone through new onboarding are set to `complete` immediately. They are not forced through onboarding retro-actively.

---

## 8. What Is Explicitly Out of Scope

- Modifying signup, login, OTP generation, or OTP verification
- Any dashboard, feed, messaging, analytics, or recommendation system
- Manual location inputs (GPS system handles this)
- New navigation structure or tab changes
- Monetisation or premium gates during onboarding
- A/B testing infrastructure
- Email or push notifications triggered by onboarding
- Admin reporting on onboarding funnel
