import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { C } from '../utils/theme';

function initials(name) { return (name||'?').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2); }

function fmtTime(iso) {
  if (!iso) return '';
  const d    = new Date(iso);
  const now  = new Date();
  const diffM = Math.round((now - d) / 60000);
  const diffH = Math.round((now - d) / 3600000);
  const diffD = Math.round((now - d) / 86400000);
  if (diffM <  1)  return 'Just now';
  if (diffM < 60)  return `${diffM}m ago`;
  if (diffH < 24)  return `${diffH}h ago`;
  if (diffD === 1) return 'Yesterday';
  if (diffD <  7)  return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function fmtExpiry(hoursLeft) {
  if (hoursLeft == null) return null;
  if (hoursLeft > 48) return `${Math.round(hoursLeft / 24)}d left`;
  if (hoursLeft >  0) return `${hoursLeft}h left`;
  return null;
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
    const u         = item.user || {};
    const connId    = item.connection?.id;
    const photo     = (u.photos||[])[0];
    const preview   = item.lastMessage?.text || 'Say hello…';
    const time      = item.lastMessage?.created_at;
    const isPersist = !!item.active;
    const hoursLeft = item.hoursLeft;
    const isOnline  = !!u.is_recently_active;
    const isUnread  = !!item.unread;          // backend may supply this
    const hasPriority = !!item.hasPriority;   // backend may supply this
    const expiryLabel = fmtExpiry(isPersist ? null : hoursLeft);

    return (
      <TouchableOpacity
        style={[s.row, isUnread && s.rowUnread]}
        onPress={() => navigation.navigate('ChatDetail', {
          connId,
          otherUser: u,
          connection: item.connection,
        })}>

        {/* Avatar + online dot */}
        <View style={s.avWrap}>
          {photo
            ? <Image source={{uri:photo}} style={s.av} />
            : <View style={s.avFallback}><Text style={s.avInit}>{initials(u.name)}</Text></View>
          }
          {isOnline && <View style={s.onlineDot} />}
        </View>

        {/* Name + preview */}
        <View style={s.info}>
          <View style={s.nameRow}>
            <Text style={[s.name, isUnread && s.nameUnread]} numberOfLines={1}>
              {u.name||'—'}
            </Text>
            {hasPriority && (
              <View style={s.priorityBadge}><Text style={s.priorityTxt}>⚡</Text></View>
            )}
          </View>
          <Text style={[s.preview, isUnread && s.previewUnread]} numberOfLines={1}>
            {preview}
          </Text>
        </View>

        {/* Time + status */}
        <View style={s.meta}>
          {time ? <Text style={s.time}>{fmtTime(time)}</Text> : null}
          {isUnread && <View style={s.unreadDot} />}
          {!isUnread && isPersist && (
            <View style={s.timerBlue}><Text style={s.timerTxt}>Active</Text></View>
          )}
          {!isUnread && !isPersist && expiryLabel && (
            <View style={hoursLeft < 12 ? s.timerRed : s.timerGray}>
              <Text style={s.timerTxt}>{expiryLabel}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  if (loading) return <View style={s.center}><ActivityIndicator color={C.gold} /></View>;

  return (
    <View style={s.screen}>
      <View style={s.header}>
        <Text style={s.title}>Chat</Text>
        <TouchableOpacity
          style={s.flashBtn}
          onPress={() => navigation.navigate('PriorityMessages')}>
          <Text style={s.flashTxt}>⚡</Text>
        </TouchableOpacity>
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
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.primary} />
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen:        { flex:1, backgroundColor:C.bg },
  center:        { flex:1, justifyContent:'center', alignItems:'center', padding:24 },
  header:        { flexDirection:'row', justifyContent:'space-between', alignItems:'center',
                   paddingHorizontal:20, paddingTop:18, paddingBottom:14,
                   borderBottomWidth:1, borderBottomColor:C.border },
  title:         { fontSize:26, color:C.text, fontWeight:'700' },
  flashBtn:      { width:36, height:36, borderRadius:18, backgroundColor:C.sur2,
                   borderWidth:1, borderColor:C.gold, justifyContent:'center', alignItems:'center' },
  flashTxt:      { fontSize:16 },

  row:           { flexDirection:'row', alignItems:'center', paddingHorizontal:16,
                   paddingVertical:14, borderBottomWidth:1, borderBottomColor:C.border },
  rowUnread:     { backgroundColor:'rgba(37,99,235,0.04)' },
  avWrap:        { marginRight:14, position:'relative' },
  av:            { width:52, height:52, borderRadius:26 },
  avFallback:    { width:52, height:52, borderRadius:26, backgroundColor:C.sur2,
                   justifyContent:'center', alignItems:'center' },
  avInit:        { color:C.gold, fontSize:18 },
  onlineDot:     { position:'absolute', bottom:1, right:1, width:12, height:12,
                   borderRadius:6, backgroundColor:C.green, borderWidth:2, borderColor:C.bg },

  info:          { flex:1, minWidth:0 },
  nameRow:       { flexDirection:'row', alignItems:'center', gap:6, marginBottom:3 },
  name:          { fontSize:15, color:C.text, flexShrink:1 },
  nameUnread:    { fontWeight:'700' },
  preview:       { fontSize:13, color:C.sub },
  previewUnread: { fontWeight:'500' },
  priorityBadge: { backgroundColor:C.goldBg, borderRadius:8, paddingHorizontal:5,
                   paddingVertical:1, borderWidth:1, borderColor:C.goldMid },
  priorityTxt:   { fontSize:10, color:C.gold },

  meta:          { alignItems:'flex-end', gap:5, minWidth:56 },
  time:          { fontSize:11, color:C.dim },
  unreadDot:     { width:9, height:9, borderRadius:5, backgroundColor:C.primary },
  timerBlue:     { backgroundColor:C.primaryLight, borderRadius:10, paddingHorizontal:8,
                   paddingVertical:2, borderWidth:1, borderColor:'rgba(37,99,235,0.25)' },
  timerGray:     { backgroundColor:C.sur2, borderRadius:10, paddingHorizontal:8,
                   paddingVertical:2, borderWidth:1, borderColor:C.border },
  timerRed:      { backgroundColor:'rgba(239,68,68,0.08)', borderRadius:10, paddingHorizontal:8,
                   paddingVertical:2, borderWidth:1, borderColor:'rgba(239,68,68,0.2)' },
  timerTxt:      { fontSize:11, color:C.sub },

  emptyIcon:     { fontSize:40, marginBottom:14, color:C.dim },
  emptyH:        { fontSize:20, color:C.text, marginBottom:8, fontWeight:'600' },
  emptySub:      { fontSize:14, color:C.sub, textAlign:'center', lineHeight:20 },
});
