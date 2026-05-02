import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, Image, ActivityIndicator,
  StyleSheet, TouchableOpacity,
} from 'react-native';
import api from '../utils/api';
import { C } from '../utils/theme';

function initials(name) {
  return (name||'?').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
}

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

export default function UserProfileScreen({ route, navigation }) {
  const { userId } = route.params || {};
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    if (!userId) { setError('No user ID provided'); setLoading(false); return; }
    load();
  }, [userId]);

  async function load() {
    try {
      const { data } = await api.get(`/api/profiles/${userId}`);
      setProfile(data);
      navigation.setOptions({ title: data.name || 'Profile' });
    } catch (e) {
      setError(e.response?.data?.error || 'Could not load profile');
    } finally {
      setLoading(false);
    }
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

  const photos = profile.photos || [];
  const skills = profile.skills || [];
  const interests = profile.interests || [];

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

      {/* Hero photo / avatar */}
      <View style={s.heroWrap}>
        {photos[0]
          ? <Image source={{uri:photos[0]}} style={s.hero} />
          : <View style={s.heroFallback}><Text style={s.heroInit}>{initials(profile.name)}</Text></View>
        }
        {profile.verification?.status === 'verified' && (
          <View style={s.verifiedBadge}><Text style={s.verifiedTxt}>✓ Verified</Text></View>
        )}
        {profile.is_recently_active && <View style={s.onlineDot} />}
      </View>

      {/* Name + intent */}
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

      {/* Bio */}
      {profile.bio ? (
        <View style={s.panel}>
          <Text style={s.panelTitle}>About</Text>
          <Text style={s.bioTxt}>{profile.bio}</Text>
        </View>
      ) : null}

      {/* Context fields */}
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
              <Image key={i} source={{uri:url}} style={s.photoThumb} />
            ))}
          </View>
        </View>
      ) : null}

    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen:       { flex:1, backgroundColor:C.bg },
  scroll:       { paddingBottom:40 },
  center:       { flex:1, justifyContent:'center', alignItems:'center', padding:32 },
  errorTxt:     { color:C.sub, fontSize:14, textAlign:'center', marginBottom:16 },
  backBtn:      { borderWidth:1, borderColor:C.border2, borderRadius:10, paddingHorizontal:24, paddingVertical:10 },
  backTxt:      { color:C.primary, fontSize:14 },

  heroWrap:     { position:'relative', width:'100%', height:280, backgroundColor:C.primaryLight },
  hero:         { width:'100%', height:280, resizeMode:'cover' },
  heroFallback: { width:'100%', height:280, justifyContent:'center', alignItems:'center', backgroundColor:C.primaryLight },
  heroInit:     { fontSize:72, color:C.primary },
  verifiedBadge:{ position:'absolute', bottom:14, left:14, backgroundColor:'rgba(34,197,94,0.9)',
                  borderRadius:20, paddingHorizontal:10, paddingVertical:4 },
  verifiedTxt:  { color:'#fff', fontSize:12 },
  onlineDot:    { position:'absolute', top:14, right:14, width:14, height:14, borderRadius:7,
                  backgroundColor:C.green, borderWidth:2, borderColor:C.bg },

  nameRow:      { flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start',
                  paddingHorizontal:20, paddingTop:20, paddingBottom:4 },
  name:         { fontSize:26, color:C.text, flex:1, fontWeight:'700' },
  scoreBox:     { backgroundColor:C.primaryLight, borderRadius:10, padding:8, alignItems:'center',
                  borderWidth:1, borderColor:'rgba(79,138,115,0.25)', marginLeft:12, minWidth:56 },
  scorePct:     { fontSize:18, color:C.primary, fontWeight:'700' },
  scoreLbl:     { fontSize:9, color:C.sub },

  location:     { fontSize:13, color:C.sub, paddingHorizontal:20, marginBottom:8 },
  intentBadge:  { marginHorizontal:20, marginBottom:16, backgroundColor:C.primaryLight, borderRadius:20,
                  paddingHorizontal:12, paddingVertical:5, alignSelf:'flex-start',
                  borderWidth:1, borderColor:'rgba(79,138,115,0.2)' },
  intentTxt:    { fontSize:12, color:C.primary, fontWeight:'500' },

  panel:        { backgroundColor:C.card, borderWidth:1, borderColor:C.border, borderRadius:16,
                  padding:16, marginHorizontal:16, marginBottom:12,
                  shadowColor:'#000', shadowOffset:{width:0,height:4},
                  shadowOpacity:0.06, shadowRadius:12, elevation:3 },
  panelTitle:   { fontSize:12, color:C.sub, letterSpacing:1, marginBottom:12,
                  textTransform:'uppercase', fontWeight:'600' },
  bioTxt:       { fontSize:15, color:C.text, lineHeight:23 },

  contextRow:   { marginBottom:10 },
  contextLabel: { fontSize:11, color:C.dim, letterSpacing:0.8, marginBottom:3 },
  contextVal:   { fontSize:14, color:C.text, lineHeight:20 },

  pills:        { flexDirection:'row', flexWrap:'wrap', gap:6 },
  pill:         { backgroundColor:C.bgSec, borderRadius:20, paddingHorizontal:10, paddingVertical:5,
                  borderWidth:1, borderColor:C.border },
  pillTxt:      { fontSize:12, color:C.sub },
  pillGold:     { backgroundColor:C.primaryLight, borderColor:'rgba(79,138,115,0.25)' },
  pillGoldTxt:  { fontSize:12, color:C.primary },

  photoGrid:    { flexDirection:'row', flexWrap:'wrap', gap:8 },
  photoThumb:   { width:90, height:90, borderRadius:8 },
});
