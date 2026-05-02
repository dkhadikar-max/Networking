import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet, ActivityIndicator,
  PanResponder, Animated, Dimensions, Modal, ScrollView, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { C } from '../utils/theme';

const { width: W } = Dimensions.get('window');
const SWIPE_THRESHOLD = 100;
const DEFAULT_FILTERS = { sort: 'relevance', radius: '', intent: '', interest: '' };

const INTENT_LABELS = {
  'explore-network':'Exploring network','exchange-ideas':'Exchanging ideas',
  'learn-mentorship':'Learning / Mentorship','build-relationships':'Building relationships',
  'collaborate':'Looking to collaborate','find-cofounder':'Finding co-founder',
  'find-mentor':'Finding mentor','hire':'Hiring talent','find-investors':'Finding investors',
};

const INTEREST_OPTIONS = [
  'AI / ML','Startups','SaaS','Fintech','Design','Marketing','Web3','Climate Tech',
  'Health Tech','Edtech','Open Source','Product Management','Sales','VC / Investing','Engineering',
];

function initials(name) {
  return (name||'?').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
}

function MatchModal({ profile, onClose, onChat }) {
  if (!profile) return null;
  const photo = (profile.photos||[])[0];
  return (
    <Modal transparent animationType="fade" visible={!!profile} onRequestClose={onClose}>
      <View style={ms.overlay}>
        <View style={ms.card}>
          <Text style={ms.star}>✦</Text>
          <Text style={ms.label}>IT'S A MATCH</Text>
          {photo ? <Image source={{uri:photo}} style={ms.avatar} />
            : <View style={ms.avatarFb}><Text style={ms.avatarInit}>{initials(profile.name)}</Text></View>}
          <Text style={ms.name}>{profile.name}</Text>
          {profile.matchScore ? <Text style={ms.score}>{profile.matchScore}% compatibility</Text> : null}
          <Text style={ms.sub}>You both connected! Send a message within 48 hours.</Text>
          <View style={ms.row}>
            <TouchableOpacity style={ms.secondary} onPress={onClose}>
              <Text style={ms.secondaryTxt}>Keep swiping</Text>
            </TouchableOpacity>
            <TouchableOpacity style={ms.primary} onPress={onChat}>
              <Text style={ms.primaryTxt}>Say hello</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function FilterModal({ visible, filters, onApply, onClose }) {
  const [local,    setLocal]    = React.useState({...filters});
  const [expanded, setExpanded] = React.useState({ sort:true, distance:true, goal:true, interests:true });
  const [showMore, setShowMore] = React.useState({ goal:false, interests:false });

  React.useEffect(() => { setLocal({...filters}); }, [visible]);

  function set(key, val) { setLocal(p => ({...p, [key]: val})); }
  function toggleSection(k) { setExpanded(p => ({...p, [k]: !p[k]})); }

  const SORTS = [
    { value:'relevance', label:'Best Match' },
    { value:'recent',    label:'Most Recent' },
    { value:'distance',  label:'Nearest' },
  ];
  const RADII = [
    { value:'10', label:'10 km' },
    { value:'25', label:'25 km' },
    { value:'50', label:'50 km' },
    { value:'',   label:'Any distance' },
  ];
  const INTENT_ENTRIES = Object.entries(INTENT_LABELS);
  const visibleGoals     = showMore.goal      ? INTENT_ENTRIES    : INTENT_ENTRIES.slice(0,5);
  const visibleInterests = showMore.interests ? INTEREST_OPTIONS  : INTEREST_OPTIONS.slice(0,5);

  function Section({ sectionKey, title, children }) {
    const open = expanded[sectionKey];
    return (
      <View style={fm.section}>
        <TouchableOpacity style={fm.sectionHdr} onPress={() => toggleSection(sectionKey)}>
          <Text style={fm.sec}>{title}</Text>
          <Text style={fm.chevron}>{open ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {open && children}
      </View>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={fm.backdrop}>
        <View style={fm.container}>
          <ScrollView contentContainerStyle={{paddingBottom:16}} showsVerticalScrollIndicator={false}>
            <View style={fm.handle}/>
            <Text style={fm.title}>Filters</Text>

            <Section sectionKey="sort" title="SORT BY">
              <View style={fm.wrap}>
                {SORTS.map(o=>(
                  <TouchableOpacity key={o.value} style={[fm.chip, local.sort===o.value&&fm.chipOn]}
                    onPress={()=>set('sort',o.value)}>
                    <Text style={[fm.chipTxt, local.sort===o.value&&fm.chipTxtOn]}>{o.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Section>

            <Section sectionKey="distance" title="DISTANCE">
              <View style={fm.wrap}>
                {RADII.map(o=>(
                  <TouchableOpacity key={o.label} style={[fm.chip, local.radius===o.value&&fm.chipOn]}
                    onPress={()=>set('radius',o.value)}>
                    <Text style={[fm.chipTxt, local.radius===o.value&&fm.chipTxtOn]}>{o.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Section>

            <Section sectionKey="goal" title="NETWORKING GOAL">
              <View style={fm.wrap}>
                {visibleGoals.map(([val,label])=>(
                  <TouchableOpacity key={val} style={[fm.chip, local.intent===val&&fm.chipOn]}
                    onPress={()=>set('intent', local.intent===val?'':val)}>
                    <Text style={[fm.chipTxt, local.intent===val&&fm.chipTxtOn]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {INTENT_ENTRIES.length > 5 && (
                <TouchableOpacity style={fm.viewMore}
                  onPress={()=>setShowMore(p=>({...p,goal:!p.goal}))}>
                  <Text style={fm.viewMoreTxt}>
                    {showMore.goal ? 'View Less ▲' : `View ${INTENT_ENTRIES.length-5} more ▼`}
                  </Text>
                </TouchableOpacity>
              )}
            </Section>

            <Section sectionKey="interests" title="INTERESTS">
              <View style={fm.wrap}>
                {visibleInterests.map(opt=>(
                  <TouchableOpacity key={opt} style={[fm.chip, local.interest===opt&&fm.chipOn]}
                    onPress={()=>set('interest', local.interest===opt?'':opt)}>
                    <Text style={[fm.chipTxt, local.interest===opt&&fm.chipTxtOn]}>{opt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {INTEREST_OPTIONS.length > 5 && (
                <TouchableOpacity style={fm.viewMore}
                  onPress={()=>setShowMore(p=>({...p,interests:!p.interests}))}>
                  <Text style={fm.viewMoreTxt}>
                    {showMore.interests ? 'View Less ▲' : `View ${INTEREST_OPTIONS.length-5} more ▼`}
                  </Text>
                </TouchableOpacity>
              )}
            </Section>
          </ScrollView>

          {/* Sticky bottom CTA bar */}
          <View style={fm.stickyBar}>
            <TouchableOpacity onPress={()=>setLocal(DEFAULT_FILTERS)}>
              <Text style={fm.resetTxt}>Reset All</Text>
            </TouchableOpacity>
            <TouchableOpacity style={fm.applyBtn} onPress={()=>onApply(local)}>
              <Text style={fm.applyTxt}>Apply Filters</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── PRIORITY MESSAGE MODAL ────────────────────────────────────────────────────
function PriorityMessageModal({ profile, remaining, onClose, onSent }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState('');
  const MAX = 200;

  async function send() {
    if (!text.trim()) return;
    setSending('sending');
    try {
      const { data } = await api.post('/api/priority-message', {
        targetId: profile.id, text: text.trim(),
      });
      setSending('done');
      onSent(data.remaining);
      setTimeout(onClose, 1200);
    } catch (e) {
      setSending(e.response?.data?.error || 'Failed to send');
      setTimeout(() => setSending(''), 2500);
    }
  }

  if (!profile) return null;
  return (
    <Modal transparent animationType="slide" visible={!!profile} onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={pm.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={pm.sheet}>
          <View style={pm.handle} />
          <Text style={pm.title}>⚡ Priority Message</Text>
          <Text style={pm.sub}>Reach {profile.name} directly — no match required</Text>
          {remaining !== null && (
            <Text style={pm.rem}>{remaining} message{remaining !== 1 ? 's' : ''} remaining this month</Text>
          )}
          <TextInput
            style={pm.input}
            value={text}
            onChangeText={t => setText(t.slice(0, MAX))}
            placeholder={`Say something meaningful to ${profile.name}…`}
            placeholderTextColor={C.dim}
            multiline
            autoFocus
            maxLength={MAX}
          />
          <Text style={pm.charCount}>{text.length}/{MAX}</Text>

          {sending === 'done'
            ? <View style={pm.successBox}><Text style={pm.successTxt}>✓ Message sent!</Text></View>
            : sending && sending !== 'sending'
              ? <Text style={{ color: C.danger, fontSize: 13, marginBottom: 10 }}>{sending}</Text>
              : null}

          <View style={pm.btnRow}>
            <TouchableOpacity style={pm.cancelBtn} onPress={onClose}>
              <Text style={pm.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[pm.sendBtn, (!text.trim() || sending === 'sending') && { opacity: 0.4 }]}
              onPress={send}
              disabled={!text.trim() || sending === 'sending'}>
              {sending === 'sending'
                ? <ActivityIndicator color={C.bg} size="small" />
                : <Text style={pm.sendTxt}>Send ⚡</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const pm = StyleSheet.create({
  backdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet:      { backgroundColor: C.sur, borderTopLeftRadius: 24, borderTopRightRadius: 24,
                padding: 24, paddingBottom: 40, borderTopWidth: 1, borderTopColor: C.border },
  handle:     { width: 36, height: 4, backgroundColor: C.border2, borderRadius: 2,
                alignSelf: 'center', marginBottom: 20 },
  title:      { fontSize: 18, color: C.text, marginBottom: 4 },
  sub:        { fontSize: 13, color: C.sub, marginBottom: 6 },
  rem:        { fontSize: 12, color: C.gold, marginBottom: 14 },
  input:      { backgroundColor: C.sur2, borderWidth: 1, borderColor: C.border, borderRadius: 12,
                padding: 14, color: C.text, fontSize: 14, minHeight: 100, textAlignVertical: 'top',
                marginBottom: 4 },
  charCount:  { fontSize: 11, color: C.dim, textAlign: 'right', marginBottom: 16 },
  successBox: { backgroundColor: 'rgba(39,174,96,0.15)', borderRadius: 10, padding: 12, marginBottom: 12,
                alignItems: 'center', borderWidth: 1, borderColor: 'rgba(39,174,96,0.3)' },
  successTxt: { color: '#27AE60', fontSize: 14 },
  btnRow:     { flexDirection: 'row', gap: 10 },
  cancelBtn:  { flex: 1, backgroundColor: C.sur2, borderRadius: 12, padding: 14, alignItems: 'center',
                borderWidth: 1, borderColor: C.border2 },
  cancelTxt:  { color: C.sub, fontSize: 14 },
  sendBtn:    { flex: 2, backgroundColor: C.gold, borderRadius: 12, padding: 14, alignItems: 'center' },
  sendTxt:    { color: C.bg, fontSize: 14 },
});

function SwipeCard({ profile, onSwipe, isTop, onMessage }) {
  const pos        = useRef(new Animated.ValueXY()).current;
  const isTopRef   = useRef(isTop);
  const onSwipeRef = useRef(onSwipe);
  const swipedRef  = useRef(false);

  // Keep refs current when props change (fixes stale-closure bug where
  // PanResponder is created once but isTop / onSwipe change each render)
  useEffect(() => { isTopRef.current  = isTop;   }, [isTop]);
  useEffect(() => { onSwipeRef.current = onSwipe; }, [onSwipe]);

  const rotate  = pos.x.interpolate({inputRange:[-W/2,0,W/2],outputRange:['-12deg','0deg','12deg']});
  const rightOp = pos.x.interpolate({inputRange:[0,SWIPE_THRESHOLD],outputRange:[0,1],extrapolate:'clamp'});
  const leftOp  = pos.x.interpolate({inputRange:[-SWIPE_THRESHOLD,0],outputRange:[1,0],extrapolate:'clamp'});

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => isTopRef.current && !swipedRef.current,
    onMoveShouldSetPanResponder:  () => isTopRef.current && !swipedRef.current,
    onPanResponderMove: Animated.event([null,{dx:pos.x,dy:pos.y}],{useNativeDriver:false}),
    onPanResponderRelease: (_,{dx}) => {
      if (swipedRef.current) return;
      if (dx > SWIPE_THRESHOLD) {
        swipedRef.current = true;
        Animated.timing(pos,{toValue:{x:W*1.5,y:0},duration:250,useNativeDriver:false})
          .start(() => onSwipeRef.current('right'));
      } else if (dx < -SWIPE_THRESHOLD) {
        swipedRef.current = true;
        Animated.timing(pos,{toValue:{x:-W*1.5,y:0},duration:250,useNativeDriver:false})
          .start(() => onSwipeRef.current('left'));
      } else {
        Animated.spring(pos,{toValue:{x:0,y:0},useNativeDriver:false}).start();
      }
    },
  })).current;

  // Button-press swipe: animate card off-screen THEN call handler (prevents
  // double-fire and gives the same visual as a physical swipe)
  function btnSwipe(dir) {
    if (swipedRef.current || !isTopRef.current) return;
    swipedRef.current = true;
    Animated.timing(pos,{toValue:{x: dir==='right' ? W*1.5 : -W*1.5, y:0},duration:220,useNativeDriver:false})
      .start(() => onSwipeRef.current(dir));
  }

  const photo=(profile.photos||[])[0];
  return (
    <Animated.View
      style={[s.card,isTop&&{transform:[{translateX:pos.x},{translateY:pos.y},{rotate}],zIndex:10}]}
      {...(isTop?pan.panHandlers:{})}>
      {isTop&&(
        <>
          <Animated.View style={[s.hint,s.hintR,{opacity:rightOp}]}><Text style={s.hintTxtR}>Connect</Text></Animated.View>
          <Animated.View style={[s.hint,s.hintL,{opacity:leftOp}]}><Text style={s.hintTxtL}>Skip</Text></Animated.View>
        </>
      )}
      {photo?<Image source={{uri:photo}} style={s.cardImg}/>
        :<View style={s.cardNoImg}><Text style={s.cardInit}>{initials(profile.name)}</Text></View>}
      {profile.verification?.status==='verified'&&<View style={s.verifiedBadge}><Text style={s.verifiedTxt}>Verified</Text></View>}
      {profile.is_recently_active&&<View style={s.onlineDot}/>}
      <View style={s.cardBody}>
        <View style={s.topRow}>
          <View style={{flex:1}}>
            <Text style={s.cardName} numberOfLines={1}>{profile.name||''}</Text>
            {profile.location?<Text style={s.cardLoc} numberOfLines={1}>
              {profile.location}{profile.distance!=null?` · ${profile.distance}km`:''}
            </Text>:null}
          </View>
          {profile.matchScore?<View style={s.matchBox}>
            <Text style={s.matchPct}>{profile.matchScore}</Text>
            <Text style={s.matchLbl}>match</Text>
          </View>:null}
        </View>
        {profile.intent?<View style={s.intentBadge}><Text style={s.intentTxt}>{INTENT_LABELS[profile.intent]||profile.intent}</Text></View>:null}
        {(profile.skills||[]).length>0&&<View style={s.pills}>
          {(profile.skills||[]).slice(0,4).map(sk=><View key={sk} style={s.pill}><Text style={s.pillTxt}>{sk}</Text></View>)}
        </View>}
        {profile.insight?<View style={s.insight}><Text style={s.insightTxt}>✦ {profile.insight}</Text></View>:null}
        <View style={s.actRow}>
          <TouchableOpacity style={[s.actBtn,s.actSkip]} onPress={()=>btnSwipe('left')}>
            <Text style={{color:C.sub,fontSize:13}}>Skip</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.actBtn,s.actMsg]} onPress={onMessage}>
            <Text style={{color:C.gold,fontSize:13}}>⚡ Msg</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.actBtn,s.actConnect]} onPress={()=>btnSwipe('right')}>
            <Text style={{color:'#fff',fontSize:13}}>Connect</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

export default function DiscoverScreen({ navigation }) {
  const [profiles,setProfiles]=useState([]);
  const [idx,setIdx]=useState(0);
  const [loading,setLoading]=useState(true);
  const [limited,setLimited]=useState(false);
  const [trustBlocked,setTrustBlocked]=useState(false);
  const [trustMsg,setTrustMsg]=useState('');
  const [matchedProfile,setMatchedProfile]=useState(null); // { profile, connectionId }
  const [showFilters,setShowFilters]=useState(false);
  const [filters,setFilters]=useState(DEFAULT_FILTERS);
  const [pmProfile,setPmProfile]=useState(null);   // profile to send priority msg to
  const [pmRemaining,setPmRemaining]=useState(null); // remaining this month

  const activeFilters=Object.entries(filters).filter(([k,v])=>v&&!(k==='sort'&&v==='relevance')).length;

  useEffect(()=>{loadProfiles(DEFAULT_FILTERS);},[]);

  async function loadProfiles(f) {
    setLoading(true); setTrustBlocked(false);
    try {
      const params={};
      if(f.sort&&f.sort!=='relevance') params.sort=f.sort;
      if(f.radius) params.radius=f.radius;
      if(f.intent) params.intent=f.intent;
      if(f.interest) params.interest=f.interest;
      const {data}=await api.get('/api/discover',{params});
      if(data.limited){setLimited(true);setProfiles([]);return;}
      setLimited(false); setProfiles(data.profiles||[]); setIdx(0);
    } catch(e) {
      if(e.response?.data?.code==='TRUST_TOO_LOW'){
        setTrustBlocked(true); setTrustMsg(e.response.data.error);
      }
    } finally {setLoading(false);}
  }

  async function handleSwipe(profile,direction) {
    setIdx(i=>i+1);
    try {
      const {data}=await api.post('/api/swipe',{targetId:profile.id,direction});
      console.log('[Swipe] result:', JSON.stringify(data));
      if(data.match) setMatchedProfile({ profile, connectionId: data.connectionId });
    } catch(e) {
      console.log('[Swipe] error:', e?.response?.data || e.message);
    }
  }

  function applyFilters(f){setFilters(f);setShowFilters(false);loadProfiles(f);}

  if(loading) return <View style={s.center}><ActivityIndicator color={C.primary} size="large"/></View>;

  if(trustBlocked) return (
    <View style={s.screen}>
      <View style={s.header}><Text style={s.title}>Discover</Text></View>
      <View style={s.center}>
        <Text style={s.emptyIcon}>🔒</Text>
        <Text style={s.emptyH}>Discovery Locked</Text>
        <Text style={s.emptySub}>{trustMsg}</Text>
        <TouchableOpacity style={s.reloadBtn} onPress={()=>navigation.navigate('Profile')}>
          <Text style={{color:C.primary,fontSize:14}}>Complete Profile →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if(limited) return (
    <View style={s.screen}>
      <View style={s.header}><Text style={s.title}>Discover</Text></View>
      <View style={s.center}>
        <Text style={s.emptyIcon}>◎</Text>
        <Text style={s.emptyH}>Daily limit reached</Text>
        <Text style={s.emptySub}>Come back tomorrow for more profiles.</Text>
      </View>
    </View>
  );

  const visible=profiles.slice(idx,idx+2);

  if(!visible.length) return (
    <View style={s.screen}>
      <View style={s.header}>
        <Text style={s.title}>Discover</Text>
        <TouchableOpacity style={[s.filterBtn,activeFilters>0&&s.filterBtnOn]} onPress={()=>setShowFilters(true)}>
          <Text style={[s.filterTxt,activeFilters>0&&s.filterTxtOn]}>
            {activeFilters>0?`Filters (${activeFilters})`:'Filters'}
          </Text>
          {activeFilters>0&&<View style={s.filterCount}><Text style={s.filterCountTxt}>{activeFilters}</Text></View>}
        </TouchableOpacity>
      </View>
      <View style={s.center}>
        <Text style={s.emptyIcon}>◎</Text>
        <Text style={s.emptyH}>All caught up</Text>
        <Text style={s.emptySub}>{activeFilters>0?'No profiles match your filters.':'No more profiles right now. Check back soon!'}</Text>
        <TouchableOpacity style={s.reloadBtn} onPress={()=>loadProfiles(filters)}>
          <Text style={{color:C.primary,fontSize:14}}>Refresh</Text>
        </TouchableOpacity>
        {activeFilters>0&&(
          <TouchableOpacity style={s.reloadBtnSub}
            onPress={()=>{const f=DEFAULT_FILTERS;setFilters(f);loadProfiles(f);}}>
            <Text style={{color:C.sub,fontSize:14}}>Clear Filters</Text>
          </TouchableOpacity>
        )}
      </View>
      <FilterModal visible={showFilters} filters={filters} onApply={applyFilters} onClose={()=>setShowFilters(false)}/>
    </View>
  );

  return (
    <View style={s.screen}>
      <View style={s.header}>
        <View>
          <Text style={s.title}>Discover</Text>
          <Text style={s.subtitle}>Swipe to connect</Text>
        </View>
        <TouchableOpacity style={[s.filterBtn,activeFilters>0&&s.filterBtnOn]} onPress={()=>setShowFilters(true)}>
          <Text style={[s.filterTxt,activeFilters>0&&s.filterTxtOn]}>Filters</Text>
          {activeFilters>0&&<View style={s.filterCount}><Text style={s.filterCountTxt}>{activeFilters}</Text></View>}
        </TouchableOpacity>
      </View>
      <View style={s.stack}>
        {[...visible].reverse().map((p,i)=>(
          <SwipeCard key={p.id} profile={p} isTop={i===visible.length-1}
            onSwipe={(dir)=>handleSwipe(p,dir)}
            onMessage={()=>{ setPmProfile(p); setPmRemaining(null); }}/>
        ))}
      </View>
      <MatchModal
        profile={matchedProfile?.profile}
        onClose={()=>setMatchedProfile(null)}
        onChat={()=>{
          const m=matchedProfile; setMatchedProfile(null);
          navigation.navigate('Connections',{
            screen:'ChatDetail',
            params:{ connId:m?.connectionId, otherUser:m?.profile },
          });
        }}/>
      <FilterModal visible={showFilters} filters={filters} onApply={applyFilters}
        onClose={()=>setShowFilters(false)}/>
      <PriorityMessageModal
        profile={pmProfile}
        remaining={pmRemaining}
        onClose={()=>setPmProfile(null)}
        onSent={(rem)=>setPmRemaining(rem)}/>
    </View>
  );
}

const ms=StyleSheet.create({
  overlay:{flex:1,backgroundColor:'rgba(0,0,0,0.88)',justifyContent:'center',alignItems:'center',padding:24},
  card:{backgroundColor:C.sur,borderRadius:20,padding:28,alignItems:'center',width:'100%',maxWidth:360,borderWidth:1,borderColor:C.border},
  star:{fontSize:32,color:C.gold,marginBottom:8},
  label:{fontSize:10,color:C.sub,letterSpacing:3,marginBottom:18},
  avatar:{width:88,height:88,borderRadius:44,borderWidth:2,borderColor:C.primary,marginBottom:12},
  avatarFb:{width:88,height:88,borderRadius:44,borderWidth:2,borderColor:C.primary,backgroundColor:C.sur2,justifyContent:'center',alignItems:'center',marginBottom:12},
  avatarInit:{fontSize:30,color:C.gold},
  name:{fontSize:22,color:C.text,marginBottom:4},
  score:{fontSize:13,color:C.primary,marginBottom:14},
  sub:{fontSize:13,color:C.sub,lineHeight:20,textAlign:'center',marginBottom:24},
  row:{flexDirection:'row',gap:10,width:'100%'},
  primary:{flex:1,backgroundColor:C.primary,borderRadius:12,padding:14,alignItems:'center'},
  primaryTxt:{color:'#fff',fontSize:14},
  secondary:{flex:1,backgroundColor:C.sur2,borderRadius:12,padding:14,alignItems:'center',borderWidth:1,borderColor:C.border2},
  secondaryTxt:{color:C.sub,fontSize:14},
});

const fm=StyleSheet.create({
  backdrop:    { flex:1, backgroundColor:'rgba(0,0,0,0.7)', justifyContent:'flex-end' },
  container:   { backgroundColor:C.sur, borderTopLeftRadius:24, borderTopRightRadius:24,
                 maxHeight:'92%', borderTopWidth:1, borderTopColor:C.border },
  handle:      { width:36, height:4, backgroundColor:C.border2, borderRadius:2,
                 alignSelf:'center', marginTop:16, marginBottom:4 },
  title:       { fontSize:18, color:C.text, padding:20, paddingTop:12, paddingBottom:8 },
  section:     { borderBottomWidth:1, borderBottomColor:C.border, paddingHorizontal:20, paddingBottom:16 },
  sectionHdr:  { flexDirection:'row', justifyContent:'space-between', alignItems:'center',
                 paddingTop:16, paddingBottom:12 },
  sec:         { fontSize:10, color:C.sub, letterSpacing:1.5 },
  chevron:     { fontSize:9, color:C.dim },
  wrap:        { flexDirection:'row', flexWrap:'wrap', gap:8 },
  chip:        { backgroundColor:C.sur2, borderRadius:20, paddingHorizontal:14, paddingVertical:8,
                 borderWidth:1, borderColor:C.border },
  chipOn:      { backgroundColor:C.primary, borderColor:C.primary },
  chipTxt:     { color:C.sub, fontSize:13 },
  chipTxtOn:   { color:'#fff', fontSize:13 },
  viewMore:    { marginTop:12, alignSelf:'flex-start' },
  viewMoreTxt: { color:C.primary, fontSize:12 },
  stickyBar:   { flexDirection:'row', justifyContent:'space-between', alignItems:'center',
                 padding:20, borderTopWidth:1, borderTopColor:C.border,
                 backgroundColor:C.sur },
  resetTxt:    { color:C.sub, fontSize:14 },
  applyBtn:    { backgroundColor:C.primary, borderRadius:12, paddingHorizontal:32,
                 paddingVertical:14, alignItems:'center' },
  applyTxt:    { color:'#fff', fontSize:14 },
});

const s=StyleSheet.create({
  screen:      { flex:1, backgroundColor:C.bg },
  center:      { flex:1, backgroundColor:C.bg, justifyContent:'center', alignItems:'center', padding:32 },
  header:      { flexDirection:'row', justifyContent:'space-between', alignItems:'center',
                 paddingHorizontal:20, paddingTop:18, paddingBottom:12 },
  title:       { fontSize:26, color:C.text, fontWeight:'700' },
  subtitle:    { fontSize:12, color:C.sub, marginTop:2 },
  filterBtn:   { flexDirection:'row', alignItems:'center', gap:6,
                 backgroundColor:C.sur2, borderRadius:20, paddingHorizontal:14,
                 paddingVertical:8, borderWidth:1, borderColor:C.border },
  filterBtnOn: { borderColor:C.primary, backgroundColor:C.primaryLight },
  filterTxt:   { color:C.sub, fontSize:13 },
  filterTxtOn: { color:C.primary },
  filterCount: { backgroundColor:C.primary, borderRadius:10, paddingHorizontal:6,
                 paddingVertical:1, minWidth:18, alignItems:'center' },
  filterCountTxt:{ color:'#fff', fontSize:10, fontWeight:'700' },
  stack:       { flex:1, alignItems:'center', justifyContent:'center' },
  card:        { position:'absolute', width:W-24, backgroundColor:C.sur, borderWidth:1,
                 borderColor:C.border, borderRadius:20, overflow:'hidden',
                 shadowColor:'#000', shadowOpacity:0.5, shadowRadius:24, shadowOffset:{width:0,height:10} },
  hint:        { position:'absolute', top:18, paddingHorizontal:14, paddingVertical:6, borderRadius:20, zIndex:20 },
  hintR:       { right:16, backgroundColor:'rgba(37,99,235,0.18)', borderWidth:1, borderColor:C.primary },
  hintL:       { left:16,  backgroundColor:'rgba(239,68,68,0.12)', borderWidth:1, borderColor:C.danger },
  hintTxtR:    { color:C.primary, fontSize:13 },
  hintTxtL:    { color:C.danger,  fontSize:13 },
  cardImg:     { width:'100%', height:220, resizeMode:'cover' },
  cardNoImg:   { width:'100%', height:190, backgroundColor:C.sur2, justifyContent:'center', alignItems:'center' },
  cardInit:    { fontSize:56, color:C.gold },
  verifiedBadge:{ position:'absolute', top:12, left:12, backgroundColor:'rgba(34,197,94,0.9)',
                  borderRadius:20, paddingHorizontal:10, paddingVertical:4 },
  verifiedTxt: { color:'#fff', fontSize:11 },
  onlineDot:   { position:'absolute', top:12, right:12, width:12, height:12, borderRadius:6,
                 backgroundColor:C.green, borderWidth:2, borderColor:C.sur },
  cardBody:    { padding:16 },
  topRow:      { flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 },
  cardName:    { fontSize:20, color:C.text, marginBottom:2, fontWeight:'600' },
  cardLoc:     { fontSize:12, color:C.sub },
  matchBox:    { backgroundColor:C.primaryLight, borderRadius:10, padding:8, alignItems:'center',
                 borderWidth:1, borderColor:'rgba(37,99,235,0.3)' },
  matchPct:    { fontSize:20, color:C.primary, fontWeight:'700' },
  matchLbl:    { fontSize:9, color:C.sub },
  intentBadge: { backgroundColor:C.sur2, borderRadius:20, paddingHorizontal:10, paddingVertical:4,
                 alignSelf:'flex-start', marginBottom:10, borderWidth:1, borderColor:C.border2 },
  intentTxt:   { fontSize:11, color:C.sub },
  pills:       { flexDirection:'row', flexWrap:'wrap', gap:5, marginBottom:10 },
  pill:        { backgroundColor:C.sur2, borderRadius:20, paddingHorizontal:9,
                 paddingVertical:3, borderWidth:1, borderColor:C.border },
  pillTxt:     { fontSize:11, color:C.sub },
  insight:     { backgroundColor:C.primaryLight, borderLeftWidth:2, borderLeftColor:C.primary,
                 borderRadius:6, padding:10, marginBottom:12 },
  insightTxt:  { fontSize:12, color:C.sub, lineHeight:18 },
  actRow:      { flexDirection:'row', gap:8 },
  actBtn:      { flex:1, padding:12, borderRadius:12, alignItems:'center' },
  actSkip:     { backgroundColor:C.sur2, borderWidth:1, borderColor:C.border2 },
  actMsg:      { backgroundColor:C.sur2, borderWidth:1, borderColor:C.gold, flex:0.8 },
  actConnect:  { backgroundColor:C.primary },
  emptyIcon:   { fontSize:44, marginBottom:14, color:C.sub },
  emptyH:      { fontSize:20, color:C.text, marginBottom:8, fontWeight:'600' },
  emptySub:    { fontSize:14, color:C.sub, textAlign:'center', lineHeight:20 },
  emptyActions:{ flexDirection:'row', gap:10, marginTop:20 },
  reloadBtn:   { padding:12, borderWidth:1, borderColor:C.primary, borderRadius:12,
                 paddingHorizontal:24 },
  reloadBtnSub:{ padding:12, borderWidth:1, borderColor:C.border2, borderRadius:12,
                 paddingHorizontal:24 },
});
