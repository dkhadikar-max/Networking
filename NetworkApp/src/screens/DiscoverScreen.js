import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet, ActivityIndicator,
  PanResponder, Animated, Dimensions, Modal, ScrollView,
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
  const [local, setLocal] = React.useState({...filters});
  function set(key, val) { setLocal(p=>({...p,[key]:val})); }
  const SORTS = [{value:'relevance',label:'Best Match'},{value:'recent',label:'Most Recent'},{value:'distance',label:'Nearest'}];
  const RADII = [{value:'10',label:'10 km'},{value:'25',label:'25 km'},{value:'50',label:'50 km'},{value:'',label:'Any'}];
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={fm.backdrop}>
        <ScrollView style={fm.sheet} contentContainerStyle={{paddingBottom:40}} showsVerticalScrollIndicator={false}>
          <View style={fm.handle}/>
          <Text style={fm.title}>Filters</Text>
          <Text style={fm.sec}>SORT BY</Text>
          <View style={fm.wrap}>
            {SORTS.map(o=>(
              <TouchableOpacity key={o.value} style={[fm.chip,local.sort===o.value&&fm.chipOn]}
                onPress={()=>set('sort',o.value)}>
                <Text style={[fm.chipTxt,local.sort===o.value&&fm.chipTxtOn]}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={fm.sec}>DISTANCE</Text>
          <View style={fm.wrap}>
            {RADII.map(o=>(
              <TouchableOpacity key={o.label} style={[fm.chip,local.radius===o.value&&fm.chipOn]}
                onPress={()=>set('radius',o.value)}>
                <Text style={[fm.chipTxt,local.radius===o.value&&fm.chipTxtOn]}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={fm.sec}>NETWORKING GOAL</Text>
          <View style={fm.wrap}>
            {Object.entries(INTENT_LABELS).map(([val,label])=>(
              <TouchableOpacity key={val} style={[fm.chip,local.intent===val&&fm.chipOn]}
                onPress={()=>set('intent',local.intent===val?'':val)}>
                <Text style={[fm.chipTxt,local.intent===val&&fm.chipTxtOn]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={fm.sec}>INTEREST</Text>
          <View style={fm.wrap}>
            {INTEREST_OPTIONS.map(opt=>(
              <TouchableOpacity key={opt} style={[fm.chip,local.interest===opt&&fm.chipOn]}
                onPress={()=>set('interest',local.interest===opt?'':opt)}>
                <Text style={[fm.chipTxt,local.interest===opt&&fm.chipTxtOn]}>{opt}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={fm.btns}>
            <TouchableOpacity style={fm.resetBtn} onPress={()=>setLocal(DEFAULT_FILTERS)}>
              <Text style={fm.resetTxt}>Reset All</Text>
            </TouchableOpacity>
            <TouchableOpacity style={fm.applyBtn} onPress={()=>onApply(local)}>
              <Text style={fm.applyTxt}>Apply Filters</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function SwipeCard({ profile, onSwipe, isTop }) {
  const pos = useRef(new Animated.ValueXY()).current;
  const rotate = pos.x.interpolate({inputRange:[-W/2,0,W/2],outputRange:['-12deg','0deg','12deg']});
  const rightOp = pos.x.interpolate({inputRange:[0,SWIPE_THRESHOLD],outputRange:[0,1],extrapolate:'clamp'});
  const leftOp  = pos.x.interpolate({inputRange:[-SWIPE_THRESHOLD,0],outputRange:[1,0],extrapolate:'clamp'});
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder:()=>isTop,
    onMoveShouldSetPanResponder:()=>isTop,
    onPanResponderMove: Animated.event([null,{dx:pos.x,dy:pos.y}],{useNativeDriver:false}),
    onPanResponderRelease:(_,{dx})=>{
      if(dx>SWIPE_THRESHOLD) Animated.timing(pos,{toValue:{x:W*1.5,y:0},duration:250,useNativeDriver:false}).start(()=>onSwipe('right'));
      else if(dx<-SWIPE_THRESHOLD) Animated.timing(pos,{toValue:{x:-W*1.5,y:0},duration:250,useNativeDriver:false}).start(()=>onSwipe('left'));
      else Animated.spring(pos,{toValue:{x:0,y:0},useNativeDriver:false}).start();
    },
  })).current;
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
          <TouchableOpacity style={[s.actBtn,s.actSkip]} onPress={()=>onSwipe('left')}>
            <Text style={{color:C.sub}}>Skip</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.actBtn,s.actConnect]} onPress={()=>onSwipe('right')}>
            <Text style={{color:C.bg}}>Connect</Text>
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
  const [matchedProfile,setMatchedProfile]=useState(null);
  const [showFilters,setShowFilters]=useState(false);
  const [filters,setFilters]=useState(DEFAULT_FILTERS);

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
      if(data.match) setMatchedProfile(profile);
    } catch {}
  }

  function applyFilters(f){setFilters(f);setShowFilters(false);loadProfiles(f);}

  if(loading) return <View style={s.center}><ActivityIndicator color={C.gold} size="large"/></View>;

  if(trustBlocked) return (
    <View style={s.screen}>
      <View style={s.header}><Text style={s.title}>Discover</Text></View>
      <View style={s.center}>
        <Text style={s.emptyIcon}>🔒</Text>
        <Text style={s.emptyH}>Discovery Locked</Text>
        <Text style={s.emptySub}>{trustMsg}</Text>
        <TouchableOpacity style={s.reloadBtn} onPress={()=>navigation.navigate('Profile')}>
          <Text style={{color:C.gold}}>Build Trust Score</Text>
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
        </TouchableOpacity>
      </View>
      <View style={s.center}>
        <Text style={s.emptyIcon}>◎</Text>
        <Text style={s.emptyH}>All caught up</Text>
        <Text style={s.emptySub}>{activeFilters>0?'No profiles match your filters.':'No more profiles right now.'}</Text>
        <TouchableOpacity style={s.reloadBtn} onPress={()=>loadProfiles(filters)}>
          <Text style={{color:C.gold}}>Refresh</Text>
        </TouchableOpacity>
        {activeFilters>0&&(
          <TouchableOpacity style={[s.reloadBtn,{marginTop:10,borderColor:C.border2}]}
            onPress={()=>{const f=DEFAULT_FILTERS;setFilters(f);loadProfiles(f);}}>
            <Text style={{color:C.sub}}>Clear Filters</Text>
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
          <Text style={[s.filterTxt,activeFilters>0&&s.filterTxtOn]}>
            {activeFilters>0?`Filters (${activeFilters})`:'Filters'}
          </Text>
        </TouchableOpacity>
      </View>
      <View style={s.stack}>
        {[...visible].reverse().map((p,i)=>(
          <SwipeCard key={p.id} profile={p} isTop={i===visible.length-1}
            onSwipe={(dir)=>handleSwipe(p,dir)}/>
        ))}
      </View>
      <MatchModal profile={matchedProfile} onClose={()=>setMatchedProfile(null)}
        onChat={()=>{setMatchedProfile(null);navigation.navigate('Connections');}}/>
      <FilterModal visible={showFilters} filters={filters} onApply={applyFilters}
        onClose={()=>setShowFilters(false)}/>
    </View>
  );
}

const ms=StyleSheet.create({
  overlay:{flex:1,backgroundColor:'rgba(0,0,0,0.88)',justifyContent:'center',alignItems:'center',padding:24},
  card:{backgroundColor:C.sur,borderRadius:20,padding:28,alignItems:'center',width:'100%',maxWidth:360,borderWidth:1,borderColor:C.border},
  star:{fontSize:32,color:C.gold,marginBottom:8},
  label:{fontSize:10,color:C.sub,letterSpacing:3,marginBottom:18},
  avatar:{width:88,height:88,borderRadius:44,borderWidth:2,borderColor:C.gold,marginBottom:12},
  avatarFb:{width:88,height:88,borderRadius:44,borderWidth:2,borderColor:C.gold,backgroundColor:C.sur2,justifyContent:'center',alignItems:'center',marginBottom:12},
  avatarInit:{fontSize:30,color:C.gold},
  name:{fontSize:22,color:C.text,marginBottom:4},
  score:{fontSize:13,color:C.gold,marginBottom:14},
  sub:{fontSize:13,color:C.sub,lineHeight:20,textAlign:'center',marginBottom:24},
  row:{flexDirection:'row',gap:10,width:'100%'},
  primary:{flex:1,backgroundColor:C.gold,borderRadius:12,padding:14,alignItems:'center'},
  primaryTxt:{color:C.bg,fontSize:14},
  secondary:{flex:1,backgroundColor:C.sur2,borderRadius:12,padding:14,alignItems:'center',borderWidth:1,borderColor:C.border2},
  secondaryTxt:{color:C.sub,fontSize:14},
});

const fm=StyleSheet.create({
  backdrop:{flex:1,backgroundColor:'rgba(0,0,0,0.75)',justifyContent:'flex-end'},
  sheet:{backgroundColor:C.sur,borderTopLeftRadius:24,borderTopRightRadius:24,padding:24,maxHeight:'90%',borderTopWidth:1,borderColor:C.border},
  handle:{width:36,height:4,backgroundColor:C.border2,borderRadius:2,alignSelf:'center',marginBottom:20},
  title:{fontSize:18,color:C.text,marginBottom:20},
  sec:{fontSize:10,color:C.sub,letterSpacing:1.5,marginBottom:10},
  wrap:{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:20},
  chip:{backgroundColor:C.sur2,borderRadius:20,paddingHorizontal:14,paddingVertical:8,borderWidth:1,borderColor:C.border},
  chipOn:{backgroundColor:C.gold,borderColor:C.gold},
  chipTxt:{color:C.sub,fontSize:13},
  chipTxtOn:{color:C.bg},
  btns:{flexDirection:'row',gap:12,marginTop:8},
  resetBtn:{flex:1,backgroundColor:C.sur2,borderRadius:12,padding:14,alignItems:'center',borderWidth:1,borderColor:C.border2},
  resetTxt:{color:C.sub,fontSize:14},
  applyBtn:{flex:2,backgroundColor:C.gold,borderRadius:12,padding:14,alignItems:'center'},
  applyTxt:{color:C.bg,fontSize:14},
});

const s=StyleSheet.create({
  screen:{flex:1,backgroundColor:C.bg},
  center:{flex:1,backgroundColor:C.bg,justifyContent:'center',alignItems:'center',padding:32},
  header:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',padding:20,paddingTop:18},
  title:{fontSize:24,color:C.text},
  subtitle:{fontSize:12,color:C.sub,marginTop:2},
  filterBtn:{backgroundColor:C.sur2,borderRadius:20,paddingHorizontal:14,paddingVertical:8,borderWidth:1,borderColor:C.border,marginTop:4},
  filterBtnOn:{borderColor:C.gold,backgroundColor:C.goldBg},
  filterTxt:{color:C.sub,fontSize:13},
  filterTxtOn:{color:C.gold},
  stack:{flex:1,alignItems:'center',justifyContent:'center'},
  card:{position:'absolute',width:W-24,backgroundColor:C.sur,borderWidth:1,borderColor:C.border,borderRadius:18,overflow:'hidden',shadowColor:'#000',shadowOpacity:0.5,shadowRadius:24,shadowOffset:{width:0,height:10}},
  hint:{position:'absolute',top:18,paddingHorizontal:14,paddingVertical:6,borderRadius:20,zIndex:20},
  hintR:{right:16,backgroundColor:'rgba(201,169,110,0.15)',borderWidth:1,borderColor:C.gold},
  hintL:{left:16,backgroundColor:'rgba(192,57,43,0.12)',borderWidth:1,borderColor:C.danger},
  hintTxtR:{color:C.gold,fontSize:13},
  hintTxtL:{color:C.danger,fontSize:13},
  cardImg:{width:'100%',height:220,resizeMode:'cover'},
  cardNoImg:{width:'100%',height:190,backgroundColor:C.sur2,justifyContent:'center',alignItems:'center'},
  cardInit:{fontSize:56,color:C.gold},
  verifiedBadge:{position:'absolute',top:12,left:12,backgroundColor:'rgba(34,197,94,0.9)',borderRadius:20,paddingHorizontal:10,paddingVertical:4},
  verifiedTxt:{color:'#fff',fontSize:11},
  onlineDot:{position:'absolute',top:12,right:12,width:12,height:12,borderRadius:6,backgroundColor:'#22c55e',borderWidth:2,borderColor:C.sur},
  cardBody:{padding:16},
  topRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10},
  cardName:{fontSize:20,color:C.text,marginBottom:2},
  cardLoc:{fontSize:12,color:C.sub},
  matchBox:{backgroundColor:C.goldBg,borderRadius:10,padding:8,alignItems:'center',borderWidth:1,borderColor:C.goldMid},
  matchPct:{fontSize:20,color:C.gold},
  matchLbl:{fontSize:9,color:C.sub},
  intentBadge:{backgroundColor:C.sur2,borderRadius:20,paddingHorizontal:10,paddingVertical:4,alignSelf:'flex-start',marginBottom:10,borderWidth:1,borderColor:C.border2},
  intentTxt:{fontSize:11,color:C.sub},
  pills:{flexDirection:'row',flexWrap:'wrap',gap:5,marginBottom:10},
  pill:{backgroundColor:C.sur2,borderRadius:20,paddingHorizontal:9,paddingVertical:3,borderWidth:1,borderColor:C.border},
  pillTxt:{fontSize:11,color:C.sub},
  insight:{backgroundColor:C.goldBg,borderLeftWidth:2,borderLeftColor:C.gold,borderRadius:6,padding:10,marginBottom:12},
  insightTxt:{fontSize:12,color:C.sub,lineHeight:18},
  actRow:{flexDirection:'row',gap:10},
  actBtn:{flex:1,padding:13,borderRadius:12,alignItems:'center'},
  actSkip:{backgroundColor:C.sur2,borderWidth:1,borderColor:C.border2},
  actConnect:{backgroundColor:C.gold},
  emptyIcon:{fontSize:44,marginBottom:14,color:C.sub},
  emptyH:{fontSize:20,color:C.text,marginBottom:8},
  emptySub:{fontSize:14,color:C.sub,textAlign:'center',lineHeight:20},
  reloadBtn:{marginTop:20,padding:12,borderWidth:1,borderColor:C.gold,borderRadius:10,paddingHorizontal:28},
});
