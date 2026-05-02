import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Image, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../utils/api';
import { C } from '../utils/theme';

function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffH = (now - d) / 3600000;
  if (diffH < 1)  return `${Math.round(diffH * 60)}m ago`;
  if (diffH < 24) return `${Math.round(diffH)}h ago`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function PriorityScreen({ navigation }) {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab,        setTab]        = useState('received'); // 'received' | 'sent'

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    try {
      const { data: res } = await api.get('/api/priority-messages');
      console.log('[Priority] received:', res?.received?.length, 'sent:', res?.sent?.length);
      setData(res);
    } catch (e) {
      console.log('[Priority] error:', e?.response?.data || e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function renderReceived({ item }) {
    const sender = item.sender || {};
    const photo  = (sender.photos || [])[0];
    return (
      <TouchableOpacity
        style={s.row}
        onPress={() => navigation.navigate('UserProfile', { userId: sender.id })}>
        <View style={s.avWrap}>
          {photo
            ? <Image source={{ uri: photo }} style={s.av} />
            : <View style={s.avFb}><Text style={s.avInit}>{initials(sender.name)}</Text></View>}
          <View style={s.flash}><Text style={{ fontSize: 9 }}>⚡</Text></View>
        </View>
        <View style={s.info}>
          <View style={s.nameRow}>
            <Text style={s.name} numberOfLines={1}>{sender.name || '—'}</Text>
            <Text style={s.time}>{fmtTime(item.created_at)}</Text>
          </View>
          {sender.location ? <Text style={s.loc} numberOfLines={1}>📍 {sender.location}</Text> : null}
          <Text style={s.msgTxt} numberOfLines={2}>{item.text}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  function renderSent({ item }) {
    return (
      <View style={[s.row, { opacity: 0.75 }]}>
        <View style={s.avWrap}>
          <View style={[s.av, { backgroundColor: C.sur2, justifyContent: 'center', alignItems: 'center' }]}>
            <Text style={{ color: C.gold, fontSize: 10 }}>⚡</Text>
          </View>
        </View>
        <View style={s.info}>
          <View style={s.nameRow}>
            <Text style={s.name} numberOfLines={1}>To: {item.to || item.to_user || '—'}</Text>
            <Text style={s.time}>{fmtTime(item.created_at)}</Text>
          </View>
          <Text style={s.msgTxt} numberOfLines={2}>{item.text}</Text>
        </View>
      </View>
    );
  }

  if (loading) return <View style={s.center}><ActivityIndicator color={C.gold} /></View>;

  const received = data?.received || [];
  const sent     = data?.sent     || [];
  const remaining = data?.remaining ?? '—';
  const limit     = data?.limit    ?? 3;

  const listData = tab === 'received' ? received : sent;

  return (
    <View style={s.screen}>
      <View style={s.header}>
        <Text style={s.title}>⚡ Priority Messages</Text>
        <Text style={s.rem}>{remaining}/{limit} remaining</Text>
      </View>

      {/* Tab switcher */}
      <View style={s.tabs}>
        <TouchableOpacity style={[s.tab, tab === 'received' && s.tabOn]}
          onPress={() => setTab('received')}>
          <Text style={[s.tabTxt, tab === 'received' && s.tabTxtOn]}>
            Received {received.length > 0 ? `(${received.length})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tab, tab === 'sent' && s.tabOn]}
          onPress={() => setTab('sent')}>
          <Text style={[s.tabTxt, tab === 'sent' && s.tabTxtOn]}>
            Sent {sent.length > 0 ? `(${sent.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {!listData.length ? (
        <View style={s.center}>
          <Text style={s.emptyIcon}>⚡</Text>
          <Text style={s.emptyH}>{tab === 'received' ? 'No priority messages yet' : 'No sent messages'}</Text>
          <Text style={s.emptySub}>
            {tab === 'received'
              ? 'When someone sends you a priority message it will appear here.'
              : 'Use the ⚡ Msg button on Discover cards to reach people directly.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={item => item.id}
          renderItem={tab === 'received' ? renderReceived : renderSent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.gold} />
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen:   { flex: 1, backgroundColor: C.bg },
  center:   { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  header:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
              padding: 20, paddingTop: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  title:    { fontSize: 20, color: C.text },
  rem:      { fontSize: 12, color: C.gold },
  tabs:     { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border },
  tab:      { flex: 1, padding: 14, alignItems: 'center' },
  tabOn:    { borderBottomWidth: 2, borderBottomColor: C.gold },
  tabTxt:   { fontSize: 14, color: C.sub },
  tabTxtOn: { color: C.gold },
  row:      { flexDirection: 'row', padding: 16, borderBottomWidth: 1, borderBottomColor: C.border, alignItems: 'flex-start' },
  avWrap:   { position: 'relative', marginRight: 14 },
  av:       { width: 48, height: 48, borderRadius: 24 },
  avFb:     { width: 48, height: 48, borderRadius: 24, backgroundColor: C.sur2,
              justifyContent: 'center', alignItems: 'center' },
  avInit:   { color: C.gold, fontSize: 16 },
  flash:    { position: 'absolute', bottom: -2, right: -2, width: 18, height: 18, borderRadius: 9,
              backgroundColor: C.gold, justifyContent: 'center', alignItems: 'center',
              borderWidth: 2, borderColor: C.bg },
  info:     { flex: 1 },
  nameRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  name:     { fontSize: 15, color: C.text, flex: 1 },
  time:     { fontSize: 11, color: C.dim, marginLeft: 8 },
  loc:      { fontSize: 11, color: C.sub, marginBottom: 4 },
  msgTxt:   { fontSize: 13, color: C.sub, lineHeight: 18 },
  emptyIcon:{ fontSize: 40, color: C.gold, marginBottom: 14 },
  emptyH:   { fontSize: 18, color: C.text, marginBottom: 8 },
  emptySub: { fontSize: 13, color: C.sub, textAlign: 'center', lineHeight: 20 },
});
