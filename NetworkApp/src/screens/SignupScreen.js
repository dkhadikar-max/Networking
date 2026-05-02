import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import BYNLogo from '../components/BYNLogo';
import { C } from '../utils/theme';

const CONSENT_KEY = 'byn_consent_v1';

export default function SignupScreen({ navigation }) {
  const { signup } = useAuth();
  const [name,    setName]    = useState('');
  const [email,   setEmail]   = useState('');
  const [pw,      setPw]      = useState('');
  const [consent, setConsent] = useState(false);
  const [err,     setErr]     = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSignup() {
    setErr('');
    if (!name.trim())  { setErr('Please enter your full name'); return; }
    if (!email.trim()) { setErr('Please enter your email address'); return; }
    if (!pw)           { setErr('Please create a password'); return; }
    if (pw.length < 6) { setErr('Password must be at least 6 characters'); return; }
    if (!consent) {
      setErr('You must agree to the Terms & Conditions and Privacy Policy to continue');
      return;
    }

    setLoading(true);
    try {
      // Persist consent flag before API call
      await AsyncStorage.setItem(CONSENT_KEY, JSON.stringify({
        agreed: true,
        timestamp: new Date().toISOString(),
        version: '1.0',
      }));
      await signup(name.trim(), email.trim(), pw);
    } catch (e) {
      setErr(e.response?.data?.error || e.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">

        {/* Brand mark */}
        <View style={s.brandWrap}>
          <BYNLogo size={48} />
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
            returnKeyType="next"
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
            returnKeyType="next"
          />

          <Text style={s.label}>Password</Text>
          <TextInput
            style={s.input}
            placeholder="Min. 6 characters"
            placeholderTextColor={C.dim}
            value={pw}
            onChangeText={setPw}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleSignup}
          />

          {/* Consent checkbox — REQUIRED */}
          <TouchableOpacity
            style={s.consentRow}
            onPress={() => setConsent(v => !v)}
            activeOpacity={0.7}>
            <View style={[s.checkbox, consent && s.checkboxOn]}>
              {consent && <Text style={s.checkmark}>✓</Text>}
            </View>
            <Text style={s.consentTxt}>
              I agree to the Terms &amp; Conditions and Privacy Policy
              (accessible from Profile after signup)
            </Text>
          </TouchableOpacity>

          {!!err && (
            <View style={s.errBox}>
              <Text style={s.errTxt}>{err}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[s.btn, (!consent || loading) && s.btnDisabled]}
            onPress={handleSignup}
            disabled={loading || !consent}
            activeOpacity={0.85}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.btnTxt}>Create Account</Text>}
          </TouchableOpacity>
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
  wrap:        { flex: 1, backgroundColor: C.bg },
  inner:       { flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: 60 },

  brandWrap:   { alignItems: 'center', marginBottom: 32 },
  brandName:   { fontSize: 20, color: C.text, fontWeight: '700', marginTop: 12, marginBottom: 4, letterSpacing: -0.3 },
  brandTag:    { fontSize: 13, color: C.sub },

  card:        { backgroundColor: C.card, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: C.border, marginBottom: 24,
                 shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  heading:     { fontSize: 20, color: C.text, fontWeight: '700', marginBottom: 4 },
  sub:         { fontSize: 13, color: C.sub, marginBottom: 24 },
  label:       { fontSize: 12, color: C.sub, marginBottom: 6, letterSpacing: 0.5 },
  input:       { backgroundColor: C.bgSec, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 14, color: C.text, fontSize: 15, marginBottom: 16 },

  consentRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 16, marginTop: 4 },
  checkbox:    { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.border2, backgroundColor: C.bg,
                 justifyContent: 'center', alignItems: 'center', marginTop: 1, flexShrink: 0 },
  checkboxOn:  { backgroundColor: C.primary, borderColor: C.primary },
  checkmark:   { color: '#fff', fontSize: 13, fontWeight: '700' },
  consentTxt:  { flex: 1, fontSize: 13, color: C.sub, lineHeight: 20 },
  consentLink: { color: C.primary, fontWeight: '600' },

  errBox:      { backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' },
  errTxt:      { color: C.danger, fontSize: 13, lineHeight: 18 },

  btn:         { backgroundColor: C.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 4, marginBottom: 4, minHeight: 52 },
  btnDisabled: { backgroundColor: C.dim, opacity: 0.5 },
  btnTxt:      { color: '#fff', fontSize: 15, fontWeight: '700' },

  switchRow:   { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  switchTxt:   { color: C.sub, fontSize: 14 },
  switchLink:  { color: C.primary, fontSize: 14, fontWeight: '600' },
});
