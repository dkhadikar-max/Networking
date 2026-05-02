import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { C } from '../utils/theme';

function initials(name) { return (name||'?').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2); }

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffH = (now - d) / 3600000;
  if (diffH < 24) return d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  return d.toLocaleDateString([], {month:'short',day:'numeric'});
}

export default function ChatListScreen({ navigation }) {
  const { user } = useAuth();
  const [list,       setList]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(useCallback(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []));

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    try {
      // Backend returns: [{ connection, user, lastMessage, hoursLeft, active, msgCount }]
      const { data } = await api.get('/api/connections');
      console.log('[ChatList] connections:', JSON.stringify(data?.length));
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      console.log('[ChatList] error:', e?.response?.data || e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function renderItem({ item }) {
    // item shape: { connection, user, lastMessage, hoursLeft, active, msgCount }
    const u          = item.user || {};
    const connId     = item.connection?.id;
    const photo      = (u.photos||[])[0];
    const preview    = item.lastMessage?.text || 'Say hello…';
    const time       = item.lastMessage?.created_at;
    const isPersist  = !!item.active;
    const hoursLeft  = item.hoursLeft;

    return (
      <TouchableOpacity
        style={s.row}
        onPress={() => navigation.navigate('ChatDetail', {
          connId,
          otherUser: u,
          connection: item.connection,
        })}>
        <View style={s.avWrap}>
          {photo
            ? <Image source={{uri:photo}} style={s.av} />
            : <View style={s.avFallback}><Text style={s.avInit}>{initials(u.name)}</Text></View>
          }
        </View>
        <View style={s.info}>
          <Text style={s.name} numberOfLines={1}>{u.name||'—'}</Text>
          <Text style={s.preview} numberOfLines={1}>{preview}</Text>
        </View>
        <View style={s.meta}>
          {time ? <Text style={s.time}>{fmtTime(time)}</Text> : null}
          {isPersist
            ? <View style={s.timerGold}><Text style={s.timerTxt}>Active</Text></View>
            : hoursLeft != null
              ? <View style={hoursLeft < 12 ? s.timerRed : s.timerGold}>
                  <Text style={s.timerTxt}>{hoursLeft}h</Text>
                </View>
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
          keyExtractor={item => item.connection?.id || Math.random().toString()}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.gold} />
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen:     { flex:1, backgroundColor:C.bg },
  center:     { flex:1, justifyContent:'center', alignItems:'center', padding:24 },
  header:     { padding:20, paddingTop:16, borderBottomWidth:1, borderBottomColor:C.border },
  title:      { fontSize:22, color:C.text },
  row:        { flexDirection:'row', alignItems:'center', padding:16, borderBottomWidth:1, borderBottomColor:C.border },
  avWrap:     { marginRight:14 },
  av:         { width:48, height:48, borderRadius:24 },
  avFallback: { width:48, height:48, borderRadius:24, backgroundColor:C.sur2, justifyContent:'center', alignItems:'center' },
  avInit:     { color:C.gold, fontSize:16 },
  info:       { flex:1, minWidth:0 },
  name:       { fontSize:15, color:C.text, marginBottom:3 },
  preview:    { fontSize:13, color:C.sub },
  meta:       { alignItems:'flex-end', gap:4, minWidth:50 },
  time:       { fontSize:11, color:C.dim },
  timerGold:  { backgroundColor:C.goldBg, borderRadius:10, paddingHorizontal:8, paddingVertical:2, borderWidth:1, borderColor:'rgba(198,168,107,0.2)' },
  timerRed:   { backgroundColor:'rgba(192,57,43,0.08)', borderRadius:10, paddingHorizontal:8, paddingVertical:2, borderWidth:1, borderColor:'rgba(192,57,43,0.2)' },
  timerTxt:   { fontSize:11, color:C.gold },
  emptyIcon:  { fontSize:40, marginBottom:14, color:C.sub },
  emptyH:     { fontSize:20, color:C.text, marginBottom:8 },
  emptySub:   { fontSize:14, color:C.sub, textAlign:'center', lineHeight:20 },
});
