import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { C } from '../utils/theme';

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const [email, setEmail]   = useState('');
  const [pw, setPw]         = useState('');
  const [err, setErr]       = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setErr('');
    if (!email || !pw) { setErr('Email and password required'); return; }
    setLoading(true);
    try { await login(email.trim(), pw); }
    catch (e) { setErr(e.response?.data?.error || e.message); }
    finally { setLoading(false); }
  }

  return (
    <KeyboardAvoidingView style={s.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">
        <Text style={s.logo}>Network</Text>
        <Text style={s.heading}>Welcome back</Text>
        <Text style={s.sub}>Sign in to your account</Text>
        <TextInput style={s.input} placeholder="Email" placeholderTextColor={C.dim}
          value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <TextInput style={s.input} placeholder="Password" placeholderTextColor={C.dim}
          value={pw} onChangeText={setPw} secureTextEntry onSubmitEditing={handleLogin} />
        {!!err && <Text style={s.err}>{err}</Text>}
        <TouchableOpacity style={s.btn} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color={C.bg} /> : <Text style={s.btnTxt}>Sign In</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
          <Text style={s.switch}>New here? <Text style={s.link}>Create account</Text></Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap:    { flex:1, backgroundColor:C.bg },
  inner:   { flexGrow:1, justifyContent:'center', padding:28, paddingTop:60 },
  logo:    { fontSize:28, fontWeight:'700', color:C.gold, textAlign:'center', marginBottom:32, letterSpacing:1 },
  heading: { fontSize:24, fontWeight:'700', color:C.text, marginBottom:6 },
  sub:     { fontSize:14, color:C.sub, marginBottom:28 },
  input:   { backgroundColor:C.sur2, borderWidth:1, borderColor:C.border, borderRadius:10, padding:14, color:C.text, fontSize:15, marginBottom:14 },
  err:     { color:C.danger, fontSize:13, marginBottom:12 },
  btn:     { backgroundColor:C.gold, borderRadius:10, padding:15, alignItems:'center', marginBottom:20 },
  btnTxt:  { color:C.bg, fontWeight:'700', fontSize:15 },
  switch:  { textAlign:'center', color:C.sub, fontSize:14 },
  link:    { color:C.gold, fontWeight:'600' },
});
