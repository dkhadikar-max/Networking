import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import api from '../utils/api';
import { C } from '../utils/theme';

export default function ResetPasswordScreen({ navigation, route }) {
  const email = route.params?.email || '';

  const [code,        setCode]        = useState('');
  const [newPw,       setNewPw]       = useState('');
  const [confirmPw,   setConfirmPw]   = useState('');
  const [showPw,      setShowPw]      = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [resending,   setResending]   = useState(false);
  const [countdown,   setCountdown]   = useState(60);
  const [err,         setErr]         = useState('');
  const [success,     setSuccess]     = useState('');
  const codeRef = useRef(null);

  useEffect(() => {
    setTimeout(() => codeRef.current?.focus(), 400);
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  async function handleResend() {
    setResending(true);
    setErr('');
    setSuccess('');
    try {
      await api.post('/api/auth/forgot-password', { email });
      setCountdown(60);
      setCode('');
      setSuccess('New code sent — check your inbox');
    } catch (e) {
      setErr(e.response?.data?.error || 'Could not resend — try again');
    } finally {
      setResending(false);
    }
  }

  async function handleReset() {
    if (code.trim().length !== 6) { setErr('Enter the 6-digit code'); return; }
    if (newPw.length < 6)         { setErr('Password must be at least 6 characters'); return; }
    if (newPw !== confirmPw)      { setErr('Passwords do not match'); return; }
    setErr('');
    setSuccess('');
    setLoading(true);
    try {
      await api.post('/api/auth/reset-password', { email, code: code.trim(), newPassword: newPw });
      setSuccess('Password reset! Signing you in…');
      setTimeout(() => navigation.navigate('Login'), 1500);
    } catch (e) {
      setErr(e.response?.data?.error || 'Reset failed — check the code and try again');
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = code.trim().length === 6 && newPw.length >= 6 && newPw === confirmPw;

  return (
    <KeyboardAvoidingView style={s.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">

        <View style={s.iconBox}>
          <Text style={s.iconTxt}>🔒</Text>
        </View>

        <Text style={s.title}>Reset your password</Text>
        <Text style={s.sub}>
          {'We sent a 6-digit code to\n'}
          <Text style={s.emailHighlight}>{email}</Text>
        </Text>

        {/* Code input */}
        <Text style={s.label}>Reset Code</Text>
        <TextInput
          ref={codeRef}
          style={s.codeInput}
          value={code}
          onChangeText={v => { setCode(v.replace(/\D/g, '').slice(0, 6)); setErr(''); }}
          placeholder="000000"
          placeholderTextColor={C.dim}
          keyboardType="number-pad"
          maxLength={6}
          textAlign="center"
          returnKeyType="next"
        />

        {/* New password */}
        <Text style={s.label}>New Password</Text>
        <View style={s.pwWrap}>
          <TextInput
            style={s.pwInput}
            placeholder="Min 6 characters"
            placeholderTextColor={C.dim}
            value={newPw}
            onChangeText={v => { setNewPw(v); setErr(''); }}
            secureTextEntry={!showPw}
            autoCapitalize="none"
            returnKeyType="next"
          />
          <TouchableOpacity style={s.eyeBtn} onPress={() => setShowPw(p => !p)}>
            <Text style={s.eyeTxt}>{showPw ? '🙈' : '👁'}</Text>
          </TouchableOpacity>
        </View>

        {/* Confirm password */}
        <Text style={s.label}>Confirm Password</Text>
        <TextInput
          style={[s.input, confirmPw.length > 0 && newPw !== confirmPw && s.inputError]}
          placeholder="Re-enter password"
          placeholderTextColor={C.dim}
          value={confirmPw}
          onChangeText={v => { setConfirmPw(v); setErr(''); }}
          secureTextEntry={!showPw}
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={handleReset}
        />

        {!!err     && <Text style={s.errTxt}>{err}</Text>}
        {!!success && <Text style={s.successTxt}>{success}</Text>}

        <TouchableOpacity
          style={[s.btn, (!canSubmit || loading) && s.btnDisabled]}
          onPress={handleReset}
          disabled={!canSubmit || loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnTxt}>Reset Password</Text>}
        </TouchableOpacity>

        {/* Resend */}
        <TouchableOpacity
          style={[s.resendBtn, (resending || countdown > 0) && s.resendDisabled]}
          onPress={handleResend}
          disabled={resending || countdown > 0}
        >
          {resending
            ? <ActivityIndicator color={C.primary} size="small" />
            : <Text style={s.resendTxt}>
                {countdown > 0 ? `Resend code in ${countdown}s` : 'Resend code'}
              </Text>}
        </TouchableOpacity>

        <TouchableOpacity style={s.backRow} onPress={() => navigation.navigate('Login')}>
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

  title:          { fontSize: 24, fontWeight: '700', color: C.text, marginBottom: 10, textAlign: 'center' },
  sub:            { fontSize: 14, color: C.sub, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  emailHighlight: { color: C.primary, fontWeight: '600' },

  label:      { alignSelf: 'flex-start', fontSize: 12, color: C.sub, marginBottom: 6,
                letterSpacing: 0.5, marginTop: 4 },

  codeInput:  { width: '100%', borderWidth: 2, borderColor: C.primary, borderRadius: 16,
                fontSize: 32, fontWeight: '700', color: C.text, letterSpacing: 12,
                paddingVertical: 18, backgroundColor: C.card, marginBottom: 20, textAlign: 'center' },

  pwWrap:     { width: '100%', flexDirection: 'row', alignItems: 'center',
                backgroundColor: C.sur2, borderWidth: 1, borderColor: C.border2,
                borderRadius: 10, marginBottom: 16 },
  pwInput:    { flex: 1, padding: 14, color: C.text, fontSize: 15 },
  eyeBtn:     { paddingHorizontal: 14 },
  eyeTxt:     { fontSize: 18 },

  input:      { width: '100%', backgroundColor: C.sur2, borderWidth: 1, borderColor: C.border2,
                borderRadius: 10, padding: 14, color: C.text, fontSize: 15, marginBottom: 16 },
  inputError: { borderColor: C.danger },

  errTxt:     { color: C.danger, fontSize: 13, marginBottom: 14, textAlign: 'center' },
  successTxt: { color: C.primary, fontSize: 13, marginBottom: 14, textAlign: 'center', fontWeight: '500' },

  btn:        { width: '100%', backgroundColor: C.primary, borderRadius: 12, padding: 16,
                alignItems: 'center', marginBottom: 12 },
  btnDisabled:{ opacity: 0.45 },
  btnTxt:     { color: '#fff', fontSize: 15, fontWeight: '700' },

  resendBtn:      { paddingVertical: 12, paddingHorizontal: 24 },
  resendDisabled: { opacity: 0.4 },
  resendTxt:      { color: C.primary, fontSize: 14, fontWeight: '500' },

  backRow:    { marginTop: 16 },
  backTxt:    { color: C.sub, fontSize: 13 },
});
