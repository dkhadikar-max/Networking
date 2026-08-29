# BYN PRODUCT DEFINITION

## Product

BuildYourNetwork (BYN) is an intent-based professional networking platform.

BYN is designed around discovering people based on networking intent rather than simply maintaining a conventional professional connection graph.

## Core Product Areas

### Authentication
Users should be able to sign up, log in, log out, maintain a valid session, and access protected areas only when authenticated.

### Onboarding
Users should be able to create a profile, add required information, add profile photographs, define networking intent, complete onboarding, and edit their profile later.

### Discovery
Users should be able to browse profiles, view profile information and photographs, understand networking intent, like/pass/discover profiles, navigate between profiles, and receive appropriate loading, empty, and error states.

### Matches
Users should be able to view matches, open a match, navigate to the relevant profile/conversation, and understand when there are no matches.

### Likes
Users should be able to view relevant likes, understand their like state, navigate to relevant profiles, and handle an empty likes state.

### Community
Users should be able to view community content, navigate within the community, interact with available content, and understand loading, empty, and error states.

### Profile
Users should be able to view and edit their profile, update information, manage photographs, update networking intent, and save changes successfully.

### Mobile
BYN must remain usable at 320px, 375px, 390px, 430px, 768px, 1024px, and 1440px.

## PRODUCT PRIORITY

Highest priority:
1. Authentication
2. Onboarding
3. Discovery
4. Likes
5. Matches
6. Profile
7. Community

Discovery, Likes, and Matches require particularly rigorous functional testing because they represent the core networking loop.

## AUDIT PHILOSOPHY

Distinguish between:
- FUNCTIONAL BUG — behavior fails
- UX ISSUE — behavior works but creates friction/confusion
- VISUAL ISSUE — layout/typography/spacing/alignment/styling problem
- ACCESSIBILITY ISSUE — usability barrier
- TECHNICAL ISSUE — source/runtime/implementation problem
- DESIGN OPINION — subjective recommendation

Never classify a personal design preference as a functional defect.
