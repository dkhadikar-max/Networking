import React, { useState, useEffect, useRef } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { C } from '../utils/theme';

const PROMPTS = ["What are you currently exploring?","What led you here?","What would a great conversation look like for you?","What's something you wish more people thought about?"];

function fmtTime(iso) { return new Date(iso).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); }

export default function ChatScreen({ route, navigation }) {
  const { match, user: chatUser } = route.params;
  const { user: me } = useAuth();
  const connId = match.match_id;
  const [msgs, setMsgs]     = useState([]);
  const [text, setText]     = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => {
    navigation.setOptions({ title: chatUser?.name || 'Chat' });
    loadMessages();
    markRead();
    pollRef.current = setInterval(() => { loadMessages(); }, 4000);
    return () => clearInterval(pollRef.current);
  }, []);

  async function loadMessages() {
    try {
      const { data } = await api.get(`/api/messages/${connId}`);
      if (Array.isArray(data)) { setMsgs(data); setLoading(false); }
    } catch {}
  }

  async function markRead() {
    try { await api.post(`/api/messages/${connId}/read`); } catch {}
  }

  async function send() {
    const t = text.trim();
    if (!t) return;
    setText('');
    setSending(true);
    try { await api.post(`/api/messages/${connId}`, { text: t }); await loadMessages(); await markRead(); }
    catch (e) { setText(t); }
    finally { setSending(false); }
  }

  function usePrompt(p) { setText(p); }

  function renderMsg({ item }) {
    const mine = item.from === me?.id;
    return (
      <View style={[s.msgWrap, mine ? s.msgWrapMine : s.msgWrapTheirs]}>
        <View style={[s.bubble, mine ? s.bubbleMine : s.bubbleTheirs]}>
          <Text style={mine ? s.msgTxtMine : s.msgTxtTheirs}>{item.text}</Text>
          <Text style={s.msgTime}>{fmtTime(item.created_at)}</Text>
        </View>
      </View>
    );
  }

  if (loading) return <View style={s.center}><ActivityIndicator color={C.gold} /></View>;

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS==='ios'?'padding':undefined} keyboardVerticalOffset={90}>
      <FlatList
        ref={listRef}
        data={msgs}
        keyExtractor={m=>m.id}
        renderItem={renderMsg}
        contentContainerStyle={s.msgs}
        onContentSizeChange={()=>listRef.current?.scrollToEnd({animated:true})}
        ListHeaderComponent={!msgs.length ? (
          <View style={s.promptsWrap}>
            {PROMPTS.slice(0,3).map(p=>(
              <TouchableOpacity key={p} style={s.prompt} onPress={()=>usePrompt(p)}>
                <Text style={s.promptTxt}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      />
      <View style={s.inputRow}>
        <TextInput
          style={s.input} value={text} onChangeText={setText}
          placeholder="Send a message…" placeholderTextColor={C.dim}
          multiline onSubmitEditing={send} returnKeyType="send"
        />
        <TouchableOpacity style={s.sendBtn} onPress={send} disabled={sending}>
          {sending ? <ActivityIndicator color={C.bg} size="small" /> : <Text style={s.sendTxt}>Send</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  screen:   { flex:1, backgroundColor:C.bg },
  center:   { flex:1, justifyContent:'center', alignItems:'center' },
  msgs:     { padding:16, gap:8 },
  msgWrap:  { flexDirection:'row', marginBottom:4 },
  msgWrapMine:   { justifyContent:'flex-end' },
  msgWrapTheirs: { justifyContent:'flex-start' },
  bubble:   { maxWidth:'75%', borderRadius:14, padding:12 },
  bubbleMine:   { backgroundColor:C.gold, borderBottomRightRadius:4 },
  bubbleTheirs: { backgroundColor:C.sur2, borderWidth:1, borderColor:C.border, borderBottomLeftRadius:4 },
  msgTxtMine:   { color:C.bg, fontSize:14, lineHeight:20, fontWeight:'500' },
  msgTxtTheirs: { color:C.text, fontSize:14, lineHeight:20 },
  msgTime:  { fontSize:10, opacity:.55, marginTop:4, textAlign:'right', color:'inherit' },
  promptsWrap:{ padding:12, gap:8 },
  prompt:   { backgroundColor:C.sur, borderWidth:1, borderColor:C.border2, borderRadius:20, paddingHorizontal:14, paddingVertical:8 },
  promptTxt:{ color:C.sub, fontSize:13 },
  inputRow: { flexDirection:'row', padding:12, borderTopWidth:1, borderTopColor:C.border, backgroundColor:C.sur, gap:10 },
  input:    { flex:1, backgroundColor:C.sur2, borderWidth:1, borderColor:C.border, borderRadius:10, padding:12, color:C.text, fontSize:14, maxHeight:120 },
  sendBtn:  { backgroundColor:C.gold, borderRadius:10, paddingHorizontal:16, justifyContent:'center', alignItems:'center' },
  sendTxt:  { color:C.bg, fontWeight:'700', fontSize:14 },
});
