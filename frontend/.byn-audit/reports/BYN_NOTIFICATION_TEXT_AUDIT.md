# BYN Notification Text & Retention Copy Audit

**Date:** August 25, 2026  
**Audited System:** Web Push Notifications, In-App Alerts, Retention Action Cards, and Service Worker Routing  
**Codebase:** Next.js 16.2.6 · TypeScript · Web Push Manager · Service Worker  
**Target:** High-Intent, Professional Builder Communication (Bumble Bizz / LinkedIn / Linear Benchmark)  
**Overall Notification Copy Score:** `71 / 100` (Grade: **C+** ➔ Needs Elevation to **A+**)

---

## 1. Executive Summary & Core Defect Matrix

The notification infrastructure in BYN currently drives retention via browser notifications (`lib/retention/notifications.ts`), daily recommendation action cards (`components/retention/DailyRecommendations.tsx`), and web push subscriptions (`lib/webpush.ts`, `public/sw.js`). However, the existing copy is overly generic, uses passive dating-app phrasing, lacks builder specificity, and suffers from **critical broken routing links** (`webapp.html#...`).

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       NOTIFICATION COPY SCORECARD                           │
├─────────────────────────────────────┬─────────┬─────────────────────────────┤
│ Dimension                           │ Score   │ Status                      │
├─────────────────────────────────────┼─────────┼─────────────────────────────┤
│ 1. Value Proposition & Intent Clarity│ 68 / 100│ Too generic, passive tone   │
│ 2. Builder Relevance & Specificity  │ 65 / 100│ Missing role/skill context  │
│ 3. Call-to-Action (CTA) Urgency     │ 72 / 100│ Weak verb phrases           │
│ 4. Route Integrity & Action Links   │ 55 / 100│ Broken legacy URL anchors   │
│ 5. Toast & In-App Feedback Polish   │ 82 / 100│ Functional, needs punchiness│
├─────────────────────────────────────┼─────────┼─────────────────────────────┤
│ Overall Notification Copy Score     │ 71 / 100│ Grade: C+ (High ROI fix)    │
└─────────────────────────────────────┴─────────┴─────────────────────────────┘
```

---

## 2. In-Depth Copy Analysis: Current vs. Proposed

### Template 1: Pending Likes & Mutual Discovery
* **Current Copy:**
  - **Title:** *"People have liked your profile"*
  - **Body:** *"Someone's waiting. See who's interested in connecting with you."*
  - **CTA:** *"View likes"* ➔ `https://buildyournetwork.online/webapp.html#likes` ❌
* **Proposed High-Conversion Builder Copy:**
  - **Title:** *"🎯 {count} Builders Want to Connect with You"*
  - **Body:** *"High-alignment founders and engineers reviewed your profile and expressed interest. Check mutual intents and connect."*
  - **CTA:** *"Review Builders →"* ➔ `/likes` ✅

---

### Template 2: Stale Connection Re-engagement
* **Current Copy:**
  - **Title:** *"Reconnect with someone"*
  - **Body:** *"A connection hasn't heard from you in a while. A quick message goes a long way."*
  - **CTA:** *"Send message"* ➔ `https://buildyournetwork.online/webapp.html#connections` ❌
* **Proposed High-Conversion Builder Copy:**
  - **Title:** *"🚀 Reconnect with {name}: Keep your project momentum"*
  - **Body:** *"You haven't spoken in {days} days. Drop a quick 1-click icebreaker to discuss current build progress."*
  - **CTA:** *"Send Quick Note →"* ➔ `/chat/{connectionId}` ✅

---

### Template 3: Connection Expiry Alert (Match Urgency)
* **Current Copy:**
  - **Title:** *"⏱ {hoursLeft}h left"*
  - **Body:** *(No body, tiny badge in list)*
* **Proposed High-Conversion Builder Copy:**
  - **Title:** *"⏱ Match with {name} expires in {hours}h"*
  - **Body:** *"Unopened match! Send a quick hello before this connection opportunity closes."*
  - **CTA:** *"Say Hello →"* ➔ `/chat/{connectionId}` ✅

---

### Template 4: Priority Message Received
* **Current Copy:**
  - **Title:** *(Generic push notification)*
  - **Body:** *(Unspecified)*
* **Proposed High-Conversion Builder Copy:**
  - **Title:** *"⚡ Priority Message from {name}"*
  - **Body:** *"{name} used a priority message to reach you directly regarding: '{snippet}'."*
  - **CTA:** *"Read & Reply →"* ➔ `/chat/{connectionId}` ✅

---

### Template 5: Profile Optimization / Discovery Unlock
* **Current Copy:**
  - **Title:** *"Add your first photo"* / *"Add a bio"*
  - **Body:** *"Profiles with photos get 3× more connections. Unlock discovery now."*
  - **CTA:** *"Add photo"* ➔ `https://buildyournetwork.online/webapp.html#profile` ❌
* **Proposed High-Conversion Builder Copy:**
  - **Title:** *"📸 Complete Your Builder Card to Unlock Discovery"*
  - **Body:** *"Builders with verified avatars and active project summaries receive 4.2× higher match response rates."*
  - **CTA:** *"Update Profile →"* ➔ `/profile` ✅

---

### Template 6: Service Worker Routing Fix (`public/sw.js`)
* **Current Broken Route Map:**
  - `LikedMe` ➔ `/liked-me` (404, should be `/likes`)
  - `PriorityMessages` ➔ `/messages` (404, should be `/chat`)
* **Corrected Route Map:**
  - `LikedMe` ➔ `/likes`
  - `PriorityMessages` ➔ `/chat`
  - `ChatDetail` ➔ `/chat/{connectionId}`
  - `Circles` ➔ `/circles`
  - `Discover` ➔ `/discover`

---

## 3. Implementation Recommendations
1. Update `lib/retention/recommendations.ts` with the high-intent builder copy matrix and correct Next.js route targets (`/profile`, `/likes`, `/chat`, `/discover`).
2. Fix `public/sw.js` route handlers for `LikedMe` (`/likes`) and `PriorityMessages` (`/chat`).
3. Update `components/retention/DailyRecommendations.tsx` and `CollaborationAlerts.tsx` with high-contrast badge copy.
4. Add an interactive **Notification Center & Push Simulation Lab** to `/design-preview`.
