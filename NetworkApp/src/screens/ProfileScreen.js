import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Image, ActivityIndicator, Switch, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { C } from '../utils/theme';

function TrustBar({ score }) {
  return (
    <View>
      <View style={{ height:4, backgroundColor:C.sur2, borderRadius:4, marginVertical:10, overflow:'hidden' }}>
        <View style={{ width:`${score}%`, height:'100%', backgroundColor:C.gold }} />
      </View>
      <Text style={{ fontSize:11, color:C.sub }}>Trust score: {score}/100</Text>
    </View>
  );
}

function TrustSteps({ steps }) {
  if (!steps?.length) return null;
  return (
    <View style={{ marginTop:12 }}>
      {steps.map((s, i) => (
        <View key={i} style={{ flexDirection:'row', alignItems:'center', gap:6, marginBottom:5 }}>
          <Text style={{ fontSize:13, color: s.done ? C.gold : C.sub }}>{s.done ? '✓' : '○'}</Text>
          <Text style={{ fontSize:12, color: s.done ? C.gold : C.sub }}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}

export default function ProfileScreen({ navigation }) {
  const { user: me, logout, refreshUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [form, setForm]       = useState({});
  const [msg, setMsg]         = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get('/api/me');
      setProfile(data);
      setForm({
        name: data.name||'', bio: data.bio||'', location: data.location||'',
        remote: !!data.remote, intent: data.intent||'explore-network',
        currently_exploring: data.currently_exploring||'',
        working_on: data.working_on||'', interested_in: data.interested_in||'',
        linkedin: data.linkedin||'', instagram: data.instagram||'', website: data.website||'',
      });
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setLoading(false); }
  }

  async function save() {
    setSaving(true); setMsg('');
    try {
      const { data } = await api.put('/api/me', { ...form, skills: profile?.skills||[], interests: profile?.interests||[] });
      setProfile(data); await refreshUser();
      setMsg('Profile saved ✓');
      setTimeout(()=>setMsg(''), 2000);
    } catch (e) { setMsg(e.response?.data?.error || e.message); }
    finally { setSaving(false); }
  }

  async function addPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed','Allow photo access to add photos'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing:true, aspect:[1,1], quality:.8 });
    if (result.canceled) return;
    const uri = result.assets[0].uri;
    const filename = uri.split('/').pop();
    const fd = new FormData();
    fd.append('photo', { uri, name: filename, type: 'image/jpeg' });
    try {
      await api.post('/api/me/photos', fd, { headers:{'Content-Type':'multipart/form-data'} });
      load();
    } catch (e) { Alert.alert('Error', e.response?.data?.error || e.message); }
  }

  async function removePhoto(idx) {
    Alert.alert('Remove photo?','',[ {text:'Cancel',style:'cancel'}, {text:'Remove',style:'destructive',onPress:async()=>{
      try { await api.delete(`/api/me/photos/${idx}`); load(); }
      catch (e) { Alert.alert('Error', e.message); }
    }}]);
  }

  if (loading) return <View style={s.center}><ActivityIndicator color={C.gold} /></View>;

  const photos = profile?.photos || [];
  const initials = (profile?.name||'?').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.scroll}>
      {/* Avatar & trust */}
      <View style={s.sidebar}>
        <View style={s.avWrap}>
          {photos[0]
            ? <Image source={{uri:photos[0]}} style={s.av} />
            : <View style={s.avFallback}><Text style={s.avInit}>{initials}</Text></View>
          }
        </View>
        <Text style={s.sname}>{profile?.name||''}</Text>
        {me?.premium && <View style={s.proBadge}><Text style={s.proTxt}>⬡ PRO</Text></View>}
        <TrustBar score={profile?.trust_score||0} />
        <TrustSteps steps={profile?.trust_steps} />
      </View>

      {/* Photos */}
      <View style={s.panel}>
        <Text style={s.panelTitle}>Photos <Text style={s.panelSub}>(min 4 for full trust)</Text></Text>
        <View style={s.photoGrid}>
          {photos.map((url, i) => (
            <TouchableOpacity key={i} onLongPress={()=>removePhoto(i)} style={s.photoWrap}>
              <Image source={{uri:url}} style={s.photoThumb} />
              <TouchableOpacity style={s.photoRm} onPress={()=>removePhoto(i)}>
                <Text style={{color:'#fff',fontSize:10}}>×</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
          {photos.length < 6 && (
            <TouchableOpacity style={s.addPhoto} onPress={addPhoto}>
              <Text style={{color:C.gold,fontSize:24}}>+</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Form */}
      <View style={s.panel}>
        <Text style={s.panelTitle}>Identity</Text>
        {[['Name','name'],['Bio (optional)','bio'],['Location','location']].map(([label, key]) => (
          <View key={key} style={s.field}>
            <Text style={s.label}>{label}</Text>
            <TextInput style={s.input} value={form[key]||''} onChangeText={v=>setForm(f=>({...f,[key]:v}))} placeholder={label} placeholderTextColor={C.dim} multiline={key==='bio'} />
          </View>
        ))}
        <View style={s.field}>
          <Text style={s.label}>Open to remote</Text>
          <Switch value={!!form.remote} onValueChange={v=>setForm(f=>({...f,remote:v}))} trackColor={{false:C.border2,true:C.gold}} thumbColor={C.text} />
        </View>
      </View>

      <View style={s.panel}>
        <Text style={s.panelTitle}>Context</Text>
        {[['Currently exploring','currently_exploring'],['Working on','working_on']].map(([label,key])=>(
          <View key={key} style={s.field}>
            <Text style={s.label}>{label}</Text>
            <TextInput style={s.input} value={form[key]||''} onChangeText={v=>setForm(f=>({...f,[key]:v}))} placeholder={label} placeholderTextColor={C.dim} />
          </View>
        ))}
      </View>

      <View style={s.panel}>
        <Text style={s.panelTitle}>Links</Text>
        {[['LinkedIn','linkedin'],['Instagram','instagram'],['Website','website']].map(([label,key])=>(
          <View key={key} style={s.field}>
            <Text style={s.label}>{label}</Text>
            <TextInput style={s.input} value={form[key]||''} onChangeText={v=>setForm(f=>({...f,[key]:v}))} placeholder={label} placeholderTextColor={C.dim} autoCapitalize="none" />
          </View>
        ))}
      </View>

      {!!msg && <Text style={[s.msg, msg.includes('✓') ? {color:C.gold}:{color:C.danger}]}>{msg}</Text>}

      <TouchableOpacity style={s.saveBtn} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color={C.bg} /> : <Text style={s.saveTxt}>Save Profile</Text>}
      </TouchableOpacity>

      {!me?.premium && (
        <TouchableOpacity style={s.upgradeBtn} onPress={()=>navigation.navigate('Upgrade')}>
          <Text style={s.upgradeTxt}>⬡ Upgrade to Premium — ₹399/month</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={s.logoutBtn} onPress={logout}>
        <Text style={s.logoutTxt}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen:  { flex:1, backgroundColor:C.bg },
  scroll:  { padding:20, paddingBottom:40 },
  center:  { flex:1, justifyContent:'center', alignItems:'center' },
  sidebar: { backgroundColor:C.sur, borderWidth:1, borderColor:C.border, borderRadius:16, padding:20, alignItems:'center', marginBottom:16 },
  avWrap:  { marginBottom:12 },
  av:      { width:88, height:88, borderRadius:44 },
  avFallback:{ width:88, height:88, borderRadius:44, backgroundColor:C.sur2, justifyContent:'center', alignItems:'center' },
  avInit:  { fontSize:32, color:C.gold, fontWeight:'700' },
  sname:   { fontSize:18, fontWeight:'700', color:C.text, marginBottom:4 },
  proBadge:{ backgroundColor:C.goldBg, borderRadius:20, paddingHorizontal:12, paddingVertical:4, borderWidth:1, borderColor:C.gold, marginBottom:8 },
  proTxt:  { color:C.gold, fontSize:12, fontWeight:'600' },
  panel:   { backgroundColor:C.sur, borderWidth:1, borderColor:C.border, borderRadius:16, padding:16, marginBottom:12 },
  panelTitle:{ fontSize:15, fontWeight:'700', color:C.text, marginBottom:14, paddingBottom:10, borderBottomWidth:1, borderBottomColor:C.border },
  panelSub:{ fontSize:11, color:C.sub, fontWeight:'400' },
  photoGrid:{ flexDirection:'row', flexWrap:'wrap', gap:8 },
  photoWrap:{ position:'relative', width:76, height:76 },
  photoThumb:{ width:76, height:76, borderRadius:8 },
  photoRm: { position:'absolute', top:3, right:3, backgroundColor:'rgba(0,0,0,0.6)', borderRadius:10, width:18, height:18, justifyContent:'center', alignItems:'center' },
  addPhoto:{ width:76, height:76, borderWidth:1, borderColor:C.border2, borderRadius:8, borderStyle:'dashed', justifyContent:'center', alignItems:'center' },
  field:   { marginBottom:12 },
  label:   { fontSize:11, color:C.sub, textTransform:'uppercase', letterSpacing:0.8, marginBottom:6, fontWeight:'600' },
  input:   { backgroundColor:C.sur2, borderWidth:1, borderColor:C.border, borderRadius:10, padding:12, color:C.text, fontSize:14 },
  msg:     { textAlign:'center', fontSize:13, marginBottom:10 },
  saveBtn: { backgroundColor:C.gold, borderRadius:10, padding:15, alignItems:'center', marginBottom:10 },
  saveTxt: { color:C.bg, fontWeight:'700', fontSize:15 },
  upgradeBtn:{ borderWidth:1, borderColor:C.gold, borderRadius:10, padding:14, alignItems:'center', marginBottom:10 },
  upgradeTxt:{ color:C.gold, fontWeight:'600', fontSize:14 },
  logoutBtn: { borderWidth:1, borderColor:C.border2, borderRadius:10, padding:13, alignItems:'center', marginTop:8 },
  logoutTxt: { color:C.sub, fontSize:14 },
});
