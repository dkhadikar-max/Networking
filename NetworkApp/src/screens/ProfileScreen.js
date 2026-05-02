import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet,
  Image, ActivityIndicator, Switch, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { C } from '../utils/theme';

// ── Constants ─────────────────────────────────────────────────────────────────
const INTENT_OPTIONS = [
  { value: 'explore-network',     label: 'Exploring network' },
  { value: 'exchange-ideas',      label: 'Exchanging ideas' },
  { value: 'learn-mentorship',    label: 'Learning / Mentorship' },
  { value: 'build-relationships', label: 'Building relationships' },
  { value: 'collaborate',         label: 'Collaborate on projects' },
  { value: 'find-cofounder',      label: 'Finding a co-founder' },
  { value: 'find-mentor',         label: 'Finding a mentor' },
  { value: 'hire',                label: 'Hiring talent' },
  { value: 'find-investors',      label: 'Finding investors' },
];

const INTEREST_OPTIONS = [
  'AI / ML', 'Startups', 'SaaS', 'Fintech', 'Design', 'Marketing',
  'Web3', 'Climate Tech', 'Health Tech', 'Edtech', 'Open Source',
  'Product Management', 'Sales', 'VC / Investing', 'Engineering',
  'Gaming', 'E-commerce', 'Creator Economy', 'No-code', 'Cybersecurity',
];

const SKILL_SUGGESTIONS = [
  'Python', 'React', 'Node.js', 'Product Design', 'UX Research', 'Growth',
  'Fundraising', 'Sales', 'Data Science', 'DevOps', 'iOS', 'Android',
  'Content Writing', 'SEO', 'Finance', 'Operations', 'Strategy', 'Leadership',
];

// ── Sub-components ────────────────────────────────────────────────────────────
function TrustBar({ score }) {
  const pct   = Math.min(score, 100);
  const label = pct >= 80 ? 'Excellent Profile'
              : pct >= 60 ? 'Strong Profile'
              : pct >= 40 ? 'Good Start'
              : pct >= 20 ? 'Discovery Unlocked'
              : 'Complete your profile';
  return (
    <View style={{ width:'100%' }}>
      <View style={{ flexDirection:'row', justifyContent:'space-between', marginBottom:8 }}>
        <Text style={{ fontSize:11, color:C.sub, textTransform:'uppercase', letterSpacing:0.8 }}>
          Profile Score
        </Text>
        <Text style={{ fontSize:12, color: pct >= 20 ? C.primary : C.dim, fontWeight:'600' }}>
          {pct}% · {label}
        </Text>
      </View>
      <View style={{ height:6, backgroundColor:C.primaryLight, borderRadius:3, overflow:'hidden' }}>
        <View style={{ width:`${pct}%`, height:'100%', backgroundColor:C.primary, borderRadius:3 }} />
      </View>
    </View>
  );
}

function TrustSteps({ steps }) {
  if (!steps?.length) return null;
  return (
    <View style={{ marginTop:14, width:'100%' }}>
      {steps.map((step, i) => (
        <View key={i} style={{ flexDirection:'row', alignItems:'center', gap:8, marginBottom:6 }}>
          <Text style={{ fontSize:13, color:step.done ? C.primary : C.dim }}>{step.done ? '✓' : '○'}</Text>
          <Text style={{ fontSize:12, color:step.done ? C.text : C.sub }}>{step.label}</Text>
        </View>
      ))}
    </View>
  );
}

function SectionHeader({ title }) {
  return <Text style={s.panelTitle}>{title}</Text>;
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function ProfileScreen({ navigation }) {
  const { user: me, logout, refreshUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setSaving2]  = useState(true);
  const [saving,  setSaving]   = useState(false);
  const [msg,     setMsg]      = useState('');

  // Form fields
  const [name,               setName]              = useState('');
  const [bio,                setBio]               = useState('');
  const [location,           setLocation]          = useState('');
  const [remote,             setRemote]            = useState(false);
  const [intent,             setIntent]            = useState('explore-network');
  const [currentlyExploring, setCurrentlyExploring]= useState('');
  const [workingOn,          setWorkingOn]         = useState('');
  const [linkedin,           setLinkedin]          = useState('');
  const [instagram,          setInstagram]         = useState('');
  const [website,            setWebsite]           = useState('');
  const [interests,          setInterests]         = useState([]);
  const [skills,             setSkills]            = useState([]);
  const [skillInput,         setSkillInput]        = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setSaving2(true);
    try {
      const { data } = await api.get('/api/me');
      setProfile(data);
      setName(data.name || '');
      setBio(data.bio || '');
      setLocation(data.location || '');
      setRemote(!!data.remote);
      setIntent(data.intent || 'explore-network');
      setCurrentlyExploring(data.currently_exploring || '');
      setWorkingOn(data.working_on || '');
      setLinkedin(data.linkedin || '');
      setInstagram(data.instagram || '');
      setWebsite(data.website || '');
      setInterests(data.interests || []);
      setSkills(data.skills || []);
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setSaving2(false); }
  }

  async function save() {
    setSaving(true); setMsg('');
    try {
      const { data } = await api.put('/api/me', {
        name, bio, location, remote, intent,
        currently_exploring: currentlyExploring,
        working_on: workingOn,
        linkedin, instagram, website,
        interests, skills,
      });
      setProfile(data);
      await refreshUser();
      setMsg('Profile saved ✓');
      setTimeout(() => setMsg(''), 2500);
    } catch (e) { setMsg(e.response?.data?.error || e.message); }
    finally { setSaving(false); }
  }

  async function addPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo access to add photos'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.8,
    });
    if (result.canceled) return;
    const uri = result.assets[0].uri;
    const filename = uri.split('/').pop();
    const fd = new FormData();
    fd.append('photo', { uri, name: filename, type: 'image/jpeg' });
    try {
      await api.post('/api/me/photos', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      load();
    } catch (e) { Alert.alert('Upload error', e.response?.data?.error || e.message); }
  }

  async function removePhoto(idx) {
    Alert.alert('Remove photo?', '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await api.delete(`/api/me/photos/${idx}`); load(); }
        catch (e) { Alert.alert('Error', e.message); }
      }},
    ]);
  }

  function toggleInterest(val) {
    setInterests(prev =>
      prev.includes(val) ? prev.filter(x => x !== val) : [...prev, val]
    );
  }

  function addSkill() {
    const sk = skillInput.trim();
    if (!sk || skills.includes(sk) || skills.length >= 10) return;
    setSkills(prev => [...prev, sk]);
    setSkillInput('');
  }

  function removeSkill(sk) {
    setSkills(prev => prev.filter(x => x !== sk));
  }

  function addSuggestedSkill(sk) {
    if (!skills.includes(sk) && skills.length < 10) setSkills(prev => [...prev, sk]);
  }

  if (loading) return <View style={s.center}><ActivityIndicator color={C.primary} size="large" /></View>;

  const photos = profile?.photos || [];
  const inits  = (profile?.name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView style={s.screen} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <View style={s.hero}>
          <View style={s.avWrap}>
            {photos[0]
              ? <Image source={{ uri: photos[0] }} style={s.av} />
              : <View style={s.avFallback}><Text style={s.avInit}>{inits}</Text></View>}
            {me?.premium && (
              <View style={s.proBadge}><Text style={s.proTxt}>PRO</Text></View>
            )}
          </View>
          <Text style={s.sname}>{profile?.name || 'Your Profile'}</Text>
          {intent && (
            <Text style={s.heroSub}>
              {INTENT_OPTIONS.find(o => o.value === intent)?.label || ''}
            </Text>
          )}
          <View style={{ height:16 }} />
          <TrustBar score={profile?.trust_score || 0} />
          <TrustSteps steps={profile?.trust_steps} />
        </View>

        {/* ── Photos ──────────────────────────────────────────────────────── */}
        <View style={s.panel}>
          <SectionHeader title={`Photos  ${photos.length < 4 ? `(${photos.length}/4 min for trust score)` : '✓'}`} />
          <View style={s.photoGrid}>
            {photos.map((url, i) => (
              <View key={i} style={s.photoWrap}>
                <Image source={{ uri: url }} style={s.photoThumb} />
                <TouchableOpacity style={s.photoRm} onPress={() => removePhoto(i)}>
                  <Text style={{ color: '#fff', fontSize: 10 }}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
            {photos.length < 6 && (
              <TouchableOpacity style={s.addPhoto} onPress={addPhoto}>
                <Text style={{ color: C.primary, fontSize: 24 }}>+</Text>
                <Text style={{ color: C.dim, fontSize: 10, marginTop: 2 }}>Add</Text>
              </TouchableOpacity>
            )}
          </View>
          {photos.length < 4 && (
            <Text style={s.hint}>⚠ Upload at least 4 photos to unlock discovery (+20 trust pts)</Text>
          )}
        </View>

        {/* ── Identity ────────────────────────────────────────────────────── */}
        <View style={s.panel}>
          <SectionHeader title="Identity" />

          <Text style={s.label}>Full Name</Text>
          <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={C.dim} />

          <Text style={s.label}>Bio <Text style={s.pts}>(+10 trust pts — write at least 10 chars)</Text></Text>
          <TextInput style={[s.input, { height: 90, textAlignVertical: 'top' }]}
            value={bio} onChangeText={setBio} placeholder="What drives you professionally…"
            placeholderTextColor={C.dim} multiline />

          <Text style={s.label}>Location <Text style={s.pts}>(+10 trust pts)</Text></Text>
          <TextInput style={s.input} value={location} onChangeText={setLocation}
            placeholder="City, Country" placeholderTextColor={C.dim} />

          <View style={s.switchRow}>
            <Text style={s.label}>Open to remote</Text>
            <Switch value={remote} onValueChange={setRemote}
              trackColor={{ false: C.border2, true: C.primary }} thumbColor={C.text} />
          </View>
        </View>

        {/* ── Networking Goal ──────────────────────────────────────────────── */}
        <View style={s.panel}>
          <SectionHeader title="Networking Goal  (+10 trust pts)" />
          <View style={s.chipWrap}>
            {INTENT_OPTIONS.map(opt => (
              <TouchableOpacity key={opt.value}
                style={[s.chip, intent === opt.value && s.chipOn]}
                onPress={() => setIntent(opt.value)}>
                <Text style={[s.chipTxt, intent === opt.value && s.chipTxtOn]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Interests ───────────────────────────────────────────────────── */}
        <View style={s.panel}>
          <SectionHeader title={`Interests  ${interests.length >= 3 ? '✓ (+20 trust pts)' : `(${interests.length}/3 min · +20 trust pts)`}`} />
          <View style={s.chipWrap}>
            {INTEREST_OPTIONS.map(opt => (
              <TouchableOpacity key={opt}
                style={[s.chip, interests.includes(opt) && s.chipOn]}
                onPress={() => toggleInterest(opt)}>
                <Text style={[s.chipTxt, interests.includes(opt) && s.chipTxtOn]}>{opt}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Skills ──────────────────────────────────────────────────────── */}
        <View style={s.panel}>
          <SectionHeader title={`Skills  (${skills.length}/10 max)`} />
          {/* Added skills */}
          {skills.length > 0 && (
            <View style={[s.chipWrap, { marginBottom: 12 }]}>
              {skills.map(sk => (
                <TouchableOpacity key={sk} style={[s.chip, s.chipOn]}
                  onPress={() => removeSkill(sk)}>
                  <Text style={s.chipTxtOn}>{sk} ×</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {/* Type + add */}
          <View style={s.skillRow}>
            <TextInput style={[s.input, { flex: 1, marginBottom: 0 }]}
              value={skillInput} onChangeText={setSkillInput}
              placeholder="Type a skill…" placeholderTextColor={C.dim}
              returnKeyType="done" onSubmitEditing={addSkill} />
            <TouchableOpacity style={s.addSkillBtn} onPress={addSkill}>
              <Text style={{ color: C.bg, fontSize: 13 }}>Add</Text>
            </TouchableOpacity>
          </View>
          {/* Suggestions */}
          <Text style={[s.pts, { marginTop: 10, marginBottom: 6, color: C.sub }]}>Suggestions:</Text>
          <View style={s.chipWrap}>
            {SKILL_SUGGESTIONS.filter(sk => !skills.includes(sk)).slice(0, 12).map(sk => (
              <TouchableOpacity key={sk} style={s.chip} onPress={() => addSuggestedSkill(sk)}>
                <Text style={s.chipTxt}>+ {sk}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Context ─────────────────────────────────────────────────────── */}
        <View style={s.panel}>
          <SectionHeader title="What you're up to" />
          <Text style={s.label}>Currently exploring</Text>
          <TextInput style={s.input} value={currentlyExploring} onChangeText={setCurrentlyExploring}
            placeholder="e.g. AI product development" placeholderTextColor={C.dim} />
          <Text style={s.label}>Working on</Text>
          <TextInput style={s.input} value={workingOn} onChangeText={setWorkingOn}
            placeholder="e.g. Building a SaaS platform" placeholderTextColor={C.dim} />
        </View>

        {/* ── Links ───────────────────────────────────────────────────────── */}
        <View style={s.panel}>
          <SectionHeader title="Links  (+10 trust pts — add at least one)" />
          {[
            ['LinkedIn URL', linkedin, setLinkedin, 'https://linkedin.com/in/…'],
            ['Instagram handle', instagram, setInstagram, '@yourhandle'],
            ['Website / Portfolio', website, setWebsite, 'https://yoursite.com'],
          ].map(([label, val, setter, ph]) => (
            <View key={label}>
              <Text style={s.label}>{label}</Text>
              <TextInput style={s.input} value={val} onChangeText={setter}
                placeholder={ph} placeholderTextColor={C.dim}
                autoCapitalize="none" autoCorrect={false} />
            </View>
          ))}
        </View>

        {/* ── Save / status ────────────────────────────────────────────────── */}
        {!!msg && (
          <Text style={[s.msgTxt, { color: msg.includes('✓') ? C.primary : C.danger }]}>{msg}</Text>
        )}

        <TouchableOpacity style={s.saveBtn} onPress={save} disabled={saving}>
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.saveTxt}>Save Profile</Text>}
        </TouchableOpacity>

        {!me?.premium && (
          <TouchableOpacity style={s.upgradeBtn} onPress={() => navigation.navigate('Upgrade')}>
            <Text style={s.upgradeTxt}>⬡ Upgrade to Premium</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={s.logoutBtn} onPress={logout}>
          <Text style={s.logoutTxt}>Sign Out</Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen:     { flex: 1, backgroundColor: C.bg },
  scroll:     { padding: 16, paddingBottom: 48 },
  center:     { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // ── Hero ──────────────────────────────────────────────────────────────────
  hero:       { backgroundColor: C.sur, borderWidth: 1, borderColor: C.border, borderRadius: 16,
                padding: 24, marginBottom: 14, alignItems: 'center' },
  avWrap:     { position: 'relative', marginBottom: 4 },
  av:         { width: 96, height: 96, borderRadius: 48, borderWidth: 2, borderColor: C.border2 },
  avFallback: { width: 96, height: 96, borderRadius: 48, backgroundColor: C.sur2,
                borderWidth: 2, borderColor: C.border2,
                justifyContent: 'center', alignItems: 'center' },
  avInit:     { fontSize: 36, color: C.primary },
  proBadge:   { position: 'absolute', bottom: 0, right: -4,
                backgroundColor: C.accent, borderRadius: 10, paddingHorizontal: 7,
                paddingVertical: 2 },
  proTxt:     { color: C.bg, fontSize: 9, fontWeight: '700' },
  sname:      { fontSize: 22, color: C.text, fontWeight: '700', marginTop: 12, marginBottom: 2 },
  heroSub:    { fontSize: 13, color: C.sub, marginBottom: 4 },

  // ── Panels ────────────────────────────────────────────────────────────────
  panel:      { backgroundColor: C.sur, borderWidth: 1, borderColor: C.border, borderRadius: 16,
                padding: 16, marginBottom: 14 },
  panelTitle: { fontSize: 13, color: C.text, fontWeight: '600', marginBottom: 14,
                paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.border,
                textTransform: 'uppercase', letterSpacing: 0.5 },
  pts:        { fontSize: 11, color: C.dim },
  hint:       { fontSize: 12, color: '#F59E0B', marginTop: 10, lineHeight: 18 },

  photoGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoWrap:  { position: 'relative', width: 76, height: 76 },
  photoThumb: { width: 76, height: 76, borderRadius: 10 },
  photoRm:    { position: 'absolute', top: 3, right: 3, backgroundColor: 'rgba(0,0,0,0.7)',
                borderRadius: 10, width: 18, height: 18, justifyContent: 'center', alignItems: 'center' },
  addPhoto:   { width: 76, height: 76, borderWidth: 1, borderColor: C.border2, borderRadius: 10,
                borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center' },

  label:      { fontSize: 11, color: C.sub, textTransform: 'uppercase', letterSpacing: 0.8,
                marginBottom: 6, marginTop: 12 },
  input:      { backgroundColor: C.sur2, borderWidth: 1, borderColor: C.border, borderRadius: 10,
                padding: 12, color: C.text, fontSize: 14, marginBottom: 4 },
  switchRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },

  // ── Chips (blue selection) ────────────────────────────────────────────────
  chipWrap:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:       { backgroundColor: C.sur2, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
                borderWidth: 1, borderColor: C.border },
  chipOn:     { backgroundColor: C.primary, borderColor: C.primary },
  chipTxt:    { fontSize: 12, color: C.sub },
  chipTxtOn:  { fontSize: 12, color: '#fff' },

  skillRow:   { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addSkillBtn:{ backgroundColor: C.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 },

  // ── Bottom actions ────────────────────────────────────────────────────────
  msgTxt:     { textAlign: 'center', fontSize: 13, marginBottom: 10 },
  saveBtn:    { backgroundColor: C.primary, borderRadius: 14, padding: 16,
                alignItems: 'center', marginBottom: 12,
                shadowColor: C.primary, shadowOpacity: 0.4, shadowRadius: 10,
                shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  saveTxt:    { color: '#fff', fontSize: 15, fontWeight: '600' },
  upgradeBtn: { borderWidth: 1.5, borderColor: C.gold, borderRadius: 14, padding: 14,
                alignItems: 'center', marginBottom: 12 },
  upgradeTxt: { color: C.gold, fontSize: 14 },
  logoutBtn:  { borderWidth: 1, borderColor: C.border2, borderRadius: 14, padding: 13,
                alignItems: 'center', marginTop: 4, marginBottom: 20 },
  logoutTxt:  { color: C.dim, fontSize: 14 },
});
