import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, ScrollView,
} from 'react-native';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { C } from '../utils/theme';

export default function VerifyEmailScreen({ navigation }) {
  const { user, logout, refreshUser } = useAuth();
  const [code,       setCode]       = useState('');
  const [loading,    setLoading]    = useState(false);
  const [resending,  setResending]  = useState(false);
  const [error,      setError]      = useState('');
  const [success,    setSuccess]    = useState('');
  const [countdown,  setCountdown]  = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    // Focus input on mount
    setTimeout(() => inputRef.current?.focus(), 400);
  }, []);

  // Countdown timer for resend button
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  async function handleVerify() {
    const trimmed = code.trim();
    if (trimmed.length !== 6) { setError('Enter the 6-digit code'); return; }
    setLoading(true);
    setError('');
    try {
      await api.post('/api/auth/verify-otp', { code: trimmed });
      setSuccess('Email verified! ✓');
      // Refresh user so email_verified flag updates in AuthContext
      await refreshUser();
      // AppNavigator will automatically redirect to main tabs
    } catch(e) {
      setError(e.response?.data?.error || 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setError('');
    setSuccess('');
    try {
      await api.post('/api/auth/send-otp');
      setSuccess('New code sent — check your inbox');
      setCountdown(60);
      setCode('');
    } catch(e) {
      setError(e.response?.data?.error || 'Could not resend code');
    } finally {
      setResending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={s.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Icon */}
        <View style={s.iconBox}>
          <Text style={s.iconTxt}>✉️</Text>
        </View>

        <Text style={s.title}>Verify your email</Text>
        <Text style={s.sub}>
          We sent a 6-digit code to{'\n'}
          <Text style={s.email}>{user?.email}</Text>
        </Text>

        {/* Code input */}
        <TextInput
          ref={inputRef}
          style={s.codeInput}
          value={code}
          onChangeText={v => { setCode(v.replace(/\D/g, '').slice(0, 6)); setError(''); }}
          placeholder="000000"
          placeholderTextColor={C.dim}
          keyboardType="number-pad"
          maxLength={6}
          textAlign="center"
          returnKeyType="done"
          onSubmitEditing={handleVerify}
        />

        {error ? <Text style={s.errorTxt}>{error}</Text> : null}
        {success ? <Text style={s.successTxt}>{success}</Text> : null}

        {/* Verify button */}
        <TouchableOpacity
          style={[s.btn, (loading || code.length < 6) && s.btnDisabled]}
          onPress={handleVerify}
          disabled={loading || code.length < 6}
        >
          {loading
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.btnTxt}>Verify Email</Text>
          }
        </TouchableOpacity>

        {/* Resend */}
        <TouchableOpacity
          style={[s.resendBtn, (resending || countdown > 0) && s.resendBtnDisabled]}
          onPress={handleResend}
          disabled={resending || countdown > 0}
        >
          {resending
            ? <ActivityIndicator color={C.primary} size="small" />
            : <Text style={s.resendTxt}>
                {countdown > 0 ? `Resend in ${countdown}s` : 'Resend code'}
              </Text>
          }
        </TouchableOpacity>

        {/* Sign out link */}
        <TouchableOpacity style={s.logoutBtn} onPress={logout}>
          <Text style={s.logoutTxt}>Sign out</Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex:        { flex: 1, backgroundColor: C.bg },
  container:   { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },

  iconBox:     { width: 80, height: 80, borderRadius: 40, backgroundColor: C.primaryLight,
                 justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  iconTxt:     { fontSize: 36 },

  title:       { fontSize: 26, fontWeight: '700', color: C.text, marginBottom: 8, textAlign: 'center' },
  sub:         { fontSize: 15, color: C.sub, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  email:       { color: C.primary, fontWeight: '600' },

  codeInput:   { width: '100%', borderWidth: 2, borderColor: C.primary, borderRadius: 16,
                 fontSize: 32, fontWeight: '700', color: C.text, letterSpacing: 12,
                 paddingVertical: 18, backgroundColor: C.card, marginBottom: 12 },

  errorTxt:    { color: '#EF4444', fontSize: 14, marginBottom: 12, textAlign: 'center' },
  successTxt:  { color: C.green, fontSize: 14, marginBottom: 12, textAlign: 'center', fontWeight: '500' },

  btn:         { width: '100%', backgroundColor: C.primary, borderRadius: 14,
                 paddingVertical: 16, alignItems: 'center', marginBottom: 12 },
  btnDisabled: { backgroundColor: C.border2 },
  btnTxt:      { color: '#fff', fontSize: 16, fontWeight: '700' },

  resendBtn:         { paddingVertical: 12, paddingHorizontal: 24 },
  resendBtnDisabled: { opacity: 0.4 },
  resendTxt:         { color: C.primary, fontSize: 14, fontWeight: '500' },

  logoutBtn:   { marginTop: 24 },
  logoutTxt:   { color: C.sub, fontSize: 13, textDecorationLine: 'underline' },
});
