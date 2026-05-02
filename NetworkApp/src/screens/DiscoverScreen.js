import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet,
  ActivityIndicator, Dimensions, Modal, ScrollView, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Swiper from 'react-native-deck-swiper';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { C, SHADOW } from '../utils/theme';

const { width: W, height: H } = Dimensions.get('window');
const CARD_HEIGHT = H * 0.68;

const DEFAULT_FILTERS = { sort: 'relevance', radius: '', intent: '', interest: '' };

const INTENT_LABELS = {
  'explore-network':    'Exploring network',
  'exchange-ideas':     'Exchanging ideas',
  'learn-mentorship':   'Learning / Mentorship',
  'build-relationships':'Building relationships',
  'collaborate':        'Looking to collaborate',
  'find-cofounder':     'Finding co-founder',
  'find-mentor':        'Finding mentor',
  'hire':               'Hiring talent',
  'find-investors':     'Finding investors',
};

const INTEREST_OPTIONS = [
  'AI / ML','Startups','SaaS','Fintech','Design','Marketing','Web3','Climate Tech',
  'Health Tech','Edtech','Open Source','Product Management','Sales','VC / Investing','Engineering',
];

function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// ── Match modal ────────────────────────────────────────────────────────────────
function MatchModal({ profile, onClose, onChat }) {
  if (!profile) return null;
  const photo = (profile.photos || [])[0];
  return (
    <Modal transparent animationType="fade" visible={!!profile} onRequestClose={onClose}>
      <View style={ms.overlay}>
        <View style={ms.card}>
          <Text style={ms.star}>✦</Text>
          <Text style={ms.label}>IT'S A MATCH</Text>
          {photo
            ? <Image source={{ uri: photo }} style={ms.avatar} />
            : <View style={ms.avatarFb}><Text style={ms.avatarInit}>{initials(profile.name)}</Text></View>
          }
          <Text style={ms.name}>{profile.name}</Text>
          {profile.matchScore ? <Text style={ms.score}>{profile.matchScore}% compatibility</Text> : null}
          <Text style={ms.sub}>You both connected! Send a message within 48 hours.</Text>
          <View style={ms.row}>
            <TouchableOpacity style={ms.secondary} onPress={onClose} activeOpacity={0.75}>
              <Text style={ms.secondaryTxt}>Keep swiping</Text>
            </TouchableOpacity>
            <TouchableOpacity style={ms.primary} onPress={onChat} activeOpacity={0.85}>
              <Text style={ms.primaryTxt}>Say hello</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Filter modal ───────────────────────────────────────────────────────────────
function FilterModal({ visible, filters, onApply, onClose }) {
  const [local,    setLocal]    = React.useState({ ...filters });
  const [expanded, setExpanded] = React.useState({ sort:true, distance:true, goal:true, interests:true });
  const [showMore, setShowMore] = React.useState({ goal:false, interests:false });

  React.useEffect(() => { if (visible) setLocal({ ...filters }); }, [visible]);

  function toggle(key, val) {
    setLocal(p => ({ ...p, [key]: p[key] === val ? '' : val }));
  }
  function toggleSection(k) { setExpanded(p => ({ ...p, [k]: !p[k] })); }

  const SORTS = [
    { value:'relevance', label:'Best Match' },
    { value:'recent',    label:'Most Recent' },
    { value:'distance',  label:'Nearest' },
  ];
  const RADII = [
    { value:'10', label:'10 km' },
    { value:'25', label:'25 km' },
    { value:'50', label:'50 km' },
    { value:'',   label:'Any' },
  ];
  const INTENT_ENTRIES  = Object.entries(INTENT_LABELS);
  const visibleGoals     = showMore.goal      ? INTENT_ENTRIES   : INTENT_ENTRIES.slice(0, 5);
  const visibleInterests = showMore.interests ? INTEREST_OPTIONS : INTEREST_OPTIONS.slice(0, 5);

  function Section({ sectionKey, title, children }) {
    const open = expanded[sectionKey];
    return (
      <View style={fm.section}>
        <TouchableOpacity style={fm.sectionHdr} onPress={() => toggleSection(sectionKey)} activeOpacity={0.7}>
          <Text style={fm.secTitle}>{title}</Text>
          <Text style={fm.chevron}>{open ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {open && <View style={fm.sectionBody}>{children}</View>}
      </View>
    );
  }

  function ChipRow({ items, valueKey, labelKey, stateKey }) {
    return (
      <View style={fm.chips}>
        {items.map(item => {
          const val = valueKey ? item[valueKey] : item;
          const lbl = labelKey ? item[labelKey] : item;
          const on  = local[stateKey] === val;
          return (
            <TouchableOpacity
              key={val} activeOpacity={0.75}
              style={[fm.chip, on && fm.chipOn]}
              onPress={() => toggle(stateKey, val)}>
              <Text style={[fm.chipTxt, on && fm.chipTxtOn]}>{lbl}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  const activeCount = [
    local.sort && local.sort !== 'relevance',
    local.radius, local.intent, local.interest,
  ].filter(Boolean).length;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={fm.backdrop}>
        <View style={fm.container}>
          <View style={fm.handle} />
          <View style={fm.topBar}>
            <Text style={fm.heading}>Filters</Text>
            {activeCount > 0 && (
              <View style={fm.badge}><Text style={fm.badgeTxt}>{activeCount} active</Text></View>
            )}
          </View>

          <ScrollView style={fm.scroll} showsVerticalScrollIndicator={false}>
            <Section sectionKey="sort" title="Sort by">
              <ChipRow items={SORTS} valueKey="value" labelKey="label" stateKey="sort" />
            </Section>
            <Section sectionKey="distance" title="Distance">
              <ChipRow items={RADII} valueKey="value" labelKey="label" stateKey="radius" />
            </Section>
            <Section sectionKey="goal" title="Goal">
              <ChipRow
                items={visibleGoals.map(([v, l]) => ({ value: v, label: l }))}
                valueKey="value" labelKey="label" stateKey="intent" />
              {!showMore.goal && INTENT_ENTRIES.length > 5 && (
                <TouchableOpacity style={fm.viewMore} onPress={() => setShowMore(p => ({ ...p, goal:true }))}>
                  <Text style={fm.viewMoreTxt}>View {INTENT_ENTRIES.length - 5} more ▼</Text>
                </TouchableOpacity>
              )}
            </Section>
            <Section sectionKey="interests" title="Interests">
              <ChipRow items={visibleInterests} stateKey="interest" />
              {!showMore.interests && INTEREST_OPTIONS.length > 5 && (
                <TouchableOpacity style={fm.viewMore} onPress={() => setShowMore(p => ({ ...p, interests:true }))}>
                  <Text style={fm.viewMoreTxt}>View {INTEREST_OPTIONS.length - 5} more ▼</Text>
                </TouchableOpacity>
              )}
            </Section>
            <View style={{ height:100 }} />
          </ScrollView>

          <View style={fm.stickyBar}>
            <TouchableOpacity onPress={() => { const f = { ...DEFAULT_FILTERS }; setLocal(f); onApply(f); }}>
              <Text style={fm.resetTxt}>Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity style={fm.applyBtn} onPress={() => onApply(local)} activeOpacity={0.85}>
              <Text style={fm.applyTxt}>Apply Filters</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Profile card ───────────────────────────────────────────────────────────────
function ProfileCard({ card, onOpenProfile }) {
  if (!card) return null;
  const photo  = (card.photos || [])[0];
  const tags   = [...(card.interests || []), ...(card.skills || [])].slice(0, 2);

  return (
    <TouchableOpacity
      style={s.card}
      activeOpacity={0.96}
      onPress={() => onOpenProfile(card)}>

      {photo
        ? <Image source={{ uri: photo }} style={s.cardImg} />
        : <View style={s.cardNoImg}><Text style={s.cardInit}>{initials(card.name)}</Text></View>
      }

      {card.verification?.status === 'verified' && (
        <View style={s.verifiedBadge}><Text style={s.verifiedTxt}>✓ Verified</Text></View>
      )}
      {card.is_recently_active && <View style={s.onlineDot} />}

      <View style={s.cardBody}>
        <View style={s.topRow}>
          <View style={{ flex:1, marginRight:8 }}>
            <Text style={s.cardName} numberOfLines={1}>{card.name || '—'}</Text>
            <Text style={s.cardRole} numberOfLines={1}>
              {card.intent ? (INTENT_LABELS[card.intent] || card.intent) : (card.location || '')}
            </Text>
          </View>
          {card.matchScore ? (
            <View style={s.matchBox}>
              <Text style={s.matchPct}>{card.matchScore}%</Text>
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

        {(card.insight || card.bio) ? (
          <Text style={s.insight} numberOfLines={1}>
            {card.insight ? `💡 ${card.insight}` : card.bio}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────
export default function DiscoverScreen({ navigation }) {
  const { user } = useAuth();
  const insets   = useSafeAreaInsets();

  const [profiles,     setProfiles]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [trustBlocked, setTrustBlocked] = useState(false);
  const [limitHit,     setLimitHit]     = useState(false);
  const [exhausted,    setExhausted]    = useState(false);
  const [matchProfile, setMatchProfile] = useState(null);
  const [showFilters,  setShowFilters]  = useState(false);
  const [filters,      setFilters]      = useState({ ...DEFAULT_FILTERS });
  const [priorityBusy, setPriorityBusy] = useState(false);
  const [priorityErr,  setPriorityErr]  = useState('');

  const swiperRef = useRef(null);

  const activeFilters = [
    filters.sort && filters.sort !== 'relevance',
    filters.radius, filters.intent, filters.interest,
  ].filter(Boolean).length;

  useEffect(() => { loadProfiles(filters); }, []);

  async function loadProfiles(f) {
    setLoading(true);
    setTrustBlocked(false);
    setLimitHit(false);
    setExhausted(false);
    try {
      const params = {};
      if (f.sort && f.sort !== 'relevance') params.sort     = f.sort;
      if (f.radius)                          params.radius   = f.radius;
      if (f.intent)                          params.intent   = f.intent;
      if (f.interest)                        params.interest = f.interest;
      const { data } = await api.get('/api/discover', { params });
      if (data?.trustBlocked) { setTrustBlocked(true); return; }
      if (data?.limitHit)     { setLimitHit(true);     return; }
      const list = Array.isArray(data) ? data : (data?.profiles || []);
      setProfiles(list);
      if (!list.length) setExhausted(true);
    } catch (e) {
      console.log('[Discover] load error:', e?.response?.data || e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect(profileId) {
    if (!profileId) return;
    try {
      const { data } = await api.post('/api/swipe', { swipedId: profileId, direction: 'right' });
      if (data?.match) {
        const matched = profiles.find(p => p.id === profileId);
        if (matched) setMatchProfile(matched);
      }
    } catch (e) {
      console.log('[Discover] swipe right error:', e?.response?.data || e.message);
    }
  }

  async function handleSkip(profileId) {
    if (!profileId) return;
    try {
      await api.post('/api/swipe', { swipedId: profileId, direction: 'left' });
    } catch (e) {
      console.log('[Discover] swipe left error:', e?.response?.data || e.message);
    }
  }

  async function handlePriorityMessage(profile) {
    if (!profile?.id || priorityBusy) return;
    setPriorityBusy(true);
    setPriorityErr('');
    try {
      await api.post('/api/priority-message', { toUserId: profile.id });
      navigation.navigate('ChatScreen', { userId: profile.id, otherUser: profile });
    } catch (e) {
      const msg = e?.response?.data?.error || 'Could not send priority message. Try again.';
      setPriorityErr(msg);
      setTimeout(() => setPriorityErr(''), 4000);
    } finally {
      setPriorityBusy(false);
    }
  }

  function openProfile(profile) {
    if (!profile?.id) return;
    navigation.navigate('ProfileDetail', { userId: profile.id });
  }

  function applyFilters(f) {
    setFilters(f);
    setShowFilters(false);
    loadProfiles(f);
  }

  const headerPaddingTop = insets.top || (Platform.OS === 'ios' ? 44 : 24);
  const headerHeight     = 56 + headerPaddingTop;

  // ── Shared header ─────────────────────────────────────────────────────────────
  function Header() {
    return (
      <View style={[s.header, { paddingTop: headerPaddingTop, height: headerHeight }]}>
        <View>
          <Text style={s.title}>Discover</Text>
          {!loading && !trustBlocked && !limitHit && (
            <Text style={s.subtitle}>
              {profiles.length ? 'Swipe to connect' : 'No new people right now'}
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={[s.filterBtn, activeFilters > 0 && s.filterBtnOn]}
          onPress={() => setShowFilters(true)}
          activeOpacity={0.75}>
          <Text style={[s.filterTxt, activeFilters > 0 && s.filterTxtOn]}>Filters</Text>
          {activeFilters > 0 && (
            <View style={s.filterCount}><Text style={s.filterCountTxt}>{activeFilters}</Text></View>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView edges={['top','left','right']} style={s.screen}>
        <Header />
        <View style={s.center}>
          <ActivityIndicator color={C.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  // ── Trust blocked ──────────────────────────────────────────────────────────────
  if (trustBlocked) {
    return (
      <SafeAreaView edges={['top','left','right']} style={s.screen}>
        <Header />
        <View style={s.center}>
          <Text style={s.emptyIcon}>🔒</Text>
          <Text style={s.emptyH}>Discovery Locked</Text>
          <Text style={s.emptySub}>Complete your profile to unlock people discovery.</Text>
          <TouchableOpacity style={s.emptyBtn} onPress={() => navigation.navigate('Profile')} activeOpacity={0.85}>
            <Text style={s.emptyBtnTxt}>Complete Profile</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Daily limit ────────────────────────────────────────────────────────────────
  if (limitHit) {
    return (
      <SafeAreaView edges={['top','left','right']} style={s.screen}>
        <Header />
        <View style={s.center}>
          <Text style={s.emptyIcon}>◎</Text>
          <Text style={s.emptyH}>Daily limit reached</Text>
          <Text style={s.emptySub}>Come back tomorrow for more profiles.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Empty / exhausted ─────────────────────────────────────────────────────────
  if (!profiles.length || exhausted) {
    return (
      <SafeAreaView edges={['top','left','right']} style={s.screen}>
        <Header />
        <View style={s.center}>
          <Text style={s.emptyIcon}>◎</Text>
          <Text style={s.emptyH}>No new people right now</Text>
          <Text style={s.emptySub}>
            {activeFilters > 0
              ? 'No profiles match your filters.'
              : 'Check back soon — more people join daily.'}
          </Text>
          <View style={s.emptyActions}>
            <TouchableOpacity style={s.emptyBtn} onPress={() => loadProfiles(filters)} activeOpacity={0.85}>
              <Text style={s.emptyBtnTxt}>Boost Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.emptyBtnOut} onPress={() => setShowFilters(true)} activeOpacity={0.75}>
              <Text style={s.emptyBtnOutTxt}>Adjust Filters</Text>
            </TouchableOpacity>
          </View>
        </View>
        <FilterModal visible={showFilters} filters={filters} onApply={applyFilters} onClose={() => setShowFilters(false)} />
      </SafeAreaView>
    );
  }

  // ── Main swiper ───────────────────────────────────────────────────────────────
  return (
    <SafeAreaView edges={['top','left','right']} style={s.screen}>
      <Header />

      {!!priorityErr && (
        <View style={s.toast}><Text style={s.toastTxt}>{priorityErr}</Text></View>
      )}

      {/* Swiper — MUST NOT be inside ScrollView */}
      <View style={s.swiperWrap}>
        <Swiper
          ref={swiperRef}
          cards={profiles}
          keyExtractor={card => card?.id?.toString()}
          renderCard={card => (
            <ProfileCard
              card={card}
              onOpenProfile={openProfile}
            />
          )}
          onSwipedLeft={i  => handleSkip(profiles[i]?.id)}
          onSwipedRight={i => handleConnect(profiles[i]?.id)}
          onSwipedAll={() => setExhausted(true)}
          disableTopSwipe
          disableBottomSwipe
          verticalSwipe={false}
          stackSize={2}
          stackSeparation={12}
          stackScale={4}
          backgroundColor="transparent"
          cardVerticalMargin={0}
          cardHorizontalMargin={12}
          animateOverlayLabelsOpacity
          overlayLabels={{
            left: {
              title: 'SKIP',
              style: { label: { color: C.danger, fontSize: 22, fontWeight: '700' },
                       wrapper: { flexDirection:'column', alignItems:'flex-end',
                                  justifyContent:'flex-start', marginTop:24, marginLeft:-24 } },
            },
            right: {
              title: 'CONNECT',
              style: { label: { color: C.primary, fontSize: 22, fontWeight: '700' },
                       wrapper: { flexDirection:'column', alignItems:'flex-start',
                                  justifyContent:'flex-start', marginTop:24, marginRight:-24 } },
            },
          }}
        />
      </View>

      {/* Action buttons */}
      <View style={s.actRow}>
        <TouchableOpacity
          style={[s.actBtn, s.actSkip]}
          onPress={() => swiperRef.current?.swipeLeft()}
          activeOpacity={0.75}>
          <Text style={s.actSkipTxt}>Skip</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.actBtn, s.actMsg]}
          onPress={() => {
            const current = profiles[swiperRef.current?.state?.firstCardIndex ?? 0];
            handlePriorityMessage(current);
          }}
          disabled={priorityBusy}
          activeOpacity={0.8}>
          {priorityBusy
            ? <ActivityIndicator color={C.accent} size="small" />
            : <Text style={s.actMsgTxt}>⚡ Message</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.actBtn, s.actConnect]}
          onPress={() => swiperRef.current?.swipeRight()}
          activeOpacity={0.85}>
          <Text style={s.actConnectTxt}>Connect</Text>
        </TouchableOpacity>
      </View>

      <FilterModal
        visible={showFilters}
        filters={filters}
        onApply={applyFilters}
        onClose={() => setShowFilters(false)}
      />

      <MatchModal
        profile={matchProfile}
        onClose={() => setMatchProfile(null)}
        onChat={() => {
          setMatchProfile(null);
          navigation.navigate('Chat');
        }}
      />
    </SafeAreaView>
  );
}

// ── Stylesheets ────────────────────────────────────────────────────────────────

const ms = StyleSheet.create({
  overlay:     { flex:1, backgroundColor:'rgba(0,0,0,0.55)', justifyContent:'center', alignItems:'center', padding:24 },
  card:        { backgroundColor:C.card, borderRadius:24, padding:28, alignItems:'center', width:'100%', ...SHADOW },
  star:        { fontSize:28, color:C.accent, marginBottom:6 },
  label:       { fontSize:12, color:C.primary, letterSpacing:2, marginBottom:16, fontWeight:'600' },
  avatar:      { width:88, height:88, borderRadius:44, marginBottom:12 },
  avatarFb:    { width:88, height:88, borderRadius:44, backgroundColor:C.primaryLight,
                 justifyContent:'center', alignItems:'center', marginBottom:12 },
  avatarInit:  { fontSize:32, color:C.primary, fontWeight:'600' },
  name:        { fontSize:22, color:C.text, fontWeight:'700', marginBottom:4, textAlign:'center' },
  score:       { fontSize:13, color:C.sub, marginBottom:8 },
  sub:         { fontSize:13, color:C.sub, textAlign:'center', lineHeight:20, marginBottom:20 },
  row:         { flexDirection:'row', gap:12, width:'100%' },
  secondary:   { flex:1, padding:14, borderRadius:14, borderWidth:1, borderColor:C.border2, alignItems:'center' },
  secondaryTxt:{ fontSize:14, color:C.sub },
  primary:     { flex:1, padding:14, borderRadius:14, backgroundColor:C.primary, alignItems:'center' },
  primaryTxt:  { fontSize:14, color:'#fff', fontWeight:'600' },
});

const fm = StyleSheet.create({
  backdrop:    { flex:1, backgroundColor:'rgba(0,0,0,0.35)', justifyContent:'flex-end' },
  container:   { backgroundColor:C.bg, borderTopLeftRadius:24, borderTopRightRadius:24,
                 maxHeight:'90%', paddingBottom: Platform.OS==='ios' ? 34 : 20 },
  handle:      { width:40, height:4, backgroundColor:C.border2, borderRadius:2,
                 alignSelf:'center', marginTop:12, marginBottom:8 },
  topBar:      { flexDirection:'row', alignItems:'center', gap:10,
                 paddingHorizontal:20, paddingVertical:14,
                 borderBottomWidth:1, borderBottomColor:C.border },
  heading:     { fontSize:18, color:C.text, fontWeight:'700' },
  badge:       { backgroundColor:C.primary, borderRadius:10, paddingHorizontal:8, paddingVertical:2 },
  badgeTxt:    { color:'#fff', fontSize:11, fontWeight:'700' },
  scroll:      { paddingHorizontal:20 },
  section:     { paddingVertical:16, borderBottomWidth:1, borderBottomColor:C.border },
  sectionHdr:  { flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  secTitle:    { fontSize:14, color:C.text, fontWeight:'600' },
  chevron:     { fontSize:11, color:C.dim },
  sectionBody: { marginTop:12 },
  chips:       { flexDirection:'row', flexWrap:'wrap', gap:8 },
  chip:        { height:32, paddingHorizontal:14, borderRadius:20, backgroundColor:C.bgSec,
                 justifyContent:'center', alignItems:'center', borderWidth:1, borderColor:C.border },
  chipOn:      { backgroundColor:C.primary, borderColor:C.primary },
  chipTxt:     { fontSize:13, color:C.sub },
  chipTxtOn:   { color:'#fff', fontWeight:'500' },
  viewMore:    { marginTop:10 },
  viewMoreTxt: { color:C.primary, fontSize:12 },
  stickyBar:   { flexDirection:'row', justifyContent:'space-between', alignItems:'center',
                 padding:20, borderTopWidth:1, borderTopColor:C.border, backgroundColor:C.bg },
  resetTxt:    { color:C.sub, fontSize:14 },
  applyBtn:    { backgroundColor:C.primary, borderRadius:14, paddingHorizontal:32, paddingVertical:14 },
  applyTxt:    { color:'#fff', fontSize:14, fontWeight:'600' },
});

const s = StyleSheet.create({
  screen:      { flex:1, backgroundColor:C.bg },
  center:      { flex:1, justifyContent:'center', alignItems:'center', padding:24 },

  header:      { flexDirection:'row', justifyContent:'space-between', alignItems:'flex-end',
                 paddingHorizontal:16, paddingBottom:12, backgroundColor:C.bg },
  title:       { fontSize:28, color:C.text, fontWeight:'700' },
  subtitle:    { fontSize:12, color:C.sub, marginTop:2 },
  filterBtn:   { flexDirection:'row', alignItems:'center', gap:6, backgroundColor:C.card,
                 borderRadius:20, paddingHorizontal:14, paddingVertical:8,
                 borderWidth:1, borderColor:C.border, ...SHADOW },
  filterBtnOn: { borderColor:C.primary, backgroundColor:C.primaryLight },
  filterTxt:   { color:C.sub, fontSize:13 },
  filterTxtOn: { color:C.primary, fontWeight:'600' },
  filterCount: { backgroundColor:C.primary, borderRadius:10, paddingHorizontal:6,
                 paddingVertical:1, minWidth:18, alignItems:'center' },
  filterCountTxt:{ color:'#fff', fontSize:10, fontWeight:'700' },

  toast:       { marginHorizontal:16, marginBottom:6, backgroundColor:'rgba(239,68,68,0.1)',
                 borderRadius:10, padding:10, borderWidth:1, borderColor:'rgba(239,68,68,0.2)' },
  toastTxt:    { color:C.danger, fontSize:13, textAlign:'center' },

  swiperWrap:  { flex:1 },

  // Card — width controlled by Swiper's cardHorizontalMargin
  card:        { height:CARD_HEIGHT, backgroundColor:C.card, borderRadius:16,
                 overflow:'hidden', ...SHADOW },
  cardImg:     { width:'100%', height:'60%', resizeMode:'cover' },
  cardNoImg:   { width:'100%', height:'60%', backgroundColor:C.primaryLight,
                 justifyContent:'center', alignItems:'center' },
  cardInit:    { fontSize:56, color:C.primary, fontWeight:'300' },

  verifiedBadge:{ position:'absolute', top:14, left:14, backgroundColor:'rgba(34,197,94,0.9)',
                  borderRadius:20, paddingHorizontal:10, paddingVertical:4 },
  verifiedTxt:  { color:'#fff', fontSize:11, fontWeight:'600' },
  onlineDot:    { position:'absolute', top:14, right:14, width:12, height:12,
                  borderRadius:6, backgroundColor:C.green, borderWidth:2, borderColor:C.card },

  cardBody:    { padding:16 },
  topRow:      { flexDirection:'row', justifyContent:'space-between',
                 alignItems:'flex-start', marginBottom:10 },
  cardName:    { fontSize:20, color:C.text, fontWeight:'600', marginBottom:3 },
  cardRole:    { fontSize:14, color:C.sub },
  matchBox:    { backgroundColor:C.primaryLight, borderRadius:10, padding:8,
                 alignItems:'center', borderWidth:1, borderColor:'rgba(15,118,110,0.2)', minWidth:52 },
  matchPct:    { fontSize:18, color:C.primary, fontWeight:'700' },
  matchLbl:    { fontSize:9, color:C.sub },

  pills:       { flexDirection:'row', flexWrap:'wrap', gap:6, marginBottom:10 },
  pill:        { backgroundColor:C.bgSec, borderRadius:20, paddingHorizontal:10,
                 paddingVertical:4, borderWidth:1, borderColor:C.border },
  pillTxt:     { fontSize:12, color:C.sub },
  insight:     { fontSize:13, color:C.sub, lineHeight:18 },

  actRow:      { flexDirection:'row', gap:10, paddingHorizontal:16,
                 paddingVertical:14, paddingBottom: Platform.OS==='ios' ? 8 : 14 },
  actBtn:      { borderRadius:14, paddingVertical:14, alignItems:'center', justifyContent:'center' },
  actSkip:     { flex:0.7, borderWidth:1, borderColor:C.border2, backgroundColor:C.card },
  actSkipTxt:  { fontSize:15, color:C.sub },
  actMsg:      { flex:0.9, borderWidth:1.5, borderColor:C.accent,
                 backgroundColor:C.accentLight },
  actMsgTxt:   { fontSize:14, color:C.accent, fontWeight:'600' },
  actConnect:  { flex:1.2, backgroundColor:C.primary },
  actConnectTxt:{ fontSize:15, color:'#fff', fontWeight:'700' },

  emptyIcon:   { fontSize:44, marginBottom:14, color:C.dim },
  emptyH:      { fontSize:22, color:C.text, marginBottom:8, fontWeight:'700', textAlign:'center' },
  emptySub:    { fontSize:15, color:C.sub, textAlign:'center', lineHeight:22, marginBottom:24 },
  emptyActions:{ gap:10, width:'80%' },
  emptyBtn:    { backgroundColor:C.primary, borderRadius:14, paddingVertical:14,
                 alignItems:'center', ...SHADOW },
  emptyBtnTxt: { color:'#fff', fontSize:15, fontWeight:'600' },
  emptyBtnOut: { borderWidth:1.5, borderColor:C.primary, borderRadius:14,
                 paddingVertical:14, alignItems:'center' },
  emptyBtnOutTxt:{ color:C.primary, fontSize:15, fontWeight:'600' },
});
