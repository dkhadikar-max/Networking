import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, ScrollView, Switch,
} from 'react-native';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { C } from '../utils/theme';

export default function VerifyEmailScreen() {
  const { user, logout, refreshUser, markDeviceVerified } = useAuth();

  const [code,      setCode]      = useState('');
  const [loading,   setLoading]   = useState(false);
  const [sending,   setSending]   = useState(false);  // auto-send on mount
  const [resending, setResending] = useState(false);
  const [remember,  setRemember]  = useState(true);   // "Remember for 7 days" toggle
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState('');
  const [countdown, setCountdown] = useState(0);
  const [codeSent,  setCodeSent]  = useState(false);
  const inputRef = useRef(null);

  // Auto-send OTP the moment screen appears — user doesn't have to press anything
  useEffect(() => {
    sendCode(true);
  }, []);

  // Countdown ticker for resend throttle
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  async function sendCode(isInitial = false) {
    if (isInitial) setSending(true);
    else           setResending(true);
    setError('');
    if (!isInitial) setSuccess('');

    try {
      await api.post('/api/auth/send-otp');
      setCodeSent(true);
      setCountdown(60);
      if (!isInitial) {
        setSuccess('New code sent — check your inbox');
        setCode('');
      }
      setTimeout(() => inputRef.current?.focus(), 400);
    } catch (e) {
      setError(e.response?.data?.error || 'Could not send code — please try again');
    } finally {
      if (isInitial) setSending(false);
      else           setResending(false);
    }
  }

  async function handleVerify() {
    const trimmed = code.trim();
    if (trimmed.length !== 6) { setError('Enter the 6-digit code'); return; }
    setLoading(true);
    setError('');
    try {
      await api.post('/api/auth/verify-otp', { code: trimmed });
      setSuccess('Email verified! ✓');
      // Mark device as remembered BEFORE refreshUser so the gate sees emailVerified=true
      await markDeviceVerified(remember);
      await refreshUser();
      // AppNavigator gate transitions automatically once emailVerified is true
    } catch (e) {
      setError(e.response?.data?.error || 'Incorrect code — try again');
    } finally {
      setLoading(false);
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
        <View style={s.iconBox}>
          <Text style={s.iconTxt}>✉️</Text>
        </View>

        <Text style={s.title}>Verify your email</Text>

        {sending ? (
          <View style={s.sendingRow}>
            <ActivityIndicator color={C.primary} size="small" />
            <Text style={s.sendingTxt}>Sending code to {user?.email}…</Text>
          </View>
        ) : (
          <Text style={s.sub}>
            {'We sent a 6-digit code to\n'}
            <Text style={s.emailHighlight}>{user?.email}</Text>
          </Text>
        )}

        {/* Code input — shown only after first send succeeds */}
        {codeSent && !sending && (
          <>
            <TextInput
              ref={inputRef}
              style={s.codeInput}
              value={code}
              onChangeText={v => {
                setCode(v.replace(/\D/g, '').slice(0, 6));
                setError('');
              }}
              placeholder="000000"
              placeholderTextColor={C.dim}
              keyboardType="number-pad"
              maxLength={6}
              textAlign="center"
              returnKeyType="done"
              onSubmitEditing={handleVerify}
            />

            {/* Remember device toggle */}
            <View style={s.rememberRow}>
              <View style={s.rememberLeft}>
                <Text style={s.rememberLabel}>Remember this device</Text>
                <Text style={s.rememberSub}>Skip verification for 7 days on re-login</Text>
              </View>
              <Switch
                value={remember}
                onValueChange={setRemember}
                trackColor={{ false: C.border2, true: C.primaryLight }}
                thumbColor={remember ? C.primary : '#f4f3f4'}
                ios_backgroundColor={C.border2}
              />
            </View>
          </>
        )}

        {!!error   && <Text style={s.errorTxt}>{error}</Text>}
        {!!success && <Text style={s.successTxt}>{success}</Text>}

        {/* Verify button */}
        {codeSent && !sending && (
          <TouchableOpacity
            style={[s.btn, (loading || code.length < 6) && s.btnDisabled]}
            onPress={handleVerify}
            disabled={loading || code.length < 6}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.btnTxt}>Verify Email →</Text>
            }
          </TouchableOpacity>
        )}

        {/* Resend — disabled during countdown or while resending */}
        {!sending && (
          <TouchableOpacity
            style={[s.resendBtn, (resending || countdown > 0) && s.resendDisabled]}
            onPress={() => sendCode(false)}
            disabled={resending || countdown > 0}
          >
            {resending
              ? <ActivityIndicator color={C.primary} size="small" />
              : <Text style={s.resendTxt}>
                  {countdown > 0 ? `Resend in ${countdown}s` : 'Resend code'}
                </Text>
            }
          </TouchableOpacity>
        )}

        <TouchableOpacity style={s.logoutBtn} onPress={logout}>
          <Text style={s.logoutTxt}>Use a different account</Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex:           { flex: 1, backgroundColor: C.bg },
  container:      { flexGrow: 1, justifyContent: 'center', alignItems: 'center',
                    padding: 32, paddingTop: 64 },

  iconBox:        { width: 80, height: 80, borderRadius: 40,
                    backgroundColor: C.primaryLight, justifyContent: 'center',
                    alignItems: 'center', marginBottom: 24 },
  iconTxt:        { fontSize: 36 },

  title:          { fontSize: 26, fontWeight: '700', color: C.text,
                    marginBottom: 10, textAlign: 'center' },
  sub:            { fontSize: 15, color: C.sub, textAlign: 'center',
                    lineHeight: 22, marginBottom: 28 },
  emailHighlight: { color: C.primary, fontWeight: '600' },

  sendingRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 28 },
  sendingTxt:     { fontSize: 14, color: C.sub, flex: 1, flexWrap: 'wrap' },

  codeInput:      { width: '100%', borderWidth: 2, borderColor: C.primary,
                    borderRadius: 16, fontSize: 32, fontWeight: '700', color: C.text,
                    letterSpacing: 12, paddingVertical: 18,
                    backgroundColor: C.card, marginBottom: 20 },

  rememberRow:    { width: '100%', flexDirection: 'row', alignItems: 'center',
                    justifyContent: 'space-between', backgroundColor: C.card,
                    borderRadius: 12, padding: 14, borderWidth: 1,
                    borderColor: C.border, marginBottom: 20 },
  rememberLeft:   { flex: 1, marginRight: 12 },
  rememberLabel:  { fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 2 },
  rememberSub:    { fontSize: 12, color: C.sub },

  errorTxt:       { color: '#EF4444', fontSize: 14, marginBottom: 14, textAlign: 'center' },
  successTxt:     { color: C.primary, fontSize: 14, marginBottom: 14,
                    textAlign: 'center', fontWeight: '500' },

  btn:            { width: '100%', backgroundColor: C.primary, borderRadius: 14,
                    paddingVertical: 16, alignItems: 'center', marginBottom: 12 },
  btnDisabled:    { backgroundColor: C.border2 },
  btnTxt:         { color: '#fff', fontSize: 16, fontWeight: '700' },

  resendBtn:      { paddingVertical: 12, paddingHorizontal: 24 },
  resendDisabled: { opacity: 0.4 },
  resendTxt:      { color: C.primary, fontSize: 14, fontWeight: '500' },

  logoutBtn:      { marginTop: 28 },
  logoutTxt:      { color: C.sub, fontSize: 13, textDecorationLine: 'underline' },
});
