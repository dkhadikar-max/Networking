import React, { useState, useCallback } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet,
  FlatList, ActivityIndicator, Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../utils/api';
import { C } from '../utils/theme';

function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function Avatar({ photos, name, size = 60 }) {
  const photo = (photos || [])[0];
  if (photo) return <Image source={{ uri: photo }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={[av.fallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[av.init, { fontSize: size * 0.35 }]}>{initials(name)}</Text>
    </View>
  );
}
const av = StyleSheet.create({
  fallback: { backgroundColor: C.sur2, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border },
  init:     { color: C.gold },
});

// ── LOCKED STATE (free users) ─────────────────────────────────────────────────
function LockedView({ count, previews }) {
  return (
    <View style={s.lockedWrap}>
      <Text style={s.lockedIcon}>♡</Text>
      <Text style={s.lockedTitle}>{count} {count === 1 ? 'person' : 'people'} liked you</Text>
      <Text style={s.lockedSub}>Upgrade to Premium to see who they are and swipe back</Text>

      {/* Blurred preview thumbnails */}
      <View style={s.blurRow}>
        {(previews || []).slice(0, 4).map((p, i) => (
          <View key={i} style={s.blurCard}>
            {(p.photos || [])[0]
              ? <Image source={{ uri: p.photos[0] }} style={s.blurImg} blurRadius={18} />
              : <View style={[s.blurImg, { backgroundColor: C.sur2 }]} />
            }
          </View>
        ))}
      </View>

      <TouchableOpacity style={s.upgradeBtn}>
        <Text style={s.upgradeBtnTxt}>✦  Unlock with Premium</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── PROFILE CARD ──────────────────────────────────────────────────────────────
function LikeCard({ profile, onConnect, onSkip }) {
  const photo = (profile.photos || [])[0];
  return (
    <View style={s.card}>
      <View style={s.cardLeft}>
        <View style={s.avatarWrap}>
          <Avatar photos={profile.photos} name={profile.name} size={58} />
          {profile.verification?.status === 'verified' && (
            <View style={s.verifiedDot}>
              <Text style={{ color: '#fff', fontSize: 8 }}>✓</Text>
            </View>
          )}
        </View>
      </View>

      <View style={s.cardMid}>
        <Text style={s.name} numberOfLines={1}>{profile.name || '—'}</Text>
        {profile.location
          ? <Text style={s.loc} numberOfLines={1}>📍 {profile.location}</Text>
          : null}
        {profile.intent
          ? <View style={s.intentBadge}>
              <Text style={s.intentTxt} numberOfLines={1}>{profile.intent.replace(/-/g, ' ')}</Text>
            </View>
          : null}
        {(profile.skills || []).length > 0 && (
          <Text style={s.skills} numberOfLines={1}>{(profile.skills || []).slice(0, 3).join(' · ')}</Text>
        )}
      </View>

      <View style={s.cardRight}>
        {profile.matchScore ? (
          <View style={s.scoreBox}>
            <Text style={s.scorePct}>{profile.matchScore}</Text>
            <Text style={s.scoreLbl}>match</Text>
          </View>
        ) : null}
        <View style={s.actions}>
          <TouchableOpacity style={s.skipBtn} onPress={onSkip}>
            <Text style={s.skipTxt}>✕</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.connectBtn} onPress={onConnect}>
            <Text style={s.connectTxt}>♡</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ── MATCH MODAL ───────────────────────────────────────────────────────────────
function MatchModal({ profile, onClose, onChat }) {
  if (!profile) return null;
  return (
    <Modal transparent animationType="fade" visible={!!profile} onRequestClose={onClose}>
      <View style={mm.overlay}>
        <View style={mm.card}>
          <Text style={mm.star}>✦</Text>
          <Text style={mm.label}>IT'S A MATCH</Text>
          <Avatar photos={profile.photos} name={profile.name} size={90} />
          <Text style={mm.name}>{profile.name}</Text>
          {profile.matchScore ? <Text style={mm.score}>{profile.matchScore}% compatibility</Text> : null}
          <Text style={mm.sub}>You both connected! Send the first message within 48 hours.</Text>
          <View style={mm.btnRow}>
            <TouchableOpacity style={mm.secondary} onPress={onClose}>
              <Text style={mm.secondaryTxt}>Keep browsing</Text>
            </TouchableOpacity>
            <TouchableOpacity style={mm.primary} onPress={onChat}>
              <Text style={mm.primaryTxt}>Say hello →</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── MAIN SCREEN ───────────────────────────────────────────────────────────────
export default function LikesScreen({ navigation }) {
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [matched,  setMatched]  = useState(null);
  const [skipped,  setSkipped]  = useState(new Set());

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    setLoading(true);
    try {
      const { data: res } = await api.get('/api/liked-me');
      setData(res);
    } catch (e) {
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect(profile) {
    try {
      const { data: res } = await api.post('/api/swipe', { targetId: profile.id, direction: 'right' });
      setSkipped(prev => new Set([...prev, profile.id]));
      if (res.match) setMatched(profile);
    } catch {}
  }

  function handleSkip(profile) {
    api.post('/api/swipe', { targetId: profile.id, direction: 'left' }).catch(() => {});
    setSkipped(prev => new Set([...prev, profile.id]));
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={C.gold} size="large" /></View>;
  }

  if (!data) {
    return (
      <View style={s.center}>
        <Text style={s.emptyIcon}>♡</Text>
        <Text style={s.emptyTitle}>Check back soon</Text>
        <Text style={s.emptySub}>People who like your profile will appear here.</Text>
      </View>
    );
  }

  // Free user — locked view
  if (data.premium_required) {
    return (
      <View style={s.screen}>
        <View style={s.header}>
          <Text style={s.screenTitle}>Likes</Text>
          <View style={s.countBadge}><Text style={s.countTxt}>{data.count}</Text></View>
        </View>
        <LockedView count={data.count} previews={data.previews} />
        <MatchModal profile={matched} onClose={() => setMatched(null)} onChat={() => { setMatched(null); navigation.navigate('Connections'); }} />
      </View>
    );
  }

  const visible = (data.profiles || []).filter(p => !skipped.has(p.id));

  if (!visible.length) {
    return (
      <View style={s.screen}>
        <View style={s.header}>
          <Text style={s.screenTitle}>Likes</Text>
        </View>
        <View style={s.center}>
          <Text style={s.emptyIcon}>♡</Text>
          <Text style={s.emptyTitle}>You're all caught up</Text>
          <Text style={s.emptySub}>No new likes right now. Keep discovering!</Text>
          <TouchableOpacity style={s.refreshBtn} onPress={load}>
            <Text style={s.refreshTxt}>Refresh</Text>
          </TouchableOpacity>
        </View>
        <MatchModal profile={matched} onClose={() => setMatched(null)} onChat={() => { setMatched(null); navigation.navigate('Connections'); }} />
      </View>
    );
  }

  return (
    <View style={s.screen}>
      <View style={s.header}>
        <Text style={s.screenTitle}>Likes</Text>
        {visible.length > 0 && (
          <View style={s.countBadge}><Text style={s.countTxt}>{visible.length}</Text></View>
        )}
      </View>
      <Text style={s.headerSub}>These people liked your profile — connect back to match</Text>

      <FlatList
        data={visible}
        keyExtractor={p => p.id}
        renderItem={({ item }) => (
          <LikeCard
            profile={item}
            onConnect={() => handleConnect(item)}
            onSkip={() => handleSkip(item)}
          />
        )}
        contentContainerStyle={{ padding: 16, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      />

      <MatchModal
        profile={matched}
        onClose={() => setMatched(null)}
        onChat={() => { setMatched(null); navigation.navigate('Connections'); }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen:       { flex: 1, backgroundColor: C.bg },
  center:       { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  header:       { flexDirection: 'row', alignItems: 'center', padding: 20, paddingTop: 18, paddingBottom: 4, gap: 10 },
  screenTitle:  { fontSize: 22, color: C.text },
  headerSub:    { fontSize: 13, color: C.sub, paddingHorizontal: 20, marginBottom: 8 },
  countBadge:   { backgroundColor: C.gold, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 2 },
  countTxt:     { color: C.bg, fontSize: 12 },

  // Card
  card:         { flexDirection: 'row', backgroundColor: C.sur, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  cardLeft:     { marginRight: 14 },
  avatarWrap:   { position: 'relative' },
  verifiedDot:  { position: 'absolute', bottom: 0, right: 0, width: 18, height: 18, borderRadius: 9, backgroundColor: '#22c55e', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: C.sur },
  cardMid:      { flex: 1, gap: 4 },
  name:         { fontSize: 16, color: C.text },
  loc:          { fontSize: 12, color: C.sub },
  intentBadge:  { backgroundColor: C.sur2, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start', borderWidth: 1, borderColor: C.border2 },
  intentTxt:    { fontSize: 11, color: C.sub },
  skills:       { fontSize: 12, color: C.dim },
  cardRight:    { alignItems: 'center', gap: 8, marginLeft: 8 },
  scoreBox:     { backgroundColor: C.goldBg, borderRadius: 8, padding: 6, alignItems: 'center', borderWidth: 1, borderColor: C.goldMid },
  scorePct:     { fontSize: 18, color: C.gold },
  scoreLbl:     { fontSize: 9, color: C.sub },
  actions:      { flexDirection: 'row', gap: 8 },
  skipBtn:      { width: 36, height: 36, borderRadius: 18, backgroundColor: C.sur2, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border2 },
  skipTxt:      { color: C.sub, fontSize: 14 },
  connectBtn:   { width: 36, height: 36, borderRadius: 18, backgroundColor: C.gold, justifyContent: 'center', alignItems: 'center' },
  connectTxt:   { color: C.bg, fontSize: 16 },

  // Empty states
  emptyIcon:    { fontSize: 48, color: C.dim, marginBottom: 16 },
  emptyTitle:   { fontSize: 18, color: C.text, marginBottom: 8 },
  emptySub:     { fontSize: 13, color: C.sub, textAlign: 'center', lineHeight: 20 },
  refreshBtn:   { marginTop: 24, padding: 12, borderWidth: 1, borderColor: C.gold, borderRadius: 10, paddingHorizontal: 28 },
  refreshTxt:   { color: C.gold, fontSize: 14 },

  // Locked
  lockedWrap:   { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  lockedIcon:   { fontSize: 52, color: C.gold, marginBottom: 16 },
  lockedTitle:  { fontSize: 22, color: C.text, marginBottom: 8, textAlign: 'center' },
  lockedSub:    { fontSize: 14, color: C.sub, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  blurRow:      { flexDirection: 'row', gap: 10, marginBottom: 32 },
  blurCard:     { borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  blurImg:      { width: 70, height: 90 },
  upgradeBtn:   { backgroundColor: C.gold, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 14 },
  upgradeBtnTxt:{ color: C.bg, fontSize: 15 },
});

// ── Match Modal Styles ────────────────────────────────────────────────────────
const mm = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card:       { backgroundColor: C.sur, borderRadius: 20, padding: 28, alignItems: 'center', width: '100%', maxWidth: 360, borderWidth: 1, borderColor: C.border },
  star:       { fontSize: 32, color: C.gold, marginBottom: 8 },
  label:      { fontSize: 11, color: C.sub, letterSpacing: 3, marginBottom: 20 },
  name:       { fontSize: 22, color: C.text, marginTop: 14, marginBottom: 4 },
  score:      { fontSize: 13, color: C.gold, marginBottom: 14 },
  sub:        { fontSize: 13, color: C.sub, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  btnRow:     { flexDirection: 'row', gap: 12, width: '100%' },
  primary:    { flex: 1, backgroundColor: C.gold, borderRadius: 12, padding: 14, alignItems: 'center' },
  primaryTxt: { color: C.bg, fontSize: 14 },
  secondary:  { flex: 1, backgroundColor: C.sur2, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: C.border2 },
  secondaryTxt:{ color: C.sub, fontSize: 14 },
});
