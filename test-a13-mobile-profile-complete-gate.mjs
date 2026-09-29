// Regression test for the A13 mobile-completeness gap: NetworkApp's own client-side
// `profileComplete` gate (used to route past onboarding into the main app) does not match the
// server's/web's definition of "complete."
//
//   A13 (server.js) established isProfileComplete(u) = calcProfileScore(u) >= 70 AND >= 1 photo,
//   and stores it as `is_profile_complete` on every login/onboarding/profile-edit response. Web
//   (public/webapp.html:1726) reads only `ME.is_profile_complete` - correct, matches the server.
//
//   NetworkApp/src/context/AuthContext.js and NetworkApp/src/navigation/AppNavigator.js instead
//   compute:
//     profileComplete = user?.is_profile_complete === true ||
//                        (user?.profile_score != null && user.profile_score >= 70)
//   The `||` fallback reintroduces the exact pre-A13 bug: a no-photo user with profile_score>=70
//   has is_profile_complete===false (correctly, per the server) but STILL clears this gate,
//   because the second clause alone is true. NetworkApp lets them past its own onboarding/nav
//   gate; the server then correctly 403s the very first swipe/connect they attempt. Not a
//   security hole (server-side profileGuard is unaffected) - a client-only UX regression.
//
// FIX (this commit): drop the score fallback entirely - `profileComplete: user?.is_profile_complete
// === true`, giving NetworkApp the exact same contract as server + web. This also changes the
// `is_profile_complete === undefined` case (real objects from a live backend never actually hit
// this - the field is always present, see server.js clean()/isProfileComplete - but the crash-proofing
// `?.` implies it's considered possible) from `true` (pre-fix, via the score fallback) to `false`
// (post-fix). That's an intentional, documented choice: fail closed on an unknown/missing value,
// exactly how web already behaves (`if (ME && !ME.is_profile_complete)` treats undefined as
// incomplete too) and how the rest of this audit has consistently chosen to fail closed on
// ambiguous state (e.g. A21b's RPC-missing 503).
//
// How this test works: no Express/Postgres harness is applicable here - this is pure React Native
// client logic, never executed by the server test suite. Instead, the ACTUAL expression is
// extracted verbatim from the two real source files via regex (so this proves the shipped code,
// not a hand-copied reimplementation that could drift) and evaluated as a real JS function against
// each case. A separate source-level check asserts neither file mentions `profile_score` at all
// after the fix (the only legitimate reference either file ever had was this fallback).
//
// Standalone script (repo convention); exit code = number of failed checks.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const AUTH_CONTEXT   = path.join(here, 'NetworkApp', 'src', 'context', 'AuthContext.js');
const APP_NAVIGATOR  = path.join(here, 'NetworkApp', 'src', 'navigation', 'AppNavigator.js');

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}  ${String(detail ?? '').slice(0, 300)}`); }
}

// Extracts the `profileComplete` expression verbatim from AuthContext.js (an object-literal
// property: `profileComplete: <expr>,` followed by a newline - true both pre-fix, where <expr>
// spans two lines, and post-fix, where it's one line).
function extractFromAuthContext(src) {
  const m = src.match(/profileComplete:\s*([\s\S]*?),\n/);
  if (!m) throw new Error('AuthContext.js: could not find `profileComplete:` property');
  return m[1];
}

// Extracts the `profileComplete` expression verbatim from AppNavigator.js (a statement:
// `const profileComplete = <expr>;` - true both pre- and post-fix).
function extractFromAppNavigator(src) {
  const m = src.match(/const profileComplete =\s*([\s\S]*?);/);
  if (!m) throw new Error('AppNavigator.js: could not find `const profileComplete =`');
  return m[1];
}

function toFn(expr) {
  // eslint-disable-next-line no-new-func
  return new Function('user', `return (${expr});`);
}

const cases = [
  // [label, user, expected]
  ['is_profile_complete=false, profile_score=70 (no-photo, score-complete) -> must be incomplete',
    { is_profile_complete: false, profile_score: 70 }, false],
  ['is_profile_complete=false, profile_score=100 (no-photo, max score) -> must be incomplete',
    { is_profile_complete: false, profile_score: 100 }, false],
  ['is_profile_complete=false, profile_score=null -> incomplete',
    { is_profile_complete: false, profile_score: null }, false],
  ['is_profile_complete=true, profile_score=60 (below 70, but server says complete) -> complete',
    { is_profile_complete: true, profile_score: 60 }, true],
  ['is_profile_complete=true, profile_score=null -> complete',
    { is_profile_complete: true, profile_score: null }, true],
  ['is_profile_complete=undefined, profile_score=70 -> fail closed: incomplete (documented above)',
    { profile_score: 70 }, false],
];

function runSuite(name, fn) {
  console.log(`\n--- ${name} ---`);
  for (const [label, user, expected] of cases) {
    let actual;
    try { actual = fn(user); } catch (e) { check(label, false, `threw: ${e.message}`); continue; }
    check(label, actual === expected, `got ${actual}, want ${expected}, user=${JSON.stringify(user)}`);
  }
}

const authSrc = fs.readFileSync(AUTH_CONTEXT, 'utf8');
const navSrc  = fs.readFileSync(APP_NAVIGATOR, 'utf8');

runSuite('AuthContext.js profileComplete', toFn(extractFromAuthContext(authSrc)));
runSuite('AppNavigator.js profileComplete', toFn(extractFromAppNavigator(navSrc)));

console.log('\n--- source-level: no leftover profile_score fallback ---');
check('AuthContext.js no longer mentions profile_score anywhere',
  !authSrc.includes('profile_score'), 'still present in AuthContext.js');
check('AppNavigator.js no longer mentions profile_score anywhere',
  !navSrc.includes('profile_score'), 'still present in AppNavigator.js');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
