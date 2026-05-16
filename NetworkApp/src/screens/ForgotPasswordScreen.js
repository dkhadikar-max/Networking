import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import api from '../utils/api';
import { C } from '../utils/theme';

export default function ForgotPasswordScreen({ navigation }) {
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState('');

  async function handleSend() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) { setErr('Enter your email address'); return; }
    setErr('');
    setLoading(true);
    try {
      await api.post('/api/auth/forgot-password', { email: trimmed });
      navigation.navigate('ResetPassword', { email: trimmed });
    } catch (e) {
      setErr(e.response?.data?.error || 'Could not send reset code — try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">

        <View style={s.iconBox}>
          <Text style={s.iconTxt}>🔑</Text>
        </View>

        <Text style={s.title}>Forgot password?</Text>
        <Text style={s.sub}>Enter the email you signed up with and we'll send a reset code.</Text>

        <Text style={s.label}>Email</Text>
        <TextInput
          style={s.input}
          placeholder="you@example.com"
          placeholderTextColor={C.dim}
          value={email}
          onChangeText={v => { setEmail(v); setErr(''); }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="send"
          onSubmitEditing={handleSend}
        />

        {!!err && (
          <View style={s.errBox}>
            <Text style={s.errTxt}>{err}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[s.btn, (!email.trim() || loading) && s.btnDisabled]}
          onPress={handleSend}
          disabled={!email.trim() || loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnTxt}>Send Reset Code</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={s.backRow} onPress={() => navigation.goBack()}>
          <Text style={s.backTxt}>← Back to sign in</Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap:       { flex: 1, backgroundColor: C.bg },
  inner:      { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 28, paddingTop: 64 },

  iconBox:    { width: 80, height: 80, borderRadius: 40, backgroundColor: C.primaryLight,
                justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  iconTxt:    { fontSize: 36 },

  title:      { fontSize: 24, fontWeight: '700', color: C.text, marginBottom: 10, textAlign: 'center' },
  sub:        { fontSize: 14, color: C.sub, textAlign: 'center', lineHeight: 20, marginBottom: 28 },

  label:      { alignSelf: 'flex-start', fontSize: 12, color: C.sub, marginBottom: 6, letterSpacing: 0.5 },
  input:      { width: '100%', backgroundColor: C.sur2, borderWidth: 1, borderColor: C.border2,
                borderRadius: 10, padding: 14, color: C.text, fontSize: 15, marginBottom: 16 },

  errBox:     { width: '100%', backgroundColor: 'rgba(192,57,43,0.12)', borderRadius: 8,
                padding: 12, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(192,57,43,0.3)' },
  errTxt:     { color: '#F1948A', fontSize: 13 },

  btn:        { width: '100%', backgroundColor: C.primary, borderRadius: 12, padding: 16,
                alignItems: 'center', marginBottom: 16 },
  btnDisabled:{ opacity: 0.45 },
  btnTxt:     { color: '#fff', fontSize: 15, fontWeight: '700' },

  backRow:    { paddingVertical: 12 },
  backTxt:    { color: C.sub, fontSize: 14 },
});
