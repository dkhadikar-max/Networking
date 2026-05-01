// ============================================================
// NETWORKING PLATFORM — SUPABASE CLIENT API
// npm install @supabase/supabase-js
// ============================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;       // e.g. https://xxxx.supabase.co
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // server-side only

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// Service client bypasses RLS — use only in trusted backend code
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ============================================================
// HELPERS
// ============================================================

const CLEAN_COLS = 'id,name,bio,working_on,currently_exploring,intent,interests,skills,photos,linkedin,instagram,website,location_label,trust_score,is_verified,is_premium,created_at';

/** Strip sensitive fields — always use this for public-facing responses */
function cleanPublic(user) {
  if (!user) return null;
  const { email, lat, lng, is_banned, swipes_today, priority_msgs_this_month, ...safe } = user;
  return safe;
}

// ============================================================
// AUTH — SIGNUP / LOGIN / LOGOUT
// ============================================================

/**
 * Signup: creates auth user + profile row
 */
export async function signup({ email, password, name, intent }) {
  // 1. Create auth user
  const { data: authData, error: authErr } = await supabase.auth.signUp({ email, password });
  if (authErr) throw authErr;

  const uid = authData.user.id;

  // 2. Insert profile (trigger auto-computes trust_score)
  const { error: profileErr } = await supabase
    .from('users')
    .insert({ id: uid, name, intent });
  if (profileErr) throw profileErr;

  return authData.session;
}

/**
 * Login: returns session with access_token + refresh_token
 */
export async function login({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

/**
 * Logout
 */
export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Get current session user
 */
export async function getMe() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();
  if (error) throw error;
  return data;
}

// ============================================================
// PROFILE — READ / UPDATE
// ============================================================

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('users')
    .select(CLEAN_COLS)
    .eq('id', userId)
    .eq('is_banned', false)
    .single();
  if (error) throw error;
  return data;
}

export async function updateProfile(updates) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Round GPS to 2dp for privacy
  if (updates.lat != null) updates.lat = Math.round(updates.lat * 100) / 100;
  if (updates.lng != null) updates.lng = Math.round(updates.lng * 100) / 100;

  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', user.id)
    .select(CLEAN_COLS)
    .single();
  if (error) throw error;
  return data;
}

// ============================================================
// PHOTOS — UPLOAD / DELETE
// ============================================================

/**
 * Upload a profile photo. Returns the public URL.
 */
export async function uploadProfilePhoto(file) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const ext = file.name.split('.').pop();
  const path = `${user.id}/${Date.now()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from('profile_photos')
    .upload(path, file, { upsert: false, contentType: file.type });
  if (upErr) throw upErr;

  const { data } = supabase.storage.from('profile_photos').getPublicUrl(path);
  const publicUrl = data.publicUrl;

  // Append to photos array (max 10 stored)
  const me = await getMe();
  const photos = [...(me.photos || []), publicUrl].slice(0, 10);
  await updateProfile({ photos });

  return publicUrl;
}

/**
 * Remove a profile photo URL from the user's photos array
 */
export async function removeProfilePhoto(url) {
  const me = await getMe();
  const photos = (me.photos || []).filter(p => p !== url);
  await updateProfile({ photos });

  // Extract path from URL and delete from storage
  const path = url.split('/profile_photos/')[1];
  if (path) {
    await supabase.storage.from('profile_photos').remove([path]);
  }
}

// ============================================================
// VERIFICATION VIDEO — UPLOAD
// ============================================================

export async function uploadVerificationVideo(file) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const path = `${user.id}/verify_${Date.now()}.mp4`;

  const { error } = await supabase.storage
    .from('verification_videos')
    .upload(path, file, { upsert: true, contentType: 'video/mp4' });
  if (error) throw error;

  // Create verification record
  const { data, error: vErr } = await supabase
    .from('verifications')
    .insert({ user_id: user.id, video_url: path, status: 'pending' })
    .select()
    .single();
  if (vErr) throw vErr;

  return data;
}

/** Get signed URL for a verification video (admin use) */
export async function getVerificationVideoUrl(path) {
  const { data, error } = await supabaseAdmin.storage
    .from('verification_videos')
    .createSignedUrl(path, 3600); // 1 hour
  if (error) throw error;
  return data.signedUrl;
}

// ============================================================
// PORTFOLIO / WORK
// ============================================================

export async function addWork({ title, description, url, imageFile }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  let image_url = null;
  if (imageFile) {
    const path = `${user.id}/${Date.now()}_${imageFile.name}`;
    await supabase.storage.from('portfolio_media').upload(path, imageFile);
    const { data } = supabase.storage.from('portfolio_media').getPublicUrl(path);
    image_url = data.publicUrl;
  }

  const { data, error } = await supabase
    .from('works')
    .insert({ user_id: user.id, title, description, url, image_url })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getWorks(userId) {
  const { data, error } = await supabase
    .from('works')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// ============================================================
// DISCOVER — FETCH + SCORE CANDIDATES
// ============================================================

const INTENT_COMPAT = {
  hiring:       ['job_seeking','collaboration'],
  job_seeking:  ['hiring','collaboration'],
  co_founder:   ['co_founder','investing'],
  collaboration:['collaboration','hiring','job_seeking'],
  networking:   ['networking','collaboration'],
  learning:     ['mentoring','learning'],
  mentoring:    ['learning','networking'],
  investing:    ['co_founder','networking'],
};

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function matchScore(me, other) {
  let interest = 0, intent = 0, context = 0, location = 0;

  // Interest overlap — 35%
  const myInt = new Set(me.interests || []);
  const shared = (other.interests || []).filter(i => myInt.has(i)).length;
  interest = Math.min(shared / Math.max(myInt.size, 1), 1) * 35;

  // Intent compatibility — 25%
  const compat = INTENT_COMPAT[me.intent] || [];
  if (other.intent === me.intent) intent = 15;
  else if (compat.includes(other.intent)) intent = 25;

  // Context (skills overlap) — 20%
  const mySkills = new Set(me.skills || []);
  const sharedSkills = (other.skills || []).filter(s => mySkills.has(s)).length;
  context = Math.min(sharedSkills / Math.max(mySkills.size, 1), 1) * 20;

  // Location proximity — 20%
  if (me.lat && me.lng && other.lat && other.lng) {
    const km = haversine(me.lat, me.lng, other.lat, other.lng);
    location = km < 5   ? 20
             : km < 20  ? 15
             : km < 50  ? 10
             : km < 100 ? 5
             : 0;
  }

  return Math.round(interest + intent + context + location);
}

/**
 * Discover profiles — fetches unseen, non-blocked, non-banned users
 * and scores them client-side (or move scoring to a Postgres function for scale)
 */
export async function discover({ limit = 30 } = {}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const me = await getMe();

  // IDs already swiped
  const { data: swipedRows } = await supabase
    .from('swipes')
    .select('target_id')
    .eq('swiper_id', user.id);
  const swipedIds = (swipedRows || []).map(r => r.target_id);

  // IDs blocked/blocking
  const { data: blockRows } = await supabase
    .from('blocks')
    .select('blocked_id, blocker_id')
    .or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`);
  const blockedIds = (blockRows || []).flatMap(r => [r.blocked_id, r.blocker_id])
    .filter(id => id !== user.id);

  const excludeIds = [...new Set([user.id, ...swipedIds, ...blockedIds])];

  const { data: candidates, error } = await supabase
    .from('users')
    .select(CLEAN_COLS + ',lat,lng')
    .eq('is_banned', false)
    .not('id', 'in', `(${excludeIds.join(',')})`)
    .limit(200); // over-fetch then sort by score
  if (error) throw error;

  const scored = (candidates || [])
    .map(u => ({ ...cleanPublic(u), match_score: matchScore(me, u) }))
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, limit);

  return scored;
}

// ============================================================
// SWIPE
// ============================================================

export async function swipe(targetId, direction) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const me = await getMe();

  // Enforce daily swipe limit
  const today = new Date().toISOString().slice(0, 10);
  const limit = me.is_premium ? 200 : 30;

  if (me.swipes_reset_at !== today) {
    await supabase.from('users').update({ swipes_today: 0, swipes_reset_at: today }).eq('id', user.id);
    me.swipes_today = 0;
  }

  if (me.swipes_today >= limit) throw new Error('Daily swipe limit reached');

  // Insert swipe
  const { error: swipeErr } = await supabase
    .from('swipes')
    .insert({ swiper_id: user.id, target_id: targetId, direction })
    .select()
    .single();
  if (swipeErr) throw swipeErr;

  // Increment counter
  await supabase.from('users')
    .update({ swipes_today: me.swipes_today + 1 })
    .eq('id', user.id);

  // If liked, also insert into likes
  let matched = false;
  if (direction === 'like') {
    await supabase.from('likes').insert({ liker_id: user.id, target_id: targetId }).select().single()
      .catch(() => {}); // ignore duplicate

    // Check if target already liked me
    const { data: theirSwipe } = await supabase
      .from('swipes')
      .select('id')
      .eq('swiper_id', targetId)
      .eq('target_id', user.id)
      .eq('direction', 'like')
      .single();

    if (theirSwipe) {
      // Mutual like → create match (canonical order)
      const [a, b] = [user.id, targetId].sort();
      await supabase.from('matches')
        .insert({ user_a: a, user_b: b, status: 'pending' })
        .select()
        .single()
        .catch(() => {}); // ignore if already exists
      matched = true;
    }
  }

  return { matched };
}

// ============================================================
// MATCHES & CONNECTIONS
// ============================================================

export async function getMatches() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('matches')
    .select(`
      id, status, expires_at, a_replied, b_replied, created_at,
      user_a_profile:users!matches_user_a_fkey(${CLEAN_COLS}),
      user_b_profile:users!matches_user_b_fkey(${CLEAN_COLS})
    `)
    .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
    .in('status', ['pending','active'])
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data || []).map(m => {
    const other = m.user_a_profile.id === user.id ? m.user_b_profile : m.user_a_profile;
    return { ...m, other_user: cleanPublic(other) };
  });
}

export async function searchConnections(query) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Get my match partner IDs
  const { data: myMatches } = await supabase
    .from('matches')
    .select('user_a, user_b')
    .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
    .in('status', ['pending','active']);

  const partnerIds = (myMatches || []).map(m =>
    m.user_a === user.id ? m.user_b : m.user_a
  );

  if (!partnerIds.length) return [];

  const { data, error } = await supabase
    .from('users')
    .select(CLEAN_COLS)
    .in('id', partnerIds)
    .or(`name.ilike.%${query}%,interests.cs.{${query}}`);
  if (error) throw error;
  return (data || []).map(cleanPublic);
}

// ============================================================
// MESSAGES
// ============================================================

export async function getMessages(matchId) {
  const { data, error } = await supabase
    .from('messages')
    .select('id, sender_id, content, read_at, created_at')
    .eq('match_id', matchId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function sendMessage(matchId, content) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  if (!content || content.trim().length === 0) throw new Error('Empty message');
  if (content.length > 2000) throw new Error('Message too long');

  const { data, error } = await supabase
    .from('messages')
    .insert({ match_id: matchId, sender_id: user.id, content: content.trim() })
    .select()
    .single();
  if (error) throw error;

  // Mark match as active when both sides have replied
  const match = await supabase
    .from('matches')
    .select('user_a, user_b, a_replied, b_replied')
    .eq('id', matchId)
    .single();
  if (match.data) {
    const isA = match.data.user_a === user.id;
    const updates = isA ? { a_replied: true } : { b_replied: true };
    const newA = isA ? true : match.data.a_replied;
    const newB = isA ? match.data.b_replied : true;
    if (newA && newB) updates.status = 'active';
    await supabase.from('matches').update(updates).eq('id', matchId);
  }

  return data;
}

/** Subscribe to real-time messages in a match */
export function subscribeMessages(matchId, callback) {
  return supabase
    .channel(`messages:${matchId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `match_id=eq.${matchId}`,
    }, payload => callback(payload.new))
    .subscribe();
}

// ============================================================
// PRIORITY CONNECT
// ============================================================

export async function sendPriorityMessage(receiverId, content) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const me = await getMe();
  if (!me.is_premium) throw new Error('Premium required for priority messages');

  const month = new Date().toISOString().slice(0, 7) + '-01';
  if (me.priority_reset_at !== month) {
    await supabase.from('users').update({ priority_msgs_this_month: 0, priority_reset_at: month }).eq('id', user.id);
    me.priority_msgs_this_month = 0;
  }
  if (me.priority_msgs_this_month >= 20) throw new Error('Monthly priority message limit reached');

  if (content.length > 500) throw new Error('Priority message too long');

  const { data, error } = await supabase
    .from('priority_messages')
    .insert({ sender_id: user.id, receiver_id: receiverId, content })
    .select()
    .single();
  if (error) throw error;

  await supabase.from('users')
    .update({ priority_msgs_this_month: me.priority_msgs_this_month + 1 })
    .eq('id', user.id);

  return data;
}

// ============================================================
// LIKES — WHO LIKED ME (premium only)
// ============================================================

export async function getWhoLikedMe() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const me = await getMe();
  if (!me.is_premium) throw new Error('Premium required');

  const { data, error } = await supabase
    .from('likes')
    .select(`liker_id, created_at, liker:users!likes_liker_id_fkey(${CLEAN_COLS})`)
    .eq('target_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(r => ({ ...cleanPublic(r.liker), liked_at: r.created_at }));
}

// ============================================================
// REPORT / BLOCK
// ============================================================

export async function reportUser(targetId, reason) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('reports')
    .insert({ reporter_id: user.id, target_id: targetId, reason })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function blockUser(blockedId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('blocks')
    .insert({ blocker_id: user.id, blocked_id: blockedId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function unblockUser(blockedId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', user.id)
    .eq('blocked_id', blockedId);
  if (error) throw error;
}

// ============================================================
// SUBSCRIPTIONS — WEBHOOK (server-side, service role)
// ============================================================

/**
 * Called from your Stripe/Razorpay webhook handler (Node.js server)
 * Verifies signature externally before calling this function
 */
export async function activatePremium({ userId, providerSubId, provider, periodEnd, amountPaise }) {
  // Upsert subscription record
  await supabaseAdmin.from('subscriptions').upsert({
    user_id: userId,
    provider,
    provider_sub_id: providerSubId,
    status: 'active',
    amount_paise: amountPaise,
    current_period_end: periodEnd,
  }, { onConflict: 'provider_sub_id' });

  // Update user premium status
  await supabaseAdmin.from('users').update({
    is_premium: true,
    premium_until: periodEnd,
  }).eq('id', userId);
}

export async function deactivatePremium(userId) {
  await supabaseAdmin.from('users').update({
    is_premium: false,
    premium_until: null,
  }).eq('id', userId);
}

// ============================================================
// ADMIN — SERVICE ROLE ONLY
// ============================================================

export async function adminBanUser(adminId, targetId, reason) {
  await supabaseAdmin.from('users').update({ is_banned: true }).eq('id', targetId);
  await supabaseAdmin.from('audit_log').insert({
    admin_id: adminId, action: 'ban', target_id: targetId, meta: { reason }
  });
}

export async function adminVerifyUser(adminId, userId, verificationId, status, confidence) {
  await supabaseAdmin.from('verifications').update({
    status, confidence_score: confidence, reviewed_at: new Date().toISOString()
  }).eq('id', verificationId);

  if (status === 'verified') {
    await supabaseAdmin.from('users').update({ is_verified: true }).eq('id', userId);
  }

  await supabaseAdmin.from('audit_log').insert({
    admin_id: adminId, action: `verify_${status}`, target_id: userId,
    meta: { verificationId, confidence }
  });
}

export async function adminGetUsers({ page = 0, pageSize = 50, banned = false } = {}) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('is_banned', banned)
    .order('created_at', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1);
  if (error) throw error;
  return data;
}

export async function adminGetReports() {
  const { data, error } = await supabaseAdmin
    .from('reports')
    .select(`
      id, reason, status, created_at,
      reporter:users!reports_reporter_id_fkey(id, name),
      target:users!reports_target_id_fkey(id, name, is_banned)
    `)
    .eq('status', 'open')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}
