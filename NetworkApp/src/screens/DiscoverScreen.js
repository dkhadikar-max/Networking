import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet, ActivityIndicator,
  PanResponder, Animated, Dimensions, Modal, ScrollView, Platform, Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { C, SHADOW } from '../utils/theme';
import BYNLogo from '../components/BYNLogo';
import useNetworkStatus from '../hooks/useNetworkStatus';
import {
  trackSwipe, trackProfileOpen, trackMessageSent,
  trackFilterApplied, trackMatchMade,
} from '../utils/analytics';

const { width: W, height: H } = Dimensions.get('window');
const CARD_HEIGHT     = H * 0.68;
const SWIPE_THRESHOLD = W * 0.28;
const ROTATE_FACTOR   = 12;

const DEFAULT_FILTERS = { sort: 'relevance', radius: '', intent: '', interest: '' };

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

const INTEREST_OPTIONS = [
  'AI / ML', 'Startups', 'SaaS', 'Fintech', 'Design', 'Marketing',
  'Web3', 'Climate Tech', 'Health Tech', 'Edtech', 'Open Source',
  'Product Management', 'Sales', 'VC / Investing', 'Engineering',
];

function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// ── Offline banner ─────────────────────────────────────────────────────────
function OfflineBanner() {
  return (
    <View style={ob.banner}>
      <Text style={ob.icon}>!</Text>
      <Text style={ob.txt}>No internet connection</Text>
    </View>
  );
}
const ob = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(244,162,97,0.15)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(244,162,97,0.3)',
    paddingHorizontal: 16, paddingVertical: 8,
  },
  icon: { fontSize: 13, color: '#F4A261', fontWeight: '700' },
  txt:  { fontSize: 12, color: '#92400E', flex: 1 },
});

// ── Discover header — defined OUTSIDE DiscoverScreen for stable React identity ──
function DiscoverHeader({ topPad, filterCount, onFilters }) {
  return (
    <View style={[s.header, { paddingTop: topPad }]}>
      <BYNLogo size={30} />
      <TouchableOpacity
        style={[s.filterBtn, filterCount > 0 && s.filterBtnOn]}
        onPress={onFilters}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={[s.filterTxt, filterCount > 0 && s.filterTxtOn]}>Filters</Text>
        {filterCount > 0 && (
          <View style={s.filterCount}>
            <Text style={s.filterCountTxt}>{filterCount}</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ── Swipe card ─────────────────────────────────────────────────────────────
function SwipeCard({ profile, onSwipeLeft, onSwipeRight, onOpenProfile, isTop }) {
  const position  = useRef(new Animated.ValueXY()).current;
  const nextScale = useRef(new Animated.Value(0.95)).current;
  const swiping   = useRef(false);

  const connectOpacity = position.x.interpolate({
    inputRange: [0, SWIPE_THRESHOLD * 0.5], outputRange: [0, 1], extrapolate: 'clamp',
  });
  const skipOpacity = position.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD * 0.5, 0], outputRange: [1, 0], extrapolate: 'clamp',
  });
  const rotate = position.x.interpolate({
    inputRange: [-W, W],
    outputRange: ['-' + ROTATE_FACTOR + 'deg', ROTATE_FACTOR + 'deg'],
    extrapolate: 'clamp',
  });

  useEffect(() => {
    swiping.current = false;
    position.setValue({ x: 0, y: 0 });
    nextScale.setValue(0.95);
  }, []);

  function fly(toX, toY, cb) {
    Animated.parallel([
      Animated.timing(position, { toValue: { x: toX, y: toY }, duration: 250, useNativeDriver: true }),
      Animated.timing(nextScale, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start(() => cb && cb());
  }

  const panResponder = useRef(PanResponder.create({
    // FIX: return false on start so taps pass through to TouchableOpacity
    onStartShouldSetPanResponder: () => false,
    // Only claim gesture when clearly a horizontal drag (dx > dy, dx > 8px)
    onMoveShouldSetPanResponder: (_, g) =>
      isTop && Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderMove: (_, g) => {
      if (swiping.current) return;
      position.setValue({ x: g.dx, y: g.dy * 0.2 });
      const prog = Math.min(Math.abs(g.dx) / SWIPE_THRESHOLD, 1);
      nextScale.setValue(0.95 + prog * 0.05);
    },
    onPanResponderRelease: (_, g) => {
      if (swiping.current) return;
      if (g.dx > SWIPE_THRESHOLD) {
        swiping.current = true;
        fly(W * 1.5, 0, onSwipeRight);
      } else if (g.dx < -SWIPE_THRESHOLD) {
        swiping.current = true;
        fly(-W * 1.5, 0, onSwipeLeft);
      } else {
        Animated.spring(position, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start();
        Animated.spring(nextScale, { toValue: 0.95, useNativeDriver: true }).start();
      }
    },
  })).current;

  // Programmatic swipe — called by Skip/Connect buttons
  SwipeCard.swipeLeft  = () => { if (!swiping.current) { swiping.current = true; fly(-W * 1.5, 0, onSwipeLeft);  } };
  SwipeCard.swipeRight = () => { if (!swiping.current) { swiping.current = true; fly( W * 1.5, 0, onSwipeRight); } };

  const cardStyle = isTop
    ? { transform: [...position.getTranslateTransform(), { rotate }] }
    : { transform: [{ scale: nextScale }] };

  const photo = (profile.photos || [])[0];
  const tags  = [...(profile.interests || []), ...(profile.skills || [])].slice(0, 2);

  return (
    <Animated.View style={[s.card, cardStyle]} {...(isTop ? panResponder.panHandlers : {})}>

      {isTop && (
        <>
          <Animated.View style={[s.overlayLabel, s.overlayRight, { opacity: connectOpacity }]}>
            <Text style={[s.overlayTxt, { color: C.primary }]}>CONNECT</Text>
          </Animated.View>
          <Animated.View style={[s.overlayLabel, s.overlayLeft, { opacity: skipOpacity }]}>
            <Text style={[s.overlayTxt, { color: C.danger }]}>SKIP</Text>
          </Animated.View>
        </>
      )}

      <TouchableOpacity
        style={{ flex: 1 }}
        activeOpacity={0.95}
        onPress={() => onOpenProfile && onOpenProfile(profile)}>

        {photo
          ? <Image source={{ uri: photo }} style={s.cardImg} />
          : <View style={s.cardNoImg}><Text style={s.cardInit}>{initials(profile.name)}</Text></View>
        }

        {profile.verification?.status === 'verified' && (
          <View style={s.verifiedBadge}><Text style={s.verifiedTxt}>Verified</Text></View>
        )}
        {profile.is_recently_active && <View style={s.onlineDot} />}

        <View style={s.cardBody}>
          <View style={s.topRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.cardName} numberOfLines={1}>{profile.name || '—'}</Text>
              {profile.role ? <Text style={s.cardRole} numberOfLines={1}>{profile.role}</Text> : null}
            </View>
            {profile.matchScore ? (
              <View style={s.matchBox}>
                <Text style={s.matchPct}>{profile.matchScore}</Text>
                <Text style={s.matchLbl}>match</Text>
              </View>
            ) : null}
          </View>
          {tags.length > 0 && (
            <View style={s.pills}>
              {tags.map(t => (
                <View key={t} style={s.pill}><Text style={s.pillTxt}>{t}</Text></View>
              ))}
            </View>
          )}
          {profile.currently_exploring
            ? <Text style={s.insight} numberOfLines={2}>{profile.currently_exploring}</Text>
            : profile.bio
              ? <Text style={s.insight} numberOfLines={2}>{profile.bio}</Text>
              : null
          }
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Match modal ────────────────────────────────────────────────────────────
function MatchModal({ profile, onClose, onChat }) {
  if (!profile) return null;
  const photo = (profile.photos || [])[0];
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={ms.overlay}>
        <View style={ms.card}>
          <Text style={ms.star}>*</Text>
          <Text style={ms.label}>IT'S A MATCH</Text>
          {photo
            ? <Image source={{ uri: photo }} style={ms.avatar} />
            : <View style={ms.avatarFb}><Text style={ms.avatarInit}>{initials(profile.name)}</Text></View>
          }
          <Text style={ms.name}>{profile.name}</Text>
          <Text style={ms.sub}>You can now message each other!</Text>
          <View style={ms.row}>
            <TouchableOpacity style={ms.secondary} onPress={onClose}>
              <Text style={ms.secondaryTxt}>Later</Text>
            </TouchableOpacity>
            <TouchableOpacity style={ms.primary} onPress={onChat}>
              <Text style={ms.primaryTxt}>Start Chat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Filter modal ───────────────────────────────────────────────────────────
function FilterModal({ visible, filters, onApply, onClose }) {
  const [local, setLocal] = useState(filters);
  const [showInterests, setShowInterests] = useState(false);

  useEffect(() => { if (visible) setLocal(filters); }, [visible]);

  function toggle(key, val) {
    setLocal(f => ({ ...f, [key]: f[key] === val ? '' : val }));
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={fm.backdrop}>
        <View style={fm.container}>
          <View style={fm.handle} />
          <View style={fm.topBar}>
            <Text style={fm.heading}>Filters</Text>
          </View>
          <ScrollView style={fm.scroll} showsVerticalScrollIndicator={false}>

            <View style={fm.section}>
              <Text style={fm.secTitle}>Sort by</Text>
              <View style={[fm.sectionBody, fm.chips]}>
                {['relevance', 'recent', 'active'].map(opt => (
                  <TouchableOpacity
                    key={opt}
                    style={[fm.chip, local.sort === opt && fm.chipOn]}
                    onPress={() => setLocal(f => ({ ...f, sort: opt }))}>
                    <Text style={[fm.chipTxt, local.sort === opt && fm.chipTxtOn]}>
                      {opt.charAt(0).toUpperCase() + opt.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={fm.section}>
              <Text style={fm.secTitle}>Intent</Text>
              <View style={[fm.sectionBody, fm.chips]}>
                {Object.entries(INTENT_LABELS).slice(0, 5).map(([key, label]) => (
                  <TouchableOpacity
                    key={key}
                    style={[fm.chip, local.intent === key && fm.chipOn]}
                    onPress={() => toggle('intent', key)}>
                    <Text style={[fm.chipTxt, local.intent === key && fm.chipTxtOn]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={fm.section}>
              <View style={fm.sectionHdr}>
                <Text style={fm.secTitle}>Interest</Text>
                <TouchableOpacity onPress={() => setShowInterests(v => !v)}>
                  <Text style={fm.chevron}>{showInterests ? 'Hide' : 'Show'}</Text>
                </TouchableOpacity>
              </View>
              {showInterests && (
                <View style={[fm.sectionBody, fm.chips]}>
                  {INTEREST_OPTIONS.map(opt => (
                    <TouchableOpacity
                      key={opt}
                      style={[fm.chip, local.interest === opt && fm.chipOn]}
                      onPress={() => toggle('interest', opt)}>
                      <Text style={[fm.chipTxt, local.interest === opt && fm.chipTxtOn]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

          </ScrollView>

          <View style={fm.stickyBar}>
            <TouchableOpacity onPress={() => setLocal(DEFAULT_FILTERS)}>
              <Text style={fm.resetTxt}>Reset all</Text>
            </TouchableOpacity>
            <TouchableOpacity style={fm.applyBtn} onPress={() => onApply(local)}>
              <Text style={fm.applyTxt}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Discover screen ────────────────────────────────────────────────────────
export default function DiscoverScreen({ navigation }) {
  const { user }   = useAuth();
  const insets     = useSafeAreaInsets();
  const { isOffline } = useNetworkStatus();

  const [profiles,     setProfiles]     = useState([]);
  const [idx,          setIdx]          = useState(0);
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState('');
  const [matchProfile, setMatchProfile] = useState(null);
  const [showFilters,  setShowFilters]  = useState(false);
  const [filters,      setFilters]      = useState(DEFAULT_FILTERS);
  const [priorityBusy, setPriorityBusy] = useState(false);
  const [priorityErr,  setPriorityErr]  = useState('');
  const [priorityOk,   setPriorityOk]   = useState('');
  const [blockCode,    setBlockCode]    = useState('');
  const [blockSteps,   setBlockSteps]   = useState([]);

  const swipedIds = useRef(new Set());
  const topPad = insets.top || (Platform.OS === 'ios' ? 44 : 24);

  function getFilterCount() {
    const { sort, ...rest } = filters;
    return Object.values(rest).filter(Boolean).length + (sort && sort !== 'relevance' ? 1 : 0);
  }

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const params = {};
      if (filters.sort && filters.sort !== 'relevance') params.sort = filters.sort;
      if (filters.intent)   params.intent   = filters.intent;
      if (filters.interest) params.interest = filters.interest;
      if (filters.radius)   params.radius   = filters.radius;

      const { data } = await api.get('/api/discover', { params });
      if (data?.limited) {
        setLoadError('You\'ve reached your daily limit. Come back tomorrow!');
        setProfiles([]);
        setIdx(0);
        return;
      }
      const raw  = Array.isArray(data) ? data : (data?.profiles || []);
      const list = raw.filter(p => p?.id && !swipedIds.current.has(String(p.id)));
      setProfiles(list);
      setIdx(0);
    } catch (e) {
      const code  = e.response?.data?.code       || '';
      const steps = e.response?.data?.trust_steps || [];
      setBlockCode(code);
      setBlockSteps(steps);
      if (code === 'TRUST_TOO_LOW') {
        setLoadError('Your profile needs a bit more to unlock Discovery.');
      } else if (code === 'PROFILE_INCOMPLETE') {
        setLoadError('Complete your profile to start discovering professionals.');
      } else {
        setLoadError(e.response?.data?.error || 'Could not load profiles. Tap to retry.');
      }
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { loadProfiles(); }, [loadProfiles]);

  async function handleConnect(profile) {
    if (!profile?.id) return;
    const id = String(profile.id);
    swipedIds.current.add(id);
    trackSwipe('right', id);
    setIdx(i => i + 1);
    try {
      const { data } = await api.post('/api/swipe', { targetId: profile.id, direction: 'right' });
      if (data?.match) { trackMatchMade(id); setMatchProfile(profile); }
    } catch (_) {}
  }

  async function handleSkip(profile) {
    if (!profile?.id) return;
    const id = String(profile.id);
    swipedIds.current.add(id);
    trackSwipe('left', id);
    setIdx(i => i + 1);
    try { await api.post('/api/swipe', { targetId: profile.id, direction: 'left' }); } catch (_) {}
  }

  function openProfile(profile) {
    const userId = profile?.id;
    if (!userId) {
      Alert.alert('Profile unavailable', 'Cannot open this profile right now.');
      return;
    }
    trackProfileOpen(String(userId));
    navigation.navigate('UserProfile', { userId });
  }

  async function handlePriorityMessage() {
    const profile = profiles[idx];
    if (!profile?.id || priorityBusy) return;
    setPriorityBusy(true);
    setPriorityErr('');
    try {
      const { data } = await api.post('/api/priority-message', { toUserId: profile.id });
      // Backend returns { ok: true, remaining: N } — no connectionId (priority msgs are one-way)
      if (!data?.ok) throw new Error(data?.error || 'Failed');
      trackMessageSent(String(profile.id), 'priority');
      // Show a success toast — priority messages are one-way, no chat to open
      setPriorityOk(`✓ Message sent to ${profile.name || 'them'}!`);
      setTimeout(() => setPriorityOk(''), 4000);
    } catch (e) {
      const msg = e.response?.data?.error || e.message || 'Could not send. Try again.';
      setPriorityErr(msg);
      setTimeout(() => setPriorityErr(''), 4000);
    } finally {
      setPriorityBusy(false);
    }
  }

  function applyFilters(f) {
    setFilters(f);
    setShowFilters(false);
    trackFilterApplied(f);
  }

  const filterCount = getFilterCount();

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView edges={['left', 'right']} style={s.screen}>
        <DiscoverHeader topPad={topPad} filterCount={filterCount} onFilters={() => setShowFilters(true)} />
        {isOffline && <OfflineBanner />}
        <View style={s.center}>
          <ActivityIndicator color={C.primary} size="large" />
          <Text style={s.loadingTxt}>Finding your matches</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (loadError) {
    const isProfileBlock = blockCode === 'TRUST_TOO_LOW' || blockCode === 'PROFILE_INCOMPLETE';
    return (
      <SafeAreaView edges={['left', 'right']} style={s.screen}>
        <DiscoverHeader topPad={topPad} filterCount={filterCount} onFilters={() => setShowFilters(true)} />
        {isOffline && <OfflineBanner />}
        <ScrollView contentContainerStyle={s.center} showsVerticalScrollIndicator={false}>
          <Text style={s.emptyIcon}>{isProfileBlock ? '◈' : '!'}</Text>
          <Text style={s.emptyH}>
            {isProfileBlock ? 'Unlock Discovery' : 'Something went wrong'}
          </Text>
          <Text style={s.emptySub}>{loadError}</Text>

          {/* Trust steps checklist — only shown for TRUST_TOO_LOW */}
          {blockCode === 'TRUST_TOO_LOW' && blockSteps.length > 0 && (
            <View style={s.stepsList}>
              {blockSteps.map((step, i) => (
                <View key={i} style={s.stepRow}>
                  <Text style={[s.stepDot, step.done && s.stepDotDone]}>
                    {step.done ? '✓' : '○'}
                  </Text>
                  <Text style={[s.stepTxt, step.done && s.stepTxtDone]}>{step.label}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={s.emptyActions}>
            {isProfileBlock ? (
              <TouchableOpacity
                style={s.emptyBtn}
                onPress={() => navigation.navigate('Profile')}>
                <Text style={s.emptyBtnTxt}>Complete Profile →</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.emptyBtn} onPress={loadProfiles}>
                <Text style={s.emptyBtnTxt}>Retry</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Empty ────────────────────────────────────────────────────────────────
  if (!profiles[idx]) {
    return (
      <SafeAreaView edges={['left', 'right']} style={s.screen}>
        <DiscoverHeader topPad={topPad} filterCount={filterCount} onFilters={() => setShowFilters(true)} />
        {isOffline && <OfflineBanner />}
        <View style={s.center}>
          <Text style={s.emptyIcon}>*</Text>
          <Text style={s.emptyH}>You're all caught up!</Text>
          <Text style={s.emptySub}>
            {filterCount > 0
              ? 'No profiles match your filters. Try adjusting them.'
              : 'No new profiles right now. Check back soon.'}
          </Text>
          <View style={s.emptyActions}>
            <TouchableOpacity style={s.emptyBtn} onPress={loadProfiles}>
              <Text style={s.emptyBtnTxt}>Refresh</Text>
            </TouchableOpacity>
            {filterCount > 0 && (
              <TouchableOpacity style={s.emptyBtnOut} onPress={() => setFilters(DEFAULT_FILTERS)}>
                <Text style={s.emptyBtnOutTxt}>Clear Filters</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        <FilterModal visible={showFilters} filters={filters} onApply={applyFilters} onClose={() => setShowFilters(false)} />
      </SafeAreaView>
    );
  }

  // ── Success ──────────────────────────────────────────────────────────────
  const currentProfile = profiles[idx];
  const nextProfile    = profiles[idx + 1];

  return (
    <SafeAreaView edges={['left', 'right']} style={s.screen}>
      <DiscoverHeader topPad={topPad} filterCount={filterCount} onFilters={() => setShowFilters(true)} />

      {isOffline && <OfflineBanner />}

      {!!priorityErr && (
        <View style={s.toast}><Text style={s.toastTxt}>{priorityErr}</Text></View>
      )}
      {!!priorityOk && (
        <View style={s.toastOk}><Text style={s.toastOkTxt}>{priorityOk}</Text></View>
      )}

      <View style={s.stack} pointerEvents="box-none">
        {nextProfile && (
          <View style={[s.card, s.cardBack]}>
            {(nextProfile.photos || [])[0]
              ? <Image source={{ uri: nextProfile.photos[0] }} style={s.cardImg} />
              : <View style={s.cardNoImg}><Text style={s.cardInit}>{initials(nextProfile.name)}</Text></View>
            }
            <View style={s.cardBody}>
              <Text style={s.cardName} numberOfLines={1}>{nextProfile.name}</Text>
            </View>
          </View>
        )}

        <SwipeCard
          key={currentProfile.id || idx}
          profile={currentProfile}
          isTop={true}
          onSwipeLeft={() => handleSkip(currentProfile)}
          onSwipeRight={() => handleConnect(currentProfile)}
          onOpenProfile={openProfile}
        />
      </View>

      <View style={s.actRow}>
        <TouchableOpacity
          style={[s.actBtn, s.actSkip]}
          onPress={() => SwipeCard.swipeLeft && SwipeCard.swipeLeft()}
          activeOpacity={0.75}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
          <Text style={s.actSkipTxt}>Skip</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.actBtn, s.actMsg]}
          onPress={handlePriorityMessage}
          disabled={priorityBusy}
          activeOpacity={0.8}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
          {priorityBusy
            ? <ActivityIndicator color={C.accent} size="small" />
            : <Text style={s.actMsgTxt}>Message</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.actBtn, s.actConnect]}
          onPress={() => SwipeCard.swipeRight && SwipeCard.swipeRight()}
          activeOpacity={0.85}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
          <Text style={s.actConnectTxt}>Connect</Text>
        </TouchableOpacity>
      </View>

      <FilterModal visible={showFilters} filters={filters} onApply={applyFilters} onClose={() => setShowFilters(false)} />
      <MatchModal
        profile={matchProfile}
        onClose={() => setMatchProfile(null)}
        onChat={() => { setMatchProfile(null); navigation.navigate('Chat'); }}
      />
    </SafeAreaView>
  );
}

// ── Stylesheets ─────────────────────────────────────────────────────────────
const ms = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card:        { backgroundColor: C.card, borderRadius: 24, padding: 28, alignItems: 'center', width: '100%', ...SHADOW },
  star:        { fontSize: 28, color: C.accent, marginBottom: 6 },
  label:       { fontSize: 12, color: C.primary, letterSpacing: 2, marginBottom: 16, fontWeight: '600' },
  avatar:      { width: 88, height: 88, borderRadius: 44, marginBottom: 12 },
  avatarFb:    { width: 88, height: 88, borderRadius: 44, backgroundColor: C.primaryLight, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatarInit:  { fontSize: 32, color: C.primary, fontWeight: '600' },
  name:        { fontSize: 22, color: C.text, fontWeight: '700', marginBottom: 4, textAlign: 'center' },
  sub:         { fontSize: 13, color: C.sub, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  row:         { flexDirection: 'row', gap: 12, width: '100%' },
  secondary:   { flex: 1, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: C.border2, alignItems: 'center' },
  secondaryTxt:{ fontSize: 14, color: C.sub },
  primary:     { flex: 1, padding: 14, borderRadius: 14, backgroundColor: C.primary, alignItems: 'center' },
  primaryTxt:  { fontSize: 14, color: '#fff', fontWeight: '600' },
});

const fm = StyleSheet.create({
  backdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  container:   { backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%', paddingBottom: Platform.OS === 'ios' ? 34 : 20 },
  handle:      { width: 40, height: 4, backgroundColor: C.border2, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 8 },
  topBar:      { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  heading:     { fontSize: 18, color: C.text, fontWeight: '700' },
  scroll:      { paddingHorizontal: 20 },
  section:     { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  sectionHdr:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  secTitle:    { fontSize: 14, color: C.text, fontWeight: '600', marginBottom: 10 },
  chevron:     { fontSize: 12, color: C.primary },
  sectionBody: { marginTop: 4 },
  chips:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:        { height: 36, paddingHorizontal: 14, borderRadius: 20, backgroundColor: C.bgSec, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border },
  chipOn:      { backgroundColor: C.primary, borderColor: C.primary },
  chipTxt:     { fontSize: 13, color: C.sub },
  chipTxtOn:   { color: '#fff', fontWeight: '500' },
  stickyBar:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.bg },
  resetTxt:    { color: C.sub, fontSize: 14 },
  applyBtn:    { backgroundColor: C.primary, borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14 },
  applyTxt:    { color: '#fff', fontSize: 14, fontWeight: '600' },
});

const s = StyleSheet.create({
  screen:        { flex: 1, backgroundColor: C.bg },
  center:        { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, backgroundColor: C.bg },
  filterBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.card, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: C.border, minHeight: 44, ...SHADOW },
  filterBtnOn:   { borderColor: C.primary, backgroundColor: C.primaryLight },
  filterTxt:     { color: C.sub, fontSize: 13 },
  filterTxtOn:   { color: C.primary, fontWeight: '600' },
  filterCount:   { backgroundColor: C.primary, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1, minWidth: 18, alignItems: 'center' },
  filterCountTxt:{ color: '#fff', fontSize: 10, fontWeight: '700' },
  loadingTxt:    { color: C.sub, fontSize: 13, marginTop: 12 },
  toast:         { marginHorizontal: 16, marginBottom: 6, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' },
  toastTxt:      { color: C.danger, fontSize: 13, textAlign: 'center' },
  toastOk:       { marginHorizontal: 16, marginBottom: 6, backgroundColor: C.primaryLight, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: 'rgba(15,118,110,0.25)' },
  toastOkTxt:    { color: C.primary, fontSize: 13, textAlign: 'center', fontWeight: '500' },
  stack:         { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card:          { position: 'absolute', width: W - 32, height: CARD_HEIGHT, backgroundColor: C.card, borderRadius: 16, overflow: 'hidden', ...SHADOW },
  cardBack:      { transform: [{ scale: 0.95 }, { translateY: 10 }], opacity: 0.85 },
  cardImg:       { width: '100%', height: '60%', resizeMode: 'cover' },
  cardNoImg:     { width: '100%', height: '60%', backgroundColor: C.primaryLight, justifyContent: 'center', alignItems: 'center' },
  cardInit:      { fontSize: 56, color: C.primary },
  overlayLabel:  { position: 'absolute', top: 24, zIndex: 10, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, borderWidth: 2 },
  overlayRight:  { right: 16, borderColor: C.primary },
  overlayLeft:   { left: 16, borderColor: C.danger },
  overlayTxt:    { fontSize: 18, fontWeight: '800', letterSpacing: 1 },
  verifiedBadge: { position: 'absolute', top: 14, left: 14, backgroundColor: 'rgba(34,197,94,0.9)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  verifiedTxt:   { color: '#fff', fontSize: 11, fontWeight: '600' },
  onlineDot:     { position: 'absolute', top: 14, right: 14, width: 12, height: 12, borderRadius: 6, backgroundColor: C.green, borderWidth: 2, borderColor: C.card },
  cardBody:      { padding: 16 },
  topRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  cardName:      { fontSize: 20, color: C.text, fontWeight: '600', marginBottom: 3 },
  cardRole:      { fontSize: 14, color: C.sub },
  matchBox:      { backgroundColor: C.primaryLight, borderRadius: 10, padding: 8, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(15,118,110,0.2)', minWidth: 52 },
  matchPct:      { fontSize: 18, color: C.primary, fontWeight: '700' },
  matchLbl:      { fontSize: 9, color: C.sub },
  pills:         { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  pill:          { backgroundColor: C.bgSec, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: C.border },
  pillTxt:       { fontSize: 12, color: C.sub },
  insight:       { fontSize: 13, color: C.sub, lineHeight: 18 },
  actRow:        { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 12, paddingBottom: Platform.OS === 'ios' ? 8 : 12 },
  actBtn:        { borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  actSkip:       { flex: 0.7, borderWidth: 1, borderColor: C.border2, backgroundColor: C.card },
  actSkipTxt:    { fontSize: 15, color: C.sub },
  actMsg:        { flex: 0.9, borderWidth: 1.5, borderColor: C.accent, backgroundColor: C.accentLight },
  actMsgTxt:     { fontSize: 14, color: C.accent, fontWeight: '600' },
  actConnect:    { flex: 1.2, backgroundColor: C.primary },
  actConnectTxt: { fontSize: 15, color: '#fff', fontWeight: '700' },
  emptyIcon:     { fontSize: 40, marginBottom: 14, color: C.dim },
  emptyH:        { fontSize: 22, color: C.text, marginBottom: 8, fontWeight: '700', textAlign: 'center' },
  emptySub:      { fontSize: 15, color: C.sub, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  emptyActions:  { gap: 10, width: '80%' },
  emptyBtn:      { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', minHeight: 44, ...SHADOW },
  emptyBtnTxt:   { color: '#fff', fontSize: 15, fontWeight: '600' },
  emptyBtnOut:   { borderWidth: 1.5, borderColor: C.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', minHeight: 44 },
  emptyBtnOutTxt:{ color: C.primary, fontSize: 15, fontWeight: '600' },

  // Trust-steps checklist (TRUST_TOO_LOW error state)
  stepsList:     { width: '100%', backgroundColor: C.card, borderRadius: 14, padding: 16,
                   marginBottom: 24, borderWidth: 1, borderColor: C.border, ...SHADOW },
  stepRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  stepDot:       { fontSize: 15, color: C.dim, width: 20, textAlign: 'center' },
  stepDotDone:   { color: C.primary },
  stepTxt:       { fontSize: 13, color: C.sub, flex: 1 },
  stepTxtDone:   { color: C.text, textDecorationLine: 'line-through' },
});
