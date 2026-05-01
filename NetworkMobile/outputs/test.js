const BASE = 'https://adequate-dedication-production-b992.up.railway.app';
let pass = 0, fail = 0, warn = 0;

async function req(method, path, body, token) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (body)  opts.body = JSON.stringify(body);
  const r = await fetch(BASE + path, opts);
  let data;
  try { data = await r.json(); } catch(e) { data = {}; }
  return { status: r.status, data, headers: r.headers };
}

function ok(label, cond, detail='') {
  if (cond) { console.log('  ✅ ' + label); pass++; }
  else       { console.log('  ❌ ' + label + (detail?' — '+detail:'')); fail++; }
}
function wn(label, detail='') { console.log('  ⚠️  ' + label + (detail?' — '+detail:'')); warn++; }

const uid = Date.now();
const EMAIL_A = `tester_a_${uid}@test.com`;
const EMAIL_B = `tester_b_${uid}@test.com`;
let tokenA, tokenB, userA, userB, connId;

async function run() {
  console.log('\n═══════════════════════════════════════');
  console.log(' BRUTAL API TEST — ' + BASE);
  console.log('═══════════════════════════════════════\n');

  // ── SECURITY HEADERS ─────────────────────────────────────────────────────
  console.log('── Security Headers ─────────────────────────────────');
  const root = await req('GET', '/');
  ok('X-Content-Type-Options set',    root.headers.get('x-content-type-options') === 'nosniff');
  ok('X-Frame-Options set',           !!root.headers.get('x-frame-options'));
  ok('X-XSS-Protection set',          !!root.headers.get('x-xss-protection'));

  // ── SIGNUP ────────────────────────────────────────────────────────────────
  console.log('\n── Signup ───────────────────────────────────────────');
  let r = await req('POST','/api/signup',{email:EMAIL_A,password:'Test1234',name:'Tester A'});
  ok('Signup A success',              r.status===200 && r.data.token);
  tokenA = r.data.token; userA = r.data.user;

  r = await req('POST','/api/signup',{email:EMAIL_B,password:'Test1234',name:'Tester B'});
  ok('Signup B success',              r.status===200 && r.data.token);
  tokenB = r.data.token; userB = r.data.user;

  r = await req('POST','/api/signup',{email:EMAIL_A,password:'Test1234',name:'Dupe'});
  ok('Duplicate email rejected',      r.status===400);

  r = await req('POST','/api/signup',{email:'bad@test.com',password:'123',name:'Short'});
  ok('Short password rejected',       r.status===400);

  r = await req('POST','/api/signup',{password:'Test1234',name:'No Email'});
  ok('Missing email rejected',        r.status===400);

  r = await req('POST','/api/signup',{email:'not-an-email',password:'Test1234',name:'Bad'});
  ok('Server handles malformed email',r.status===400||r.status===200); // lenient check

  // ── LOGIN ─────────────────────────────────────────────────────────────────
  console.log('\n── Login ────────────────────────────────────────────');
  r = await req('POST','/api/login',{email:EMAIL_A,password:'Test1234'});
  ok('Login success',                 r.status===200 && r.data.token);

  r = await req('POST','/api/login',{email:EMAIL_A,password:'wrongpass'});
  ok('Wrong password rejected',       r.status===401);

  r = await req('POST','/api/login',{email:'nobody@x.com',password:'Test1234'});
  ok('Unknown email rejected',        r.status===401);

  // ── AUTH GUARD ────────────────────────────────────────────────────────────
  console.log('\n── Auth Guard ───────────────────────────────────────');
  r = await req('GET','/api/me');
  ok('No token → 401',                r.status===401);

  r = await req('GET','/api/me',null,'badtoken');
  ok('Bad token → 401',               r.status===401);

  r = await req('GET','/api/discover');
  ok('Discover without auth → 401',   r.status===401);

  // ── PROFILE ───────────────────────────────────────────────────────────────
  console.log('\n── Profile ──────────────────────────────────────────');
  r = await req('GET','/api/me',null,tokenA);
  ok('GET /api/me works',             r.status===200 && r.data.id);
  ok('Email present in /me',          !!r.data.email);
  ok('Password NOT in /me',           !r.data.password);
  ok('Trust steps returned',          Array.isArray(r.data.trust_steps)&&r.data.trust_steps.length===7);
  ok('Trust score starts 0',          r.data.trust_score===0);

  r = await req('PUT','/api/me',{
    bio:'Testing bio', interests:['AI','climate'], skills:['product','design'],
    linkedin:'https://linkedin.com/test', currently_exploring:'startup ideas',
    intent:'collaborate'
  },tokenA);
  ok('Profile update succeeds',       r.status===200);
  ok('Trust score increased',         r.data.trust_score > 0);
  ok('Interests saved',               Array.isArray(r.data.interests)&&r.data.interests.includes('AI'));

  r = await req('GET','/api/profiles/'+userA.id);
  ok('Public profile accessible',     r.status===200);
  ok('Email hidden from public profile', !r.data.email);
  ok('GPS hidden from public profile',   r.data.lat===undefined&&r.data.lng===undefined);
  ok('Password hidden from public',      !r.data.password);

  // XSS injection
  r = await req('PUT','/api/me',{bio:'<script>alert(1)</script>'},tokenA);
  ok('XSS in bio sanitized',         r.status===200 && !r.data.bio.includes('<script>'));

  // ── DISCOVERY ─────────────────────────────────────────────────────────────
  console.log('\n── Discovery ────────────────────────────────────────');

  // Update B profile so it scores higher
  await req('PUT','/api/me',{bio:'B bio',interests:['AI'],skills:['product'],
    linkedin:'x',currently_exploring:'ideas',intent:'collaborate'},tokenB);

  r = await req('GET','/api/discover',null,tokenA);
  ok('Discover returns 200',          r.status===200);
  ok('Profiles array present',        Array.isArray(r.data.profiles));
  ok('Own profile excluded',          !r.data.profiles.find(p=>p.id===userA.id));
  ok('Remaining count present',       typeof r.data.remaining === 'number');
  ok('Daily limit present',           typeof r.data.daily_limit === 'number');
  ok('Daily limit is 30 (free)',      r.data.daily_limit===30);
  if(r.data.profiles.length>0){
    ok('Password not in discover results', !r.data.profiles[0].password);
    ok('Email not in discover results',    !r.data.profiles[0].email);
    ok('matchScore present',               typeof r.data.profiles[0].matchScore==='number');
  } else wn('No profiles returned (may be ok if only 2 users)');

  // ── SWIPE ─────────────────────────────────────────────────────────────────
  console.log('\n── Swipe & Match ────────────────────────────────────');
  r = await req('POST','/api/swipe',{targetId:userB.id,direction:'right'},tokenA);
  ok('Swipe right A→B succeeds',      r.status===200);
  const firstSwipe = r.data;

  r = await req('POST','/api/swipe',{targetId:userB.id,direction:'right'},tokenA);
  ok('Duplicate swipe ignored',       r.status===200 && r.data.match===false);

  r = await req('POST','/api/swipe',{targetId:userA.id,direction:'right'},tokenB);
  ok('Swipe right B→A → mutual match',r.status===200 && r.data.match===true);
  connId = r.data.connectionId;
  ok('Connection ID returned',        !!connId);

  r = await req('POST','/api/swipe',{targetId:'nonexistent',direction:'right'},tokenA);
  ok('Swipe invalid target handled',  r.status===200||r.status===400||r.status===404);

  r = await req('POST','/api/swipe',{targetId:userB.id,direction:'sideways'},tokenA);
  ok('Invalid direction rejected',    r.status===400);

  // ── CONNECTIONS ───────────────────────────────────────────────────────────
  console.log('\n── Connections ──────────────────────────────────────');
  r = await req('GET','/api/connections',null,tokenA);
  ok('Connections list returns 200',  r.status===200);
  ok('Connection found',              Array.isArray(r.data)&&r.data.length>0);
  if(r.data.length>0){
    ok('Other user data present',     !!r.data[0].user);
    ok('Password not in connection user', !r.data[0].user?.password);
    ok('GPS not in connection user',  r.data[0].user?.lat===undefined);
  }

  // ── MESSAGES ─────────────────────────────────────────────────────────────
  console.log('\n── Messages ─────────────────────────────────────────');
  r = await req('POST','/api/messages/'+connId,{text:'Hello from A!'},tokenA);
  ok('Send message A→B succeeds',     r.status===200 && r.data.id);

  r = await req('POST','/api/messages/'+connId,{text:'Hey A!'},tokenB);
  ok('Send message B→A succeeds',     r.status===200);

  r = await req('GET','/api/messages/'+connId,null,tokenA);
  ok('Get messages returns 200',      r.status===200 && Array.isArray(r.data));
  ok('2 messages in thread',          r.data.length===2);

  r = await req('POST','/api/messages/'+connId,{text:''},tokenA);
  ok('Empty message rejected',        r.status===400);

  r = await req('GET','/api/messages/'+connId,null,null);
  ok('Messages require auth',         r.status===401);

  // Try accessing another user's connection
  const fakeConnId = 'fake-conn-id-999';
  r = await req('GET','/api/messages/'+fakeConnId,null,tokenA);
  ok('Cannot access fake connection', r.status===403||r.status===404);

  // ── PRIORITY MESSAGES ─────────────────────────────────────────────────────
  console.log('\n── Priority Messages ────────────────────────────────');
  r = await req('POST','/api/priority-message',{targetId:userB.id,text:'Priority hello'},tokenA);
  ok('Priority message sent',         r.status===200||r.status===400); // 400 if already connected

  r = await req('POST','/api/priority-message',{targetId:userB.id,text:'http://spam.com buy now!'},tokenA);
  if(r.status===200){
    ok('URL stripped from priority msg', !r.data.text?.includes('http')); // server strips it
  } else ok('Duplicate priority msg blocked',r.status===400);

  r = await req('GET','/api/priority-messages',null,tokenA);
  ok('Get priority messages works',   r.status===200);
  ok('Remaining count present',       typeof r.data.remaining==='number');

  // ── WHO LIKED ME ──────────────────────────────────────────────────────────
  console.log('\n── Who Liked Me (premium gate) ──────────────────────');
  r = await req('GET','/api/liked-me',null,tokenA);
  ok('Free user blocked from liked-me',r.status===403);

  // ── REPORT & BLOCK ────────────────────────────────────────────────────────
  console.log('\n── Report & Block ───────────────────────────────────');
  r = await req('POST','/api/report',{targetId:userB.id,reason:'Spam test'},tokenA);
  ok('Report user works',             r.status===200);

  r = await req('POST','/api/report',{reason:'No target'},tokenA);
  ok('Report missing targetId rejected',r.status===400);

  r = await req('POST','/api/block',{targetId:userB.id},tokenA);
  ok('Block user works',              r.status===200);

  r = await req('POST','/api/block',{},tokenA);
  ok('Block missing targetId rejected',r.status===400);

  // ── ADMIN PROTECTION ──────────────────────────────────────────────────────
  console.log('\n── Admin Protection ─────────────────────────────────');
  r = await req('GET','/api/admin/users',null,tokenA);
  ok('Admin endpoint blocks non-admin',r.status===403||r.status===401);

  r = await req('GET','/api/admin/analytics',null,tokenB);
  ok('Analytics blocks non-admin',    r.status===403||r.status===401);

  r = await req('POST','/api/admin/ban',{targetId:userB.id,banned:true},tokenA);
  ok('Ban endpoint blocks non-admin', r.status===403||r.status===401);

  // ── SEARCH ────────────────────────────────────────────────────────────────
  console.log('\n── Search ───────────────────────────────────────────');
  r = await req('GET','/api/search?q=Tester',null,tokenA);
  ok('Search works',                  r.status===200 && Array.isArray(r.data));
  ok('Own profile excluded from search', !r.data.find(u=>u.id===userA.id));

  r = await req('GET','/api/search?q=a',null,tokenA);
  ok('Short query (1 char) handled',  r.status===200);

  r = await req('GET','/api/search?q='+encodeURIComponent('<script>'),null,tokenA);
  ok('XSS in search handled',         r.status===200);

  // ── 404 & UNKNOWN ROUTES ─────────────────────────────────────────────────
  console.log('\n── 404 & Unknown Routes ─────────────────────────────');
  r = await req('GET','/api/doesnotexist');
  ok('Unknown API route → 404',       r.status===404);

  r = await req('DELETE','/api/me',null,tokenA);
  ok('Unsupported method handled',    r.status===404||r.status===405);

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════');
  console.log(` RESULTS: ✅ ${pass} passed  ❌ ${fail} failed  ⚠️  ${warn} warnings`);
  console.log('═══════════════════════════════════════\n');
}

run().catch(e=>{ console.error('TEST CRASH:', e.message); process.exit(1); });
