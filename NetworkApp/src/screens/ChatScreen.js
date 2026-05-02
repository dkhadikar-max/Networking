import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  ScrollView, Image,
} from 'react-native';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { C } from '../utils/theme';

function initials(name) {
  return (name||'?').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ChatScreen({ route, navigation }) {
  // Params can come from ChatListScreen (new shape) or from LikesScreen match modal
  const params   = route.params || {};
  // Support both old shape { match, user } and new shape { connId, otherUser }
  const connId   = params.connId || params.match?.connection?.id || params.match?.match_id;
  const chatUser = params.otherUser || params.user || {};

  const { user: me } = useAuth();

  const [msgs,     setMsgs]     = useState([]);
  const [text,     setText]     = useState('');
  const [loading,  setLoading]  = useState(true);
  const [sending,  setSending]  = useState(false);
  const [starters, setStarters] = useState([]);
  const listRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => {
    if (!connId) { setLoading(false); return; }
    navigation.setOptions({ title: chatUser?.name || 'Chat' });
    loadMessages();
    loadStarters();
    pollRef.current = setInterval(loadMessages, 4000);
    return () => clearInterval(pollRef.current);
  }, [connId]);

  async function loadMessages() {
    if (!connId) return;
    try {
      const { data } = await api.get(`/api/messages/${connId}`);
      console.log('[Chat] messages:', data?.length);
      if (Array.isArray(data)) { setMsgs(data); setLoading(false); }
    } catch (e) {
      console.log('[Chat] loadMessages error:', e?.response?.data || e.message);
    }
  }

  async function loadStarters() {
    if (!connId) return;
    try {
      const { data } = await api.get(`/api/conversation-starters/${connId}`);
      setStarters(data.prompts || []);
    } catch {
      setStarters([
        'What are you currently exploring?',
        'What led you to this platform?',
        'What would a great conversation look like for you?',
      ]);
    }
  }

  async function send() {
    const t = text.trim();
    if (!t || !connId) return;
    setText('');
    setSending(true);
    try {
      const { data: msg } = await api.post(`/api/messages/${connId}`, { text: t });
      console.log('[Chat] sent:', msg?.id);
      await loadMessages();
    } catch (e) {
      setText(t); // restore on error
      console.log('[Chat] send error:', e?.response?.data || e.message);
    } finally { setSending(false); }
  }

  function renderMsg({ item }) {
    // mapMessage converts sender_id → from on the backend
    const mine = item.from === me?.id;
    return (
      <View style={[s.msgWrap, mine ? s.msgWrapMine : s.msgWrapTheirs]}>
        <View style={[s.bubble, mine ? s.bubbleMine : s.bubbleTheirs]}>
          <Text style={mine ? s.msgTxtMine : s.msgTxtTheirs}>{item.text}</Text>
          <Text style={[s.msgTime, { color: mine ? 'rgba(13,13,13,0.5)' : C.dim }]}>
            {fmtTime(item.created_at)}
          </Text>
        </View>
      </View>
    );
  }

  if (!connId) {
    return (
      <View style={s.center}>
        <Text style={{ color: C.sub, fontSize: 14 }}>Connection not found.</Text>
      </View>
    );
  }

  if (loading) return <View style={s.center}><ActivityIndicator color={C.gold} /></View>;

  const photo = (chatUser.photos || [])[0];

  return (
    <KeyboardAvoidingView
      style={s.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>

      {/* Header with avatar */}
      <TouchableOpacity
        style={s.chatHeader}
        onPress={() => navigation.navigate('UserProfile', { userId: chatUser.id })}>
        {photo
          ? <Image source={{uri:photo}} style={s.headerAv} />
          : <View style={s.headerAvFb}><Text style={s.headerAvInit}>{initials(chatUser.name)}</Text></View>
        }
        <View>
          <Text style={s.headerName}>{chatUser.name || '—'}</Text>
          {chatUser.location ? <Text style={s.headerSub}>{chatUser.location}</Text> : null}
        </View>
      </TouchableOpacity>

      <FlatList
        ref={listRef}
        data={msgs}
        keyExtractor={m => m.id}
        renderItem={renderMsg}
        contentContainerStyle={s.msgs}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListHeaderComponent={msgs.length === 0 && starters.length > 0 ? (
          <View style={s.startersWrap}>
            <Text style={s.startersLabel}>✦ Conversation starters</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.startersRow}>
              {starters.map(p => (
                <TouchableOpacity key={p} style={s.starter} onPress={() => setText(p)}>
                  <Text style={s.starterTxt}>{p}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        ) : null}
      />

      <View style={s.inputRow}>
        <TextInput
          style={s.input}
          value={text}
          onChangeText={setText}
          placeholder="Send a message…"
          placeholderTextColor={C.dim}
          multiline
          returnKeyType="send"
          blurOnSubmit={false}
        />
        <TouchableOpacity style={[s.sendBtn, (!text.trim()||sending) && {opacity:0.4}]}
          onPress={send} disabled={sending || !text.trim()}>
          {sending
            ? <ActivityIndicator color={C.bg} size="small" />
            : <Text style={s.sendTxt}>Send</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  screen:         { flex:1, backgroundColor:C.bg },
  center:         { flex:1, justifyContent:'center', alignItems:'center' },
  chatHeader:     { flexDirection:'row', alignItems:'center', gap:12, padding:14,
                    borderBottomWidth:1, borderBottomColor:C.border, backgroundColor:C.sur },
  headerAv:       { width:38, height:38, borderRadius:19 },
  headerAvFb:     { width:38, height:38, borderRadius:19, backgroundColor:C.sur2,
                    justifyContent:'center', alignItems:'center' },
  headerAvInit:   { color:C.gold, fontSize:14 },
  headerName:     { fontSize:15, color:C.text },
  headerSub:      { fontSize:11, color:C.sub },
  msgs:           { padding:16, gap:8, paddingBottom:8 },
  msgWrap:        { flexDirection:'row', marginBottom:4 },
  msgWrapMine:    { justifyContent:'flex-end' },
  msgWrapTheirs:  { justifyContent:'flex-start' },
  bubble:         { maxWidth:'75%', borderRadius:14, padding:12 },
  bubbleMine:     { backgroundColor:C.gold, borderBottomRightRadius:4 },
  bubbleTheirs:   { backgroundColor:C.sur2, borderWidth:1, borderColor:C.border, borderBottomLeftRadius:4 },
  msgTxtMine:     { color:C.bg, fontSize:14, lineHeight:20 },
  msgTxtTheirs:   { color:C.text, fontSize:14, lineHeight:20 },
  msgTime:        { fontSize:10, opacity:0.6, marginTop:4, textAlign:'right' },
  startersWrap:   { padding:16, paddingBottom:8 },
  startersLabel:  { color:C.gold, fontSize:12, marginBottom:10, letterSpacing:0.5 },
  startersRow:    { gap:8, paddingBottom:4 },
  starter:        { backgroundColor:C.sur, borderWidth:1, borderColor:C.border2,
                    borderRadius:20, paddingHorizontal:16, paddingVertical:10, maxWidth:260 },
  starterTxt:     { color:C.sub, fontSize:13, lineHeight:18 },
  inputRow:       { flexDirection:'row', padding:12, borderTopWidth:1, borderTopColor:C.border,
                    backgroundColor:C.sur, gap:10 },
  input:          { flex:1, backgroundColor:C.sur2, borderWidth:1, borderColor:C.border,
                    borderRadius:10, padding:12, color:C.text, fontSize:14, maxHeight:120 },
  sendBtn:        { backgroundColor:C.gold, borderRadius:10, paddingHorizontal:16,
                    justifyContent:'center', alignItems:'center' },
  sendTxt:        { color:C.bg, fontSize:14 },
});
