import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { C } from '../utils/theme';

function initials(name) { return (name||'?').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2); }
function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
}

export default function ChatListScreen({ navigation }) {
  const { user } = useAuth();
  const [list, setList]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(useCallback(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []));

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    try {
      const { data } = await api.get('/api/matches');
      setList(Array.isArray(data) ? data : []);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }

  function renderItem({ item }) {
    const u = item.other_user || {};
    const photo = (u.photos||[])[0];
    const unread = item.unread_count || 0;
    const preview = item.last_message?.text || 'Start the conversation…';
    const time    = item.last_message?.created_at;

    return (
      <TouchableOpacity style={s.row} onPress={() => navigation.navigate('Chat', { match: item, user: u })}>
        <View style={s.avWrap}>
          {photo
            ? <Image source={{uri:photo}} style={s.av} />
            : <View style={s.avFallback}><Text style={s.avInit}>{initials(u.name)}</Text></View>
          }
          {unread > 0 && <View style={s.dot} />}
        </View>
        <View style={s.info}>
          <Text style={s.name}>{u.name||'—'}</Text>
          <Text style={[s.preview, unread>0 && {fontWeight:'700', color:C.text}]} numberOfLines={1}>{preview}</Text>
        </View>
        <View style={s.meta}>
          {time ? <Text style={s.time}>{fmtTime(time)}</Text> : null}
          {unread > 0 && (
            <View style={s.badge}><Text style={s.badgeTxt}>{unread > 9 ? '9+' : unread}</Text></View>
          )}
          {item.is_persistent
            ? <View style={s.timerGold}><Text style={s.timerTxt}>Active</Text></View>
            : item.hours_left != null
              ? <View style={item.hours_left < 12 ? s.timerRed : s.timerGold}><Text style={s.timerTxt}>{item.hours_left}h</Text></View>
              : null
          }
        </View>
      </TouchableOpacity>
    );
  }

  if (loading) return <View style={s.center}><ActivityIndicator color={C.gold} /></View>;

  return (
    <View style={s.screen}>
      <View style={s.header}>
        <Text style={s.title}>Chat</Text>
      </View>
      {!list.length ? (
        <View style={s.center}>
          <Text style={s.emptyIcon}>◎</Text>
          <Text style={s.emptyH}>No conversations yet</Text>
          <Text style={s.emptySub}>Swipe right on Discover to connect with people.</Text>
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={i => i.match_id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>load(true)} tintColor={C.gold} />}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen:  { flex:1, backgroundColor:C.bg },
  center:  { flex:1, justifyContent:'center', alignItems:'center', padding:24 },
  header:  { padding:20, paddingTop:16, borderBottomWidth:1, borderBottomColor:C.border },
  title:   { fontSize:22, fontWeight:'700', color:C.text },
  row:     { flexDirection:'row', alignItems:'center', padding:16, borderBottomWidth:1, borderBottomColor:C.border },
  avWrap:  { position:'relative', marginRight:14 },
  av:      { width:48, height:48, borderRadius:24 },
  avFallback:{ width:48, height:48, borderRadius:24, backgroundColor:C.sur2, justifyContent:'center', alignItems:'center' },
  avInit:  { color:C.gold, fontWeight:'700', fontSize:16 },
  dot:     { position:'absolute', top:-2, right:-2, width:10, height:10, borderRadius:5, backgroundColor:C.gold, borderWidth:2, borderColor:C.bg },
  info:    { flex:1, minWidth:0 },
  name:    { fontSize:15, fontWeight:'600', color:C.text, marginBottom:3 },
  preview: { fontSize:13, color:C.sub },
  meta:    { alignItems:'flex-end', gap:4, minWidth:50 },
  time:    { fontSize:11, color:C.dim },
  badge:   { backgroundColor:C.gold, borderRadius:10, paddingHorizontal:7, paddingVertical:1 },
  badgeTxt:{ color:C.bg, fontSize:11, fontWeight:'700' },
  timerGold:{ backgroundColor:C.goldBg, borderRadius:10, paddingHorizontal:8, paddingVertical:2, borderWidth:1, borderColor:'rgba(198,168,107,0.2)' },
  timerRed: { backgroundColor:'rgba(192,57,43,0.08)', borderRadius:10, paddingHorizontal:8, paddingVertical:2, borderWidth:1, borderColor:'rgba(192,57,43,0.2)' },
  timerTxt: { fontSize:11, color:C.gold, fontWeight:'500' },
  emptyIcon:{ fontSize:40, marginBottom:14, color:C.sub },
  emptyH:   { fontSize:20, fontWeight:'700', color:C.text, marginBottom:8 },
  emptySub: { fontSize:14, color:C.sub, textAlign:'center', lineHeight:20 },
});
