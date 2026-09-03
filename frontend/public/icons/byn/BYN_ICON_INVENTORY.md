# BYN Premium Icon Asset Library Inventory

A unified, editorial, high-craft SVG icon library designed specifically for **Build Your Network (BYN)**.

### Design System Rules
- **Grid**: `viewBox="0 0 24 24"`
- **Line Weight**: `stroke-width="1.75"` default
- **Terminals**: `stroke-linecap="round" stroke-linejoin="round"`
- **Color**: `currentColor` (dynamically inherits BYN Mediterranean Teal `#157A6E`, Coral Gold `#F4A259`, Slate text `#0F172A`, or muted `#64748B`)
- **Aesthetic**: Premium professional SaaS, editorial networking, minimal, high-contrast legibility at 14px–28px.
- **Constraints**: 100% vector SVG, zero embedded rasters, zero background rectangles, transparent background.

---

## 1. Core Navigation & App Architecture

| Icon | Current Usage | Asset Filename | Intended Semantic Meaning |
|---|---|---|---|
| **Discover** | `BottomNav`, `DesktopNav`, `Sidebar` | `byn-icon-discover.svg` | Intent radar lens with center focal reticle for member discovery |
| **Discover (Active)** | `BottomNav`, `DesktopNav`, `Sidebar` | `byn-icon-discover-active.svg` | Filled active/selected state for discovery tab |
| **Connections** | `DesktopNav`, `Sidebar`, `likes/page.tsx` | `byn-icon-connections.svg` | Mutual network connection link uniting two professional profiles |
| **Connections (Active)** | `DesktopNav`, `Sidebar`, `likes/page.tsx` | `byn-icon-connections-active.svg` | Filled active/selected state for connections/likes tab |
| **Chat** | `BottomNav`, `DesktopNav`, `Sidebar` | `byn-icon-chat.svg` | Conversational bubble with interior prompt lines for 1-on-1 chats |
| **Chat (Active)** | `BottomNav`, `DesktopNav`, `Sidebar` | `byn-icon-chat-active.svg` | Filled active/selected state for direct message conversations |
| **Circles** | `BottomNav`, `DesktopNav`, `Sidebar` | `byn-icon-circles.svg` | Interconnected 3-node community constellation for public circle streams |
| **Circles (Active)** | `BottomNav`, `DesktopNav`, `Sidebar` | `byn-icon-circles-active.svg` | Filled active/selected state for circles community feed |
| **Profile** | `BottomNav`, `DesktopNav`, `Sidebar` | `byn-icon-profile.svg` | Symmetrically balanced member portrait for personal account/profile |
| **Profile (Active)** | `BottomNav`, `DesktopNav`, `Sidebar` | `byn-icon-profile-active.svg` | Filled active/selected state for user profile view |

---

## 2. Intent-First Decision Architecture & Badges

| Icon | Current Usage | Asset Filename | Intended Semantic Meaning |
|---|---|---|---|
| **Priority** | `⚡` emoji in `SwipeCard`, `ChatWindow`, `ConversationList`, `UpgradePage` | `byn-icon-priority.svg` | Precision angular bolt signal for expedited, high-signal connection requests |
| **Trust Score** | `SwipeCard`, `ProfileView`, `DiscoverySummaryCard` | `byn-icon-trust.svg` | Architectural shield with internal verification spine for member trust scoring |
| **Verified Builder** | 5-point star in cards, shield in drawer, `✓` text | `byn-icon-verified.svg` | 16-facet scalloped verified seal with internal precision checkmark |
| **Intent** | `🎯` emoji in `SwipeCard`, `ProfileDrawer`, `ChatWindow` | `byn-icon-intent.svg` | Concentric optical reticle indicating declared networking intent/goal |
| **Building** | `🚀` emoji in `ProfileDrawer`, `CirclePostCard`, `ComposePost` | `byn-icon-building.svg` | Geometric craft mark representing active founder/builder projects |
| **Looking For** | `🤝` emoji in `CirclePostCard`, `ComposePost` | `byn-icon-looking-for.svg` | Synergistic alliance clasp indicating co-founder/talent partnership search |
| **Match Insight** | `💡 Direct Match` emoji in `SwipeCard`, `✦` in `ProfileDrawer` | `byn-icon-insight.svg` | 4-point editorial diamond spark representing algorithmic alignment reasons |
| **Location** | Inconsistent pin SVGs across cards/drawers, `📍` emoji | `byn-icon-location.svg` | Calibrated architectural map pin for geographic proximity |
| **Skills** | Text pills with no icon or generic briefcase | `byn-icon-skills.svg` | Multi-faceted craft diamond representing verified technical/business skills |
| **Interests** | Text tags with no icon | `byn-icon-interests.svg` | 8-point compass rose representing broad domain and industry interests |

---

## 3. Interactive UI Controls

| Icon | Current Usage | Asset Filename | Intended Semantic Meaning |
|---|---|---|---|
| **Skip** | Text button, `X` in `ProfileDrawer` | `byn-icon-skip.svg` | Clean enclosed diagonal cross for passing on a candidate profile |
| **Connect** | Checkmark polyline on Connect button | `byn-icon-connect.svg` | Enclosed verification check for expressing interest / connecting |
| **Back** | Ad-hoc chevron in headers | `byn-icon-back.svg` | Slender editorial left chevron for screen navigation |
| **Close** | Ad-hoc lines in modals and sheets | `byn-icon-close.svg` | Precision balanced dismissal mark for modals and bottom sheets |
| **Edit** | Ad-hoc pencil in `ProfileView` & `CirclePostCard` | `byn-icon-edit.svg` | 45° drafting stylus for profile and inline post editing |
| **Delete / Trash** | Polyline trash bin in `CirclePostCard` | `byn-icon-trash.svg` | Minimalist lined waste receptacle for deleting posts |
| **Search** | Ad-hoc magnifying glass in conversation search | `byn-icon-search.svg` | Optical search lens with 45° balanced stem |
| **Clear Input** | Unicode `✕` text in search input | `byn-icon-clear.svg` | Enclosed pill cross for clearing search or text inputs |
| **Filters** | `⚡ Filters` emoji button in `DiscoverFeed` | `byn-icon-filters.svg` | Precision horizontal tuning sliders for discovery filtering |
| **Send Message** | Paper plane in `ChatWindow` & `FeedbackWidget` | `byn-icon-send.svg` | Aerodynamic transmit glyph for instant message sending |
| **Attach File** | Plus sign in chat composer | `byn-icon-attach.svg` | Precision paperclip loop for documents and deck attachments |
| **More Options** | 3 circles in chat header | `byn-icon-more.svg` | Optical triple ellipsis for contextual secondary menus |
| **Copy Link** | Text button in referral/share tray | `byn-icon-copy.svg` | Dual overlapping sheets for copying referral links |
| **Sign Out** | Box with exit arrow in desktop sidebar | `byn-icon-signout.svg` | Portal with directional exit vector for account sign out |
| **External Link** | Diagonal arrow in landing page | `byn-icon-external-link.svg` | Frame with top-right departure arrow for external URLs |
| **Feedback** | Bubble in `FeedbackWidget` | `byn-icon-feedback.svg` | Conversational dialog with centered inquiry prompt for feedback |

---

## 4. Notifications, Real-Time & Timers

| Icon | Current Usage | Asset Filename | Intended Semantic Meaning |
|---|---|---|---|
| **Notification Bell** | Outlined bell in `NotificationBell` | `byn-icon-bell.svg` | Contoured acoustic bell for alert and update feeds |
| **Bell (Unread)** | Outlined bell with badge | `byn-icon-bell-unread.svg` | Notification bell with integrated high-intent coral accent pip |
| **Receipt: Delivered** | Raw unicode `✓✓` text in `ChatWindow` | `byn-icon-receipt-delivered.svg` | Dual interlocking checks indicating message delivered to peer |
| **Receipt: Read** | Raw unicode `✓✓` text in `ChatWindow` | `byn-icon-receipt-read.svg` | Teal-accented dual checks indicating conversation partner read message |
| **Timer / Expiry** | `⏳ 18h left` emoji in `ConversationList` | `byn-icon-timer.svg` | Minimalist stopwatch indicating expiring match/intro windows |

---

## 5. Ecosystem & Social Links

| Icon | Current Usage | Asset Filename | Intended Semantic Meaning |
|---|---|---|---|
| **LinkedIn** | Inconsistent logo SVG paths | `byn-icon-social-linkedin.svg` | Clean geometric 'in' letterform on 24x24 grid |
| **Instagram** | Squircle and circle in `ProfileView` | `byn-icon-social-instagram.svg` | Precision camera squircle with lens and flash |
| **X / Twitter** | Simple diagonal cross in onboarding | `byn-icon-social-x.svg` | Clean geometric X vector |
| **WhatsApp** | Phone in speech bubble | `byn-icon-social-whatsapp.svg` | Speech bubble with telephone receiver for WhatsApp sharing |
| **Website / Globe** | Wireframe sphere in profiles | `byn-icon-social-website.svg` | Clean meridian globe for portfolio/company websites |

---

## 6. Empty States & System Feedback

| Icon | Current Usage | Asset Filename | Intended Semantic Meaning |
|---|---|---|---|
| **Empty: Chat** | `💬` emoji in `ConversationList` | `byn-icon-empty-chat.svg` | Quiet dashed conversational outline for zero-messages state |
| **Empty: Search** | `🔍` emoji in `ConversationList` | `byn-icon-empty-search.svg` | Dashed query prism for zero-search-results state |
| **Empty: Discovery** | Search circle in `DiscoverFeed` | `byn-icon-empty-discover.svg` | Swept radar arc for exhausted candidate discovery feed |
| **Action: Photo** | Rectangular card in `DiscoverFeed` | `byn-icon-action-photo.svg` | Framed silhouette prompt indicating profile photo requirement |
| **Empty: Alerts** | Text-only empty state | `byn-icon-empty-notifications.svg` | Quiet dashed bell for clear notification feed |
| **Status: Success** | Checkmark circle in `FeedbackWidget` | `byn-icon-success.svg` | Confirmed circular checkmark seal for completed operations |
| **Status: Alert** | Alert circle in `error.tsx` | `byn-icon-alert.svg` | Minimalist warning circle with centered exclamation indicator |

---

## 7. Monetization & Value Feature Badges (Upgrade Page)

| Icon | Current Usage | Asset Filename | Intended Semantic Meaning |
|---|---|---|---|
| **Feature: Boost** | `⚡` emoji in `upgrade/page.tsx` | `byn-icon-feature-boost.svg` | Enclosed velocity beam for 200 connections/day tier |
| **Feature: Reveal** | `❤️` emoji in `upgrade/page.tsx` | `byn-icon-feature-reveal.svg` | Unmasked visibility optic for inbound likes reveal |
| **Feature: Priority** | `🎯` emoji in `upgrade/page.tsx` | `byn-icon-feature-priority.svg` | Dedicated message envelope for monthly priority allocations |
| **Feature: Spotlight**| `⭐` emoji in `upgrade/page.tsx` | `byn-icon-feature-spotlight.svg` | Editorial crest star for priority profile discovery badge |
| **Feature: Radius** | `📍` emoji in `upgrade/page.tsx` | `byn-icon-feature-radius.svg` | Concentric radar rings for exact geographic radius filter |
