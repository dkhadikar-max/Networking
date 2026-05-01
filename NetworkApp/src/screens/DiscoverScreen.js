import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet, ActivityIndicator,
  PanResponder, Animated, Dimensions, ScrollView, Modal
} from 'react-native';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { C } from '../utils/theme';

const { width: W } = Dimensions.get('window');
const SWIPE_THRESHOLD = 100;

const INTENT_LABELS = {
  'explore-network':'Exploring network','exchange-ideas':'Exchanging ideas',
  'learn-mentorship':'Learning / Mentorship','build-relationships':'Building relationships',
  'collaborate':'Looking to collaborate'
};

function initials(name) {
  return (name||'?').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
}

// ── MATCH MODAL ───────────────────────────────────────────────────────────────
function MatchModal({ profile, onClose, onChat }) {
  if (!profile) return null;
  const photo = (profile.photos||[])[0];
  return (
    <Modal transparent animationType="fade" visible={!!profile} onRequestClose={onClose}>
      <View style={ms.overlay}>
        <View style={ms.card}>
          <Text style={ms.star}>✦</Text>
          <Text style={ms.label}>IT'S A MATCH</Text>

          {photo
            ? <Image source={{ uri: photo }} style={ms.avatar} />
            : <View style={ms.avatarFallback}>
                <Text style={ms.avatarInit}>{initials(profile.name)}</Text>
              </View>
          }

          <Text style={ms.name}>{profile.name}</Text>
          {profile.matchScore ? (
            <Text style={ms.score}>{profile.matchScore}% compatibility</Text>
          ) : null}

          <Text style={ms.sub}>
            You both connected. Send the first message within 48 hours to keep this match alive.
          </Text>

          <View style={ms.actions}>
            <TouchableOpacity style={ms.btnSecondary} onPress={onClose}>
              <Text style={ms.btnSecondaryTxt}>Keep swiping</Text>
            </TouchableOpacity>
            <TouchableOpacity style={ms.btnPrimary} onPress={onChat}>
              <Text style={ms.btnPrimaryTxt}>Say hello →</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── SWIPE CARD ────────────────────────────────────────────────────────────────
function SwipeCard({ profile, onSwipe, isTop }) {
  const pos = useRef(new Animated.ValueXY()).current;
  const rotate = pos.x.interpolate({ inputRange:[-W/2,0,W/2], outputRange:['-15deg','0deg','15deg'] });
  const rightOpacity = pos.x.interpolate({ inputRange:[0,SWIPE_THRESHOLD], outputRange:[0,1], extrapolate:'clamp' });
  const leftOpacity  = pos.x.interpolate({ inputRange:[-SWIPE_THRESHOLD,0], outputRange:[1,0], extrapolate:'clamp' });

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => isTop,
    onMoveShouldSetPanResponder: () => isTop,
    onPanResponderMove: Animated.event([null,{dx:pos.x,dy:pos.y}],{useNativeDriver:false}),
    onPanResponderRelease: (_, {dx}) => {
      if (dx > SWIPE_THRESHOLD)       { Animated.timing(pos,{toValue:{x:W*1.5,y:0},duration:250,useNativeDriver:false}).start(()=>onSwipe('right')); }
      else if (dx < -SWIPE_THRESHOLD) { Animated.timing(pos,{toValue:{x:-W*1.5,y:0},duration:250,useNativeDriver:false}).start(()=>onSwipe('left')); }
      else { Animated.spring(pos,{toValue:{x:0,y:0},useNativeDriver:false}).start(); }
    }
  })).current;

  const photo = (profile.photos||[])[0];

  return (
    <Animated.View
      style={[s.card, isTop && { transform:[{translateX:pos.x},{translateY:pos.y},{rotate}], zIndex:10 }]}
      {...(isTop ? panResponder.panHandlers : {})}>
      {/* Swipe hints */}
      {isTop && (
        <>
          <Animated.View style={[s.hint,s.hintRight,{opacity:rightOpacity}]}><Text style={s.hintTxtR}>Connect</Text></Animated.View>
          <Animated.View style={[s.hint,s.hintLeft, {opacity:leftOpacity}]}><Text style={s.hintTxtL}>Skip</Text></Animated.View>
        </>
      )}
      {photo
        ? <Image source={{uri: photo}} style={s.cardImg} />
        : <View style={s.cardNoImg}><Text style={s.cardInitials}>{initials(profile.name)}</Text></View>
      }
      {/* Verified badge overlay on photo */}
      {profile.verification?.status === 'verified' && (
        <View style={s.verifiedBadge}>
          <Text style={s.verifiedTxt}>✓ Verified</Text>
        </View>
      )}
      {/* Online dot */}
      {profile.is_recently_active && (
        <View style={s.onlineDot} />
      )}
      <View style={s.cardBody}>
        <View style={s.cardRow}>
          <View style={{flex:1}}>
            <View style={s.nameRow}>
              <Text style={s.cardName}>{profile.name||''}</Text>
              {profile.verification?.status === 'verified' && (
                <Text style={s.verifiedIcon}>✓</Text>
              )}
            </View>
            {profile.location ? <Text style={s.cardLoc}>📍 {profile.location}{profile.distance != null ? ` · ${profile.distance}km` : ''}</Text> : null}
          </View>
          {profile.matchScore ? (
            <View style={s.matchBox}>
              <Text style={s.matchPct}>{profile.matchScore}</Text>
              <Text style={s.matchLbl}>match</Text>
            </View>
          ) : null}
        </View>
        {profile.currently_exploring ? (
          <Text style={s.exploring}><Text style={{color:C.sub}}>Exploring: </Text>{profile.currently_exploring}</Text>
        ) : null}
        {profile.intent ? <Text style={s.intentBadge}>{INTENT_LABELS[profile.intent]||profile.intent}</Text> : null}
        {(profile.skills||[]).length > 0 ? (
          <View style={s.pills}>
            {(profile.skills||[]).slice(0,4).map(sk => (
              <View key={sk} style={s.pill}><Text style={s.pillTxt}>{sk}</Text></View>
            ))}
          </View>
        ) : null}
        {profile.insight ? (
          <View style={s.insight}><Text style={s.insightTxt}>✦ {profile.insight}</Text></View>
        ) : null}
        <View style={s.actions}>
          <TouchableOpacity style={[s.actBtn,s.actSkip]} onPress={()=>onSwipe('left')}>
            <Text style={{color:C.sub,fontWeight:'600'}}>Skip</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.actBtn,s.actConnect]} onPress={()=>onSwipe('right')}>
            <Text style={{color:C.bg,fontWeight:'700'}}>Connect</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

// ── DISCOVER SCREEN ───────────────────────────────────────────────────────────
export default function DiscoverScreen({ navigation }) {
  const { user } = useAuth();
  const [profiles,      setProfiles]      = useState([]);
  const [idx,           setIdx]           = useState(0);
  const [loading,       setLoading]       = useState(true);
  const [limited,       setLimited]       = useState(false);
  const [matchedProfile, setMatchedProfile] = useState(null);
  const [matchConnId,   setMatchConnId]   = useState(null);

  useEffect(() => { loadProfiles(); }, []);

  async function loadProfiles() {
    setLoading(true);
    try {
      const { data } = await api.get('/api/discover');
      if (data.limited) { setLimited(true); return; }
      setProfiles(data.profiles || []);
      setIdx(0);
    } catch (e) { /* handled by empty state */ }
    finally { setLoading(false); }
  }

  async function handleSwipe(profile, direction) {
    setIdx(i => i + 1);
    try {
      const { data } = await api.post('/api/swipe', { targetId: profile.id, direction });
      if (data.match) {
        setMatchedProfile(profile);
        setMatchConnId(data.connectionId);
      }
    } catch {}
  }

  function handleMatchClose() {
    setMatchedProfile(null);
    setMatchConnId(null);
  }

  function handleMatchChat() {
    setMatchedProfile(null);
    navigation.navigate('Connections');
  }

  if (loading) return (
    <View style={s.center}><ActivityIndicator color={C.gold} size="large" /></View>
  );
  if (limited) return (
    <View style={s.center}>
      <Text style={s.emptyIcon}>◎</Text>
      <Text style={s.emptyH}>Daily limit reached</Text>
      <Text style={s.emptySub}>Come back tomorrow for more profiles.</Text>
    </View>
  );

  const visible = profiles.slice(idx, idx + 2);
  if (!visible.length) return (
    <View style={s.center}>
      <Text style={s.emptyIcon}>◎</Text>
      <Text style={s.emptyH}>All caught up</Text>
      <Text style={s.emptySub}>No more profiles right now.</Text>
      <TouchableOpacity style={s.reloadBtn} onPress={loadProfiles}>
        <Text style={{color:C.gold,fontWeight:'600'}}>Refresh</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={s.screen}>
      <View style={s.header}>
        <Text style={s.title}>Discover</Text>
      </View>
      <View style={s.stack}>
        {[...visible].reverse().map((p, i) => (
          <SwipeCard
            key={p.id} profile={p}
            isTop={i === visible.length - 1}
            onSwipe={(dir) => handleSwipe(p, dir)}
          />
        ))}
      </View>

      <MatchModal
        profile={matchedProfile}
        onClose={handleMatchClose}
        onChat={handleMatchChat}
      />
    </View>
  );
}

// ── MATCH MODAL STYLES ────────────────────────────────────────────────────────
const ms = StyleSheet.create({
  overlay:        { flex:1, backgroundColor:'rgba(0,0,0,0.85)', justifyContent:'center', alignItems:'center', padding:24 },
  card:           { backgroundColor:C.sur, borderWidth:1, borderColor:C.border, borderRadius:20, padding:28, alignItems:'center', width:'100%', maxWidth:360 },
  star:           { fontSize:28, color:C.gold, marginBottom:10 },
  label:          { fontSize:10, fontWeight:'700', letterSpacing:3, color:C.sub, marginBottom:18 },
  avatar:         { width:90, height:90, borderRadius:45, borderWidth:3, borderColor:C.gold, marginBottom:12 },
  avatarFallback: { width:90, height:90, borderRadius:45, borderWidth:3, borderColor:C.gold, backgroundColor:C.sur2, justifyContent:'center', alignItems:'center', marginBottom:12 },
  avatarInit:     { fontSize:32, color:C.gold, fontWeight:'700' },
  name:           { fontSize:22, fontWeight:'700', color:C.text, marginBottom:4 },
  score:          { fontSize:13, color:C.gold, fontWeight:'600', marginBottom:14 },
  sub:            { fontSize:13, color:C.sub, lineHeight:20, textAlign:'center', marginBottom:24 },
  actions:        { flexDirection:'row', gap:10, width:'100%' },
  btnPrimary:     { flex:1, backgroundColor:C.gold, borderRadius:10, padding:13, alignItems:'center' },
  btnPrimaryTxt:  { color:C.bg, fontWeight:'700', fontSize:14 },
  btnSecondary:   { flex:1, backgroundColor:C.sur2, borderWidth:1, borderColor:C.border2, borderRadius:10, padding:13, alignItems:'center' },
  btnSecondaryTxt:{ color:C.sub, fontWeight:'600', fontSize:14 },
});

// ── CARD STYLES ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen:  { flex:1, backgroundColor:C.bg },
  center:  { flex:1, backgroundColor:C.bg, justifyContent:'center', alignItems:'center', padding:24 },
  header:  { flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:20, paddingTop:16 },
  title:   { fontSize:22, fontWeight:'700', color:C.text },
  stack:   { flex:1, alignItems:'center', justifyContent:'center' },
  card:    { position:'absolute', width:W-32, backgroundColor:C.sur, borderWidth:1, borderColor:C.border, borderRadius:16, overflow:'hidden', shadowColor:'#000', shadowOpacity:.4, shadowRadius:20, shadowOffset:{width:0,height:8} },
  hint:    { position:'absolute', top:20, paddingHorizontal:14, paddingVertical:6, borderRadius:20, zIndex:20 },
  hintRight:{ right:20, backgroundColor:'rgba(198,168,107,0.15)', borderWidth:1, borderColor:C.gold },
  hintLeft: { left:20, backgroundColor:'rgba(192,57,43,0.12)', borderWidth:1, borderColor:C.danger },
  hintTxtR: { color:C.gold, fontWeight:'700', fontSize:13 },
  hintTxtL: { color:C.danger, fontWeight:'700', fontSize:13 },
  cardImg:  { width:'100%', height:200, resizeMode:'cover' },
  cardNoImg:{ width:'100%', height:180, backgroundColor:C.sur2, justifyContent:'center', alignItems:'center' },
  cardInitials:{ fontSize:52, color:C.gold, fontWeight:'700' },
  verifiedBadge:{ position:'absolute', top:10, left:10, backgroundColor:'rgba(34,197,94,0.9)', borderRadius:20, paddingHorizontal:10, paddingVertical:4, zIndex:5 },
  verifiedTxt:{ color:'#fff', fontSize:11, fontWeight:'700' },
  onlineDot:{ position:'absolute', top:10, right:10, width:12, height:12, borderRadius:6, backgroundColor:'#22c55e', borderWidth:2, borderColor:C.sur, zIndex:5 },
  nameRow:  { flexDirection:'row', alignItems:'center', gap:6 },
  verifiedIcon:{ color:'#22c55e', fontSize:14, fontWeight:'700' },
  cardBody: { padding:16 },
  cardRow:  { flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 },
  cardName: { fontSize:18, fontWeight:'700', color:C.text },
  cardLoc:  { fontSize:12, color:C.sub, marginTop:2 },
  matchBox: { backgroundColor:C.goldBg, borderRadius:10, padding:8, alignItems:'center' },
  matchPct: { fontSize:22, color:C.gold, fontWeight:'700' },
  matchLbl: { fontSize:10, color:C.sub, textTransform:'uppercase', letterSpacing:0.8 },
  exploring:{ fontSize:13, color:C.text, marginBottom:8, lineHeight:19 },
  intentBadge:{ fontSize:11, color:C.sub, borderWidth:1, borderColor:C.border2, borderRadius:20, paddingHorizontal:10, paddingVertical:4, alignSelf:'flex-start', marginBottom:10 },
  pills:   { flexDirection:'row', flexWrap:'wrap', gap:5, marginBottom:10 },
  pill:    { backgroundColor:C.sur2, borderWidth:1, borderColor:C.border, borderRadius:20, paddingHorizontal:9, paddingVertical:3 },
  pillTxt: { fontSize:11, color:C.sub },
  insight: { backgroundColor:C.goldBg, borderLeftWidth:2, borderLeftColor:C.gold, borderRadius:6, padding:10, marginBottom:14 },
  insightTxt:{ fontSize:12, color:C.sub, lineHeight:18 },
  actions: { flexDirection:'row', gap:10 },
  actBtn:  { flex:1, padding:13, borderRadius:10, alignItems:'center' },
  actSkip: { backgroundColor:C.sur2, borderWidth:1, borderColor:C.border2 },
  actConnect:{ backgroundColor:C.gold },
  emptyIcon:{ fontSize:40, marginBottom:14, color:C.sub },
  emptyH:  { fontSize:20, fontWeight:'700', color:C.text, marginBottom:8 },
  emptySub:{ fontSize:14, color:C.sub, textAlign:'center', lineHeight:20 },
  reloadBtn:{ marginTop:20, padding:12, borderWidth:1, borderColor:C.gold, borderRadius:10, paddingHorizontal:24 },
});
