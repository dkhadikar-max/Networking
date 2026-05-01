import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { C } from '../utils/theme';

const INTENTS = [
  { value: 'explore-network',    label: '🌐  Explore Network' },
  { value: 'find-cofounder',     label: '🚀  Find Co-founder' },
  { value: 'find-mentor',        label: '🎓  Find Mentor / Mentee' },
  { value: 'hire',               label: '💼  Hire Talent' },
  { value: 'collaborate',        label: '🤝  Collaborate on Projects' },
  { value: 'find-investors',     label: '💰  Find Investors' },
];

const INTEREST_OPTIONS = [
  'AI / ML', 'Startups', 'SaaS', 'Fintech', 'Design', 'Marketing',
  'Web3', 'Climate Tech', 'Health Tech', 'Edtech', 'Open Source',
  'Product Management', 'Sales', 'VC / Investing', 'No-Code', 'Engineering',
];

function ProgressBar({ score }) {
  const color = score >= 70 ? '#22c55e' : score >= 40 ? C.gold : '#ef4444';
  return (
    <View style={pb.wrap}>
      <View style={pb.track}>
        <View style={[pb.fill, { width: `${score}%`, backgroundColor: color }]} />
      </View>
      <Text style={[pb.label, { color }]}>{score}% — {score >= 70 ? 'Unlocked! 🎉' : `need ${70 - score} more pts`}</Text>
    </View>
  );
}

function CheckRow({ done, label }) {
  return (
    <View style={cr.row}>
      <View style={[cr.dot, done ? cr.dotDone : cr.dotPending]}>
        <Text style={cr.icon}>{done ? '✓' : '○'}</Text>
      </View>
      <Text style={[cr.label, done && cr.labelDone]}>{label}</Text>
    </View>
  );
}

export default function ProfileCompleteScreen({ navigation }) {
  const { user, refreshUser } = useAuth();

  const [score,     setScore]     = useState(0);
  const [checklist, setChecklist] = useState({});
  const [loading,   setLoading]   = useState(true);
  const [section,   setSection]   = useState(null);
  const [bio,       setBio]       = useState(user?.bio || '');
  const [intent,    setIntent]    = useState(user?.intent || '');
  const [interests, setInterests] = useState(user?.interests || []);
  const [saving,    setSaving]    = useState(false);
  const [msg,       setMsg]       = useState('');

  const loadStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/api/profile-status');
      setScore(data.profile_score);
      setChecklist(data.checklist);
    } catch (e) {
      console.log('[ProfileComplete] status error', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  async function save(patch) {
    setSaving(true);
    setMsg('');
    try {
      await api.put('/api/me', patch);
      const updated = await refreshUser();
      setScore(updated?.profile_score || 0);
      setChecklist({
        photos:    (updated?.photos    || []).length >= 4,
        interests: (updated?.interests || []).length >= 3,
        intent:    !!(updated?.intent),
        bio:       !!(updated?.bio && updated.bio.length >= 10),
        name:      !!(updated?.name && updated.name.length >= 2),
      });
      setSection(null);
      setMsg('Saved ✓');
      setTimeout(() => setMsg(''), 2500);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  }

  function toggleInterest(val) {
    setInterests(prev =>
      prev.includes(val) ? prev.filter(i => i !== val) : [...prev, val]
    );
  }

  return (
    <ScrollView style={s.wrap} contentContainerStyle={s.inner}
      keyboardShouldPersistTaps="handled">

      <Text style={s.logo}>Network</Text>
      <Text style={s.heading}>Complete Your Profile</Text>
      <Text style={s.sub}>Reach 70% to unlock Discover, Chat & Matches</Text>

      {loading
        ? <ActivityIndicator color={C.gold} style={{ marginTop: 32 }} />
        : <ProgressBar score={score} />
      }

      {score >= 70 && (
        <View style={s.unlocked}>
          <Text style={s.unlockedTxt}>🎉 Profile complete! The app will unlock automatically.</Text>
        </View>
      )}

      {!!msg && <Text style={s.savedMsg}>{msg}</Text>}

      {/* ── PHOTOS ── */}
      <TouchableOpacity style={s.card}
        onPress={() => setSection(section === 'photos' ? null : 'photos')}>
        <View style={s.cardHeader}>
          <View style={[s.badge, checklist.photos ? s.badgeDone : s.badgePending]}>
            <Text style={s.badgeTxt}>{checklist.photos ? '✓' : '!'}</Text>
          </View>
          <View style={s.cardMeta}>
            <Text style={s.cardTitle}>Add 4+ Photos  <Text style={s.pts}>+30 pts</Text></Text>
            <Text style={s.cardSub}>{checklist.photos ? 'Complete' : `${(user?.photos||[]).length}/4 uploaded`}</Text>
          </View>
          <Text style={s.chevron}>{section === 'photos' ? '▲' : '▼'}</Text>
        </View>
        {section === 'photos' && (
          <View style={s.cardBody}>
            <Text style={s.hint}>
              Go to the Profile tab → tap the camera icon to upload photos. You need at least 4.
            </Text>
            <TouchableOpacity style={s.secondaryBtn}
              onPress={() => navigation.navigate('ProfileForSetup')}>
              <Text style={s.secondaryBtnTxt}>Open Profile → Add Photos</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>

      {/* ── INTERESTS ── */}
      <TouchableOpacity style={s.card}
        onPress={() => setSection(section === 'interests' ? null : 'interests')}>
        <View style={s.cardHeader}>
          <View style={[s.badge, checklist.interests ? s.badgeDone : s.badgePending]}>
            <Text style={s.badgeTxt}>{checklist.interests ? '✓' : '!'}</Text>
          </View>
          <View style={s.cardMeta}>
            <Text style={s.cardTitle}>Add 3+ Interests  <Text style={s.pts}>+20 pts</Text></Text>
            <Text style={s.cardSub}>{checklist.interests ? 'Complete' : `${interests.length}/3 selected`}</Text>
          </View>
          <Text style={s.chevron}>{section === 'interests' ? '▲' : '▼'}</Text>
        </View>
        {section === 'interests' && (
          <View style={s.cardBody}>
            <View style={s.tagWrap}>
              {INTEREST_OPTIONS.map(opt => {
                const sel = interests.includes(opt);
                return (
                  <TouchableOpacity key={opt}
                    style={[s.tag, sel && s.tagSel]}
                    onPress={() => toggleInterest(opt)}>
                    <Text style={[s.tagTxt, sel && s.tagTxtSel]}>{opt}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={s.count}>{interests.length} selected (need 3+)</Text>
            <TouchableOpacity style={[s.saveBtn, interests.length < 1 && s.saveBtnDisabled]}
              onPress={() => save({ interests })} disabled={saving || interests.length < 1}>
              {saving ? <ActivityIndicator color={C.bg} size="small" />
                : <Text style={s.saveBtnTxt}>Save Interests</Text>}
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>

      {/* ── INTENT ── */}
      <TouchableOpacity style={s.card}
        onPress={() => setSection(section === 'intent' ? null : 'intent')}>
        <View style={s.cardHeader}>
          <View style={[s.badge, checklist.intent ? s.badgeDone : s.badgePending]}>
            <Text style={s.badgeTxt}>{checklist.intent ? '✓' : '!'}</Text>
          </View>
          <View style={s.cardMeta}>
            <Text style={s.cardTitle}>Set Your Goal  <Text style={s.pts}>+20 pts</Text></Text>
            <Text style={s.cardSub}>{checklist.intent ? (intent || user?.intent || 'Set') : 'Not selected'}</Text>
          </View>
          <Text style={s.chevron}>{section === 'intent' ? '▲' : '▼'}</Text>
        </View>
        {section === 'intent' && (
          <View style={s.cardBody}>
            {INTENTS.map(opt => (
              <TouchableOpacity key={opt.value}
                style={[s.intentRow, intent === opt.value && s.intentRowSel]}
                onPress={() => setIntent(opt.value)}>
                <Text style={[s.intentTxt, intent === opt.value && s.intentTxtSel]}>{opt.label}</Text>
                {intent === opt.value && <Text style={{ color: C.gold }}>●</Text>}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[s.saveBtn, !intent && s.saveBtnDisabled]}
              onPress={() => save({ intent })} disabled={saving || !intent}>
              {saving ? <ActivityIndicator color={C.bg} size="small" />
                : <Text style={s.saveBtnTxt}>Save Goal</Text>}
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>

      {/* ── BIO ── */}
      <TouchableOpacity style={s.card}
        onPress={() => setSection(section === 'bio' ? null : 'bio')}>
        <View style={s.cardHeader}>
          <View style={[s.badge, checklist.bio ? s.badgeDone : s.badgePending]}>
            <Text style={s.badgeTxt}>{checklist.bio ? '✓' : '!'}</Text>
          </View>
          <View style={s.cardMeta}>
            <Text style={s.cardTitle}>Write a Bio  <Text style={s.pts}>+10 pts</Text></Text>
            <Text style={s.cardSub}>{checklist.bio ? 'Complete' : 'Min 10 characters'}</Text>
          </View>
          <Text style={s.chevron}>{section === 'bio' ? '▲' : '▼'}</Text>
        </View>
        {section === 'bio' && (
          <View style={s.cardBody}>
            <TextInput
              style={s.textArea}
              placeholder="Tell the network who you are and what you're building…"
              placeholderTextColor={C.dim}
              value={bio}
              onChangeText={setBio}
              multiline
              numberOfLines={4}
            />
            <Text style={s.count}>{bio.length} / 10 min chars</Text>
            <TouchableOpacity style={[s.saveBtn, bio.length < 10 && s.saveBtnDisabled]}
              onPress={() => save({ bio })} disabled={saving || bio.length < 10}>
              {saving ? <ActivityIndicator color={C.bg} size="small" />
                : <Text style={s.saveBtnTxt}>Save Bio</Text>}
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>

      {/* Bonus */}
      <View style={s.bonus}>
        <Text style={s.bonusTitle}>Bonus +10 pts</Text>
        <CheckRow done={false} label="Add your location (optional)" />
        <Text style={s.hint2}>Add location from your Profile tab after unlocking.</Text>
      </View>

      {/* Summary */}
      <View style={s.summary}>
        <Text style={s.summaryTitle}>Checklist</Text>
        <CheckRow done={checklist.photos}    label="4+ photos uploaded" />
        <CheckRow done={checklist.interests} label="3+ interests selected" />
        <CheckRow done={checklist.intent}    label="Networking goal set" />
        <CheckRow done={checklist.bio}       label="Bio written (10+ chars)" />
      </View>

      {score < 70 && (
        <View style={s.lockBanner}>
          <Text style={s.lockTxt}>🔒 {70 - score} more points needed to unlock the app</Text>
        </View>
      )}

      <View style={{ height: 50 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap:           { flex: 1, backgroundColor: C.bg },
  inner:          { padding: 24, paddingTop: 60 },
  logo:           { fontSize: 24, fontWeight: '700', color: C.gold, textAlign: 'center', marginBottom: 20, letterSpacing: 1 },
  heading:        { fontSize: 22, fontWeight: '700', color: C.text, textAlign: 'center', marginBottom: 6 },
  sub:            { fontSize: 13, color: C.sub, textAlign: 'center', marginBottom: 20 },
  unlocked:       { backgroundColor: '#14532d', borderRadius: 10, padding: 14, marginBottom: 12, alignItems: 'center' },
  unlockedTxt:    { color: '#86efac', fontWeight: '600', fontSize: 14 },
  savedMsg:       { color: '#22c55e', textAlign: 'center', marginBottom: 8, fontWeight: '600' },
  card:           { backgroundColor: C.sur, borderRadius: 12, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  cardHeader:     { flexDirection: 'row', alignItems: 'center', padding: 14 },
  badge:          { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  badgeDone:      { backgroundColor: '#166534' },
  badgePending:   { backgroundColor: '#7c2d12' },
  badgeTxt:       { color: '#fff', fontWeight: '700', fontSize: 14 },
  cardMeta:       { flex: 1 },
  cardTitle:      { color: C.text, fontWeight: '600', fontSize: 15 },
  pts:            { color: C.gold, fontSize: 12, fontWeight: '700' },
  cardSub:        { color: C.sub, fontSize: 12, marginTop: 2 },
  chevron:        { color: C.dim, fontSize: 12 },
  cardBody:       { padding: 14, paddingTop: 4, borderTopWidth: 1, borderTopColor: C.border },
  hint:           { color: C.sub, fontSize: 13, marginBottom: 12, lineHeight: 18 },
  hint2:          { color: C.dim, fontSize: 12, marginTop: 4 },
  tagWrap:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  tag:            { backgroundColor: C.sur2, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: C.border },
  tagSel:         { backgroundColor: C.gold, borderColor: C.gold },
  tagTxt:         { color: C.sub, fontSize: 13 },
  tagTxtSel:      { color: C.bg, fontWeight: '600' },
  count:          { color: C.dim, fontSize: 12, marginBottom: 10, textAlign: 'right' },
  intentRow:      { padding: 12, borderRadius: 8, marginBottom: 8, backgroundColor: C.sur2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: C.border },
  intentRowSel:   { borderColor: C.gold, backgroundColor: '#1a1508' },
  intentTxt:      { color: C.sub, fontSize: 14 },
  intentTxtSel:   { color: C.gold, fontWeight: '600' },
  textArea:       { backgroundColor: C.sur2, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12, color: C.text, fontSize: 14, minHeight: 90, textAlignVertical: 'top', marginBottom: 6 },
  saveBtn:        { backgroundColor: C.gold, borderRadius: 10, padding: 13, alignItems: 'center', marginTop: 4 },
  saveBtnDisabled:{ backgroundColor: C.dim },
  saveBtnTxt:     { color: C.bg, fontWeight: '700', fontSize: 14 },
  secondaryBtn:   { backgroundColor: C.sur2, borderRadius: 10, padding: 13, alignItems: 'center', borderWidth: 1, borderColor: C.gold },
  secondaryBtnTxt:{ color: C.gold, fontWeight: '600', fontSize: 14 },
  bonus:          { backgroundColor: C.sur, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  bonusTitle:     { color: C.gold, fontWeight: '700', fontSize: 13, marginBottom: 8 },
  summary:        { backgroundColor: C.sur, borderRadius: 12, padding: 16, marginTop: 4, borderWidth: 1, borderColor: C.border },
  summaryTitle:   { color: C.text, fontWeight: '700', fontSize: 14, marginBottom: 10 },
  lockBanner:     { backgroundColor: '#1c0a0a', borderRadius: 10, padding: 14, marginTop: 16, alignItems: 'center', borderWidth: 1, borderColor: '#7c2d12' },
  lockTxt:        { color: '#fca5a5', fontWeight: '600', fontSize: 14 },
});

const pb = StyleSheet.create({
  wrap:  { marginBottom: 20 },
  track: { height: 10, backgroundColor: C.sur2, borderRadius: 5, overflow: 'hidden', marginBottom: 6 },
  fill:  { height: '100%', borderRadius: 5 },
  label: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
});

const cr = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  dot:        { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  dotDone:    { backgroundColor: '#166534' },
  dotPending: { backgroundColor: '#374151' },
  icon:       { color: '#fff', fontSize: 11, fontWeight: '700' },
  label:      { color: C.sub, fontSize: 14 },
  labelDone:  { color: C.text, fontWeight: '600' },
});
