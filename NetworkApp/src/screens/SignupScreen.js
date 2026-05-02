import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { C } from '../utils/theme';

export default function SignupScreen({ navigation }) {
  const { signup } = useAuth();
  const [name,    setName]    = useState('');
  const [email,   setEmail]   = useState('');
  const [pw,      setPw]      = useState('');
  const [err,     setErr]     = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSignup() {
    setErr('');
    if (!name || !email || !pw) { setErr('All fields are required'); return; }
    if (pw.length < 6) { setErr('Password must be at least 6 characters'); return; }
    setLoading(true);
    try { await signup(name.trim(), email.trim(), pw); }
    catch (e) { setErr(e.response?.data?.error || e.message); }
    finally { setLoading(false); }
  }

  return (
    <KeyboardAvoidingView style={s.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">

        {/* Brand */}
        <View style={s.brandWrap}>
          <Text style={s.brandIcon}>✦</Text>
          <Text style={s.brandName}>Build Your Network</Text>
          <Text style={s.brandTag}>Connect with high-intent professionals</Text>
        </View>

        <View style={s.card}>
          <Text style={s.heading}>Create your account</Text>
          <Text style={s.sub}>Join a curated professional network</Text>

          <Text style={s.label}>Full Name</Text>
          <TextInput
            style={s.input}
            placeholder="Alex Johnson"
            placeholderTextColor={C.dim}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />

          <Text style={s.label}>Email</Text>
          <TextInput
            style={s.input}
            placeholder="you@example.com"
            placeholderTextColor={C.dim}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={s.label}>Password</Text>
          <TextInput
            style={s.input}
            placeholder="Min. 6 characters"
            placeholderTextColor={C.dim}
            value={pw}
            onChangeText={setPw}
            secureTextEntry
            onSubmitEditing={handleSignup}
          />

          {!!err && (
            <View style={s.errBox}>
              <Text style={s.errTxt}>{err}</Text>
            </View>
          )}

          <TouchableOpacity style={s.btn} onPress={handleSignup} disabled={loading}>
            {loading
              ? <ActivityIndicator color={C.bg} />
              : <Text style={s.btnTxt}>Create Account</Text>}
          </TouchableOpacity>

          <Text style={s.notice}>
            By joining, you agree to our terms. We verify all members to keep the community quality high.
          </Text>
        </View>

        <TouchableOpacity style={s.switchRow} onPress={() => navigation.navigate('Login')}>
          <Text style={s.switchTxt}>Already a member? </Text>
          <Text style={s.switchLink}>Sign in →</Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap:       { flex: 1, backgroundColor: C.bg },
  inner:      { flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: 60 },

  brandWrap:  { alignItems: 'center', marginBottom: 32 },
  brandIcon:  { fontSize: 32, color: C.gold, marginBottom: 10 },
  brandName:  { fontSize: 22, color: C.text, letterSpacing: 0.5, marginBottom: 6 },
  brandTag:   { fontSize: 13, color: C.sub },

  card:       { backgroundColor: C.sur, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: C.border, marginBottom: 24 },
  heading:    { fontSize: 20, color: C.text, marginBottom: 4 },
  sub:        { fontSize: 13, color: C.sub, marginBottom: 24 },
  label:      { fontSize: 12, color: C.sub, marginBottom: 6, letterSpacing: 0.5 },
  input:      { backgroundColor: C.sur2, borderWidth: 1, borderColor: C.border2, borderRadius: 10, padding: 14, color: C.text, fontSize: 15, marginBottom: 16 },

  errBox:     { backgroundColor: 'rgba(192,57,43,0.12)', borderRadius: 8, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(192,57,43,0.3)' },
  errTxt:     { color: '#F1948A', fontSize: 13 },

  btn:        { backgroundColor: C.gold, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 4, marginBottom: 16 },
  btnTxt:     { color: C.bg, fontSize: 15 },

  notice:     { color: C.dim, fontSize: 11, textAlign: 'center', lineHeight: 16 },

  switchRow:  { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  switchTxt:  { color: C.sub, fontSize: 14 },
  switchLink: { color: C.gold, fontSize: 14 },
});
