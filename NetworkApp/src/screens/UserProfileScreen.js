import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Image, ActivityIndicator,
  StyleSheet, TouchableOpacity, Modal, Pressable,
} from 'react-native';
import api from '../utils/api';
import { C } from '../utils/theme';

function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

const INTENT_LABELS = {
  'explore-network':     'Exploring network',
  'exchange-ideas':      'Exchanging ideas',
  'learn-mentorship':    'Learning / Mentorship',
  'build-relationships': 'Building relationships',
  'collaborate':         'Looking to collaborate',
  'find-cofounder':      'Finding co-founder',
  'find-mentor':         'Finding mentor',
  'hire':                'Hiring talent',
  'find-investors':      'Finding investors',
};

const REVIEW_TAGS = [
  'Responsive','Professional','Knowledgeable','Collaborative',
  'Trustworthy','Inspiring','Well-connected','Good listener',
  'Helpful','Creative','Reliable','Authentic',
];

function StarRow({ rating, size = 16, onPress }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <TouchableOpacity key={n} onPress={() => onPress?.(n)} disabled={!onPress}>
          <Text style={{ fontSize: size, color: n <= rating ? '#F59E0B' : '#D1D5DB' }}>★</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function UserProfileScreen({ route, navigation }) {
  const { userId } = route.params || {};
  const [profile,    setProfile]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [showReview, setShowReview] = useState(false);

  // Review form state
  const [selRating,  setSelRating]  = useState(0);
  const [selTags,    setSelTags]    = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [reviewDone, setReviewDone] = useState(false);

  const load = useCallback(async () => {
    if (!userId) { setError('No user ID provided'); setLoading(false); return; }
    try {
      const { data } = await api.get(`/api/profiles/${userId}`);
      setProfile(data);
      navigation.setOptions({ title: data.name || 'Profile' });
      if (data.my_review) {
        setSelRating(data.my_review.rating);
        setSelTags(data.my_review.tags || []);
        setReviewDone(true);
      }
    } catch (e) {
      setError(e.response?.data?.error || 'Could not load profile');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  async function submitReview() {
    if (!selRating) return;
    setSubmitting(true);
    try {
      await api.post(`/api/users/${userId}/review`, { rating: selRating, tags: selTags });
      setReviewDone(true);
      setShowReview(false);
      const { data } = await api.get(`/api/profiles/${userId}`);
      setProfile(data);
    } catch (e) {
      console.log('Review submit error:', e.response?.data?.error);
    } finally {
      setSubmitting(false);
    }
  }

  function toggleTag(tag) {
    setSelTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag].slice(0, 5)
    );
  }

  if (loading) return <View style={s.center}><ActivityIndicator color={C.primary} size="large" /></View>;

  if (error || !profile) {
    return (
      <View style={s.center}>
        <Text style={s.errorTxt}>{error || 'Profile not found'}</Text>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Text style={s.backTxt}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const photos      = profile.photos      || [];
  const skills      = profile.skills      || [];
  const interests   = profile.interests   || [];
  const reviewSum   = profile.review_summary || { count: 0, avg_rating: 0, top_tags: [] };
  const connCount   = profile.connections_count ?? 0;
  const mutualCount = profile.mutual_count  ?? 0;
  const isConnected = profile.is_connected  ?? false;

  return (
    <>
      <ScrollView style={s.screen} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Hero */}
        <View style={s.heroWrap}>
          {photos[0]
            ? <Image source={{ uri: photos[0] }} style={s.hero} />
            : <View style={s.heroFallback}><Text style={s.heroInit}>{initials(profile.name)}</Text></View>
          }
          {profile.verification?.status === 'verified' && (
            <View style={s.verifiedBadge}><Text style={s.verifiedTxt}>✓ Verified</Text></View>
          )}
          {profile.is_recently_active && <View style={s.onlineDot} />}
        </View>

        {/* Name + match score */}
        <View style={s.nameRow}>
          <Text style={s.name}>{profile.name || '—'}</Text>
          {profile.matchScore ? (
            <View style={s.scoreBox}>
              <Text style={s.scorePct}>{profile.matchScore}</Text>
              <Text style={s.scoreLbl}>match</Text>
            </View>
          ) : null}
        </View>
        {profile.location ? <Text style={s.location}>📍 {profile.location}</Text> : null}
        {profile.intent ? (
          <View style={s.intentBadge}>
            <Text style={s.intentTxt}>{INTENT_LABELS[profile.intent] || profile.intent}</Text>
          </View>
        ) : null}

        {/* ── CONNECTION STATS ── */}
        <View style={s.statsRow}>
          <View style={s.statBox}>
            <Text style={s.statNum}>{connCount}</Text>
            <Text style={s.statLbl}>Connections</Text>
          </View>
          {reviewSum.count > 0 && (
            <View style={s.statBox}>
              <Text style={s.statNum}>{reviewSum.avg_rating.toFixed(1)} ★</Text>
              <Text style={s.statLbl}>{reviewSum.count} {reviewSum.count === 1 ? 'review' : 'reviews'}</Text>
            </View>
          )}
          {isConnected && mutualCount > 0 && (
            <View style={s.statBox}>
              <Text style={s.statNum}>{mutualCount}</Text>
              <Text style={s.statLbl}>Mutual</Text>
            </View>
          )}
        </View>

        {/* ── PEER REVIEW SUMMARY ── */}
        {reviewSum.count > 0 && (
          <View style={s.panel}>
            <Text style={s.panelTitle}>Community Trust</Text>
            <View style={s.reviewHeader}>
              <StarRow rating={Math.round(reviewSum.avg_rating)} size={20} />
              <Text style={s.reviewAvgTxt}>
                {reviewSum.avg_rating.toFixed(1)} / 5 · {reviewSum.count} {reviewSum.count === 1 ? 'review' : 'reviews'}
              </Text>
            </View>
            {reviewSum.top_tags.length > 0 && (
              <View style={s.pills}>
                {reviewSum.top_tags.map(({ tag, count }) => (
                  <View key={tag} style={s.tagPill}>
                    <Text style={s.tagPillTxt}>✓ {tag}</Text>
                    <Text style={s.tagCount}> ·{count}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ── LEAVE A REVIEW (connected users only) ── */}
        {isConnected && (
          <View style={s.panel}>
            <Text style={s.panelTitle}>Your Review</Text>
            {reviewDone ? (
              <View>
                <View style={s.reviewHeader}>
                  <StarRow rating={selRating} size={18} />
                  <Text style={s.reviewedTxt}>Review submitted</Text>
                </View>
                {selTags.length > 0 && (
                  <View style={[s.pills, { marginTop: 8 }]}>
                    {selTags.map(t => (
                      <View key={t} style={[s.tagPill, s.tagPillActive]}>
                        <Text style={s.tagPillActiveTxt}>{t}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <TouchableOpacity style={s.editReviewBtn} onPress={() => { setShowReview(true); }}>
                  <Text style={s.editReviewTxt}>Edit review</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={s.leaveReviewBtn} onPress={() => setShowReview(true)}>
                <Text style={s.leaveReviewTxt}>⭐  Leave a review</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Bio */}
        {profile.bio ? (
          <View style={s.panel}>
            <Text style={s.panelTitle}>About</Text>
            <Text style={s.bioTxt}>{profile.bio}</Text>
          </View>
        ) : null}

        {/* Context */}
        {(profile.currently_exploring || profile.working_on) ? (
          <View style={s.panel}>
            <Text style={s.panelTitle}>Context</Text>
            {profile.currently_exploring ? (
              <View style={s.contextRow}>
                <Text style={s.contextLabel}>Currently exploring</Text>
                <Text style={s.contextVal}>{profile.currently_exploring}</Text>
              </View>
            ) : null}
            {profile.working_on ? (
              <View style={s.contextRow}>
                <Text style={s.contextLabel}>Working on</Text>
                <Text style={s.contextVal}>{profile.working_on}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Skills */}
        {skills.length > 0 ? (
          <View style={s.panel}>
            <Text style={s.panelTitle}>Skills</Text>
            <View style={s.pills}>
              {skills.map(sk => (
                <View key={sk} style={s.pill}><Text style={s.pillTxt}>{sk}</Text></View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Interests */}
        {interests.length > 0 ? (
          <View style={s.panel}>
            <Text style={s.panelTitle}>Interests</Text>
            <View style={s.pills}>
              {interests.map(it => (
                <View key={it} style={[s.pill, s.pillGold]}><Text style={s.pillGoldTxt}>{it}</Text></View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Photo grid */}
        {photos.length > 1 ? (
          <View style={s.panel}>
            <Text style={s.panelTitle}>Photos</Text>
            <View style={s.photoGrid}>
              {photos.slice(1).map((url, i) => (
                <Image key={i} source={{ uri: url }} style={s.photoThumb} />
              ))}
            </View>
          </View>
        ) : null}

      </ScrollView>

      {/* ── REVIEW MODAL ── */}
      <Modal visible={showReview} animationType="slide" transparent onRequestClose={() => setShowReview(false)}>
        <Pressable style={s.modalOverlay} onPress={() => setShowReview(false)}>
          <Pressable style={s.modalSheet} onPress={e => e.stopPropagation()}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Review {profile.name?.split(' ')[0]}</Text>
            <Text style={s.modalSub}>Shown as aggregate only — your identity stays private</Text>

            <Text style={s.sectionLabel}>Rating</Text>
            <View style={s.starRow}>
              <StarRow rating={selRating} size={36} onPress={setSelRating} />
              {selRating > 0 && (
                <Text style={s.ratingLabel}>
                  {['','Poor','Fair','Good','Great','Excellent'][selRating]}
                </Text>
              )}
            </View>

            <Text style={s.sectionLabel}>
              Tags <Text style={s.sectionSub}>(up to 5)</Text>
            </Text>
            <View style={s.tagGrid}>
              {REVIEW_TAGS.map(tag => {
                const active = selTags.includes(tag);
                return (
                  <TouchableOpacity
                    key={tag}
                    style={[s.tagOption, active && s.tagOptionActive]}
                    onPress={() => toggleTag(tag)}
                  >
                    <Text style={[s.tagOptionTxt, active && s.tagOptionActiveTxt]}>{tag}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[s.submitBtn, (!selRating || submitting) && s.submitBtnDisabled]}
              onPress={submitReview}
              disabled={!selRating || submitting}
            >
              {submitting
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.submitTxt}>{reviewDone ? 'Update Review' : 'Submit Review'}</Text>
              }
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  screen:       { flex: 1, backgroundColor: C.bg },
  scroll:       { paddingBottom: 48 },
  center:       { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  errorTxt:     { color: C.sub, fontSize: 14, textAlign: 'center', marginBottom: 16 },
  backBtn:      { borderWidth: 1, borderColor: C.border2, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10 },
  backTxt:      { color: C.primary, fontSize: 14 },

  heroWrap:     { position: 'relative', width: '100%', height: 280, backgroundColor: C.primaryLight },
  hero:         { width: '100%', height: 280, resizeMode: 'cover' },
  heroFallback: { width: '100%', height: 280, justifyContent: 'center', alignItems: 'center', backgroundColor: C.primaryLight },
  heroInit:     { fontSize: 72, color: C.primary },
  verifiedBadge:{ position: 'absolute', bottom: 14, left: 14, backgroundColor: 'rgba(34,197,94,0.9)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  verifiedTxt:  { color: '#fff', fontSize: 12 },
  onlineDot:    { position: 'absolute', top: 14, right: 14, width: 14, height: 14, borderRadius: 7, backgroundColor: C.green, borderWidth: 2, borderColor: C.bg },

  nameRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 4 },
  name:         { fontSize: 26, color: C.text, flex: 1, fontWeight: '700' },
  scoreBox:     { backgroundColor: C.primaryLight, borderRadius: 10, padding: 8, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(79,138,115,0.25)', marginLeft: 12, minWidth: 56 },
  scorePct:     { fontSize: 18, color: C.primary, fontWeight: '700' },
  scoreLbl:     { fontSize: 9, color: C.sub },

  location:     { fontSize: 13, color: C.sub, paddingHorizontal: 20, marginBottom: 8 },
  intentBadge:  { marginHorizontal: 20, marginBottom: 12, backgroundColor: C.primaryLight, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, alignSelf: 'flex-start', borderWidth: 1, borderColor: 'rgba(79,138,115,0.2)' },
  intentTxt:    { fontSize: 12, color: C.primary, fontWeight: '500' },

  statsRow:     { flexDirection: 'row', marginHorizontal: 16, marginBottom: 12, gap: 8 },
  statBox:      { flex: 1, backgroundColor: C.card, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  statNum:      { fontSize: 18, fontWeight: '700', color: C.primary, marginBottom: 2 },
  statLbl:      { fontSize: 11, color: C.sub },

  panel:        { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 16, marginHorizontal: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  panelTitle:   { fontSize: 12, color: C.sub, letterSpacing: 1, marginBottom: 12, textTransform: 'uppercase', fontWeight: '600' },
  bioTxt:       { fontSize: 15, color: C.text, lineHeight: 23 },

  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  reviewAvgTxt: { fontSize: 13, color: C.sub },
  reviewedTxt:  { fontSize: 12, color: C.green, fontWeight: '500' },

  leaveReviewBtn:    { backgroundColor: C.primaryLight, borderRadius: 10, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(79,138,115,0.3)' },
  leaveReviewTxt:    { fontSize: 14, color: C.primary, fontWeight: '600' },
  editReviewBtn:     { marginTop: 10, alignSelf: 'flex-start' },
  editReviewTxt:     { fontSize: 13, color: C.primary, textDecorationLine: 'underline' },

  pills:        { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill:         { backgroundColor: C.bgSec, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: C.border },
  pillTxt:      { fontSize: 12, color: C.sub },
  pillGold:     { backgroundColor: C.primaryLight, borderColor: 'rgba(79,138,115,0.25)' },
  pillGoldTxt:  { fontSize: 12, color: C.primary },

  tagPill:         { flexDirection: 'row', alignItems: 'center', backgroundColor: C.primaryLight, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(79,138,115,0.25)' },
  tagPillTxt:      { fontSize: 12, color: C.primary, fontWeight: '500' },
  tagCount:        { fontSize: 11, color: C.sub },
  tagPillActive:   { backgroundColor: C.primary, borderColor: C.primary },
  tagPillActiveTxt:{ fontSize: 12, color: '#fff', fontWeight: '500' },

  contextRow:   { marginBottom: 10 },
  contextLabel: { fontSize: 11, color: C.dim, letterSpacing: 0.8, marginBottom: 3 },
  contextVal:   { fontSize: 14, color: C.text, lineHeight: 20 },

  photoGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoThumb:   { width: 90, height: 90, borderRadius: 8 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet:   { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalHandle:  { width: 40, height: 4, backgroundColor: C.border2, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitle:   { fontSize: 20, fontWeight: '700', color: C.text, marginBottom: 4 },
  modalSub:     { fontSize: 12, color: C.sub, marginBottom: 20 },

  sectionLabel: { fontSize: 12, color: C.sub, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: '600', marginBottom: 10 },
  sectionSub:   { fontSize: 11, color: C.dim, textTransform: 'none', letterSpacing: 0 },

  starRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  ratingLabel:  { fontSize: 15, color: C.text, fontWeight: '600' },

  tagGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  tagOption:    { backgroundColor: C.bgSec, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: C.border },
  tagOptionTxt: { fontSize: 13, color: C.sub },
  tagOptionActive:   { backgroundColor: C.primary, borderColor: C.primary },
  tagOptionActiveTxt:{ color: '#fff', fontWeight: '500' },

  submitBtn:         { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  submitBtnDisabled: { backgroundColor: C.border2 },
  submitTxt:         { color: '#fff', fontSize: 16, fontWeight: '700' },
});
