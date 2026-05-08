import React, { useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Linking, AppState,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { C } from '../utils/theme';

const UPGRADE_URL = 'https://buildyournetwork.online/upgrade';

const FEATURES = [
  { icon: '🔄', title: '200 swipes/day',           sub: 'Discover 6× more people' },
  { icon: '❤️', title: 'See who liked you',         sub: 'Full profiles, not just blurs' },
  { icon: '⚡', title: '20 priority messages/month', sub: 'Reach anyone before matching' },
  { icon: '🏅', title: 'Premium badge',              sub: 'Stand out in discovery' },
];

export default function UpgradeScreen({ navigation }) {
  const { token, user, refreshUser } = useAuth();
  const appState = useRef(AppState.currentState);

  // When user returns to app after paying in browser, refresh their profile
  useEffect(() => {
    const sub = AppState.addEventListener('change', async nextState => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        // App came back to foreground — check if they upgraded
        await refreshUser();
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, []);

  async function openUpgradePage() {
    try {
      // Get a short-lived payment token (15 min, payment scope only)
      // so the full auth JWT never appears in a URL / browser history
      const { data } = await require('../utils/api').default.post('/api/payments/session');
      const url = `${UPGRADE_URL}?s=${encodeURIComponent(data.payment_token)}`;
      Linking.openURL(url).catch(() => Linking.openURL(UPGRADE_URL));
    } catch {
      // Fallback: open without token (page will prompt to re-open from app)
      Linking.openURL(UPGRADE_URL);
    }
  }

  if (user?.premium) {
    return (
      <View style={s.center}>
        <Text style={s.bigIcon}>🏅</Text>
        <Text style={s.heading}>You're Premium!</Text>
        <Text style={s.sub}>All premium features are active on your account.</Text>
        {user.premium_expires_at && (
          <Text style={s.expiry}>
            Active until {new Date(user.premium_expires_at).toLocaleDateString('en-IN', {
              day: 'numeric', month: 'long', year: 'numeric',
            })}
          </Text>
        )}
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Text style={s.backTxt}>← Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

      {/* HERO */}
      <View style={s.hero}>
        <Text style={s.bigIcon}>✨</Text>
        <Text style={s.heading}>Go Premium</Text>
        <Text style={s.sub}>Unlock the full networking experience</Text>
      </View>

      {/* PRICING */}
      <View style={s.pricingRow}>
        <View style={s.planCard}>
          <Text style={s.planLabel}>Monthly</Text>
          <Text style={s.planPrice}>₹249</Text>
          <Text style={s.planSub}>/ month</Text>
          <Text style={s.planGst}>incl. GST</Text>
        </View>
        <View style={[s.planCard, s.planCardBest]}>
          <View style={s.bestBadge}><Text style={s.bestBadgeTxt}>BEST VALUE</Text></View>
          <Text style={s.planLabel}>Quarterly</Text>
          <Text style={[s.planPrice, { color: C.gold }]}>₹599</Text>
          <Text style={s.planSub}>/ 3 months</Text>
          <Text style={s.planGst}>incl. GST · save ₹148</Text>
        </View>
      </View>

      {/* FEATURES */}
      <View style={s.features}>
        {FEATURES.map((f, i) => (
          <View key={i} style={s.featureRow}>
            <Text style={s.featureIcon}>{f.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.fTitle}>{f.title}</Text>
              <Text style={s.fSub}>{f.sub}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* CTA */}
      <TouchableOpacity style={s.payBtn} onPress={openUpgradePage} activeOpacity={0.85}>
        <Text style={s.payTxt}>🔒  View Plans & Pay Securely</Text>
      </TouchableOpacity>

      <Text style={s.note}>
        Payment opens in your browser via Razorpay.{'\n'}
        Premium activates instantly after payment.
      </Text>

      <Text style={s.intl}>🌍 International users? USD pricing available on the payment page.</Text>

    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen:      { flex: 1, backgroundColor: C.bg },
  scroll:      { padding: 24, paddingBottom: 48 },

  /* hero */
  hero:        { alignItems: 'center', marginBottom: 28 },
  bigIcon:     { fontSize: 52, marginBottom: 12 },
  heading:     { fontSize: 26, fontWeight: '800', color: C.text, marginBottom: 6, textAlign: 'center' },
  sub:         { fontSize: 14, color: C.sub, textAlign: 'center', lineHeight: 20 },
  expiry:      { fontSize: 13, color: C.primary, fontWeight: '500', marginTop: 10 },

  /* pricing row */
  pricingRow:  { flexDirection: 'row', gap: 12, marginBottom: 24 },
  planCard:    {
    flex: 1, backgroundColor: C.card, borderRadius: 14,
    padding: 16, alignItems: 'center',
    borderWidth: 1, borderColor: C.border,
  },
  planCardBest: { borderColor: C.gold, borderWidth: 2, position: 'relative', overflow: 'hidden' },
  bestBadge:   { position: 'absolute', top: 0, right: 0, backgroundColor: C.gold, paddingHorizontal: 8, paddingVertical: 3, borderBottomLeftRadius: 8 },
  bestBadgeTxt:{ fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  planLabel:   { fontSize: 12, fontWeight: '600', color: C.sub, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  planPrice:   { fontSize: 30, fontWeight: '800', color: C.primary, lineHeight: 36 },
  planSub:     { fontSize: 12, color: C.sub, marginTop: 2 },
  planGst:     { fontSize: 10, color: C.dim, marginTop: 4, textAlign: 'center' },

  /* features */
  features:    { backgroundColor: C.card, borderRadius: 14, padding: 18, marginBottom: 24, borderWidth: 1, borderColor: C.border },
  featureRow:  { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 14 },
  featureIcon: { fontSize: 22, width: 30, textAlign: 'center' },
  fTitle:      { fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 2 },
  fSub:        { fontSize: 12, color: C.sub },

  /* cta */
  payBtn:      { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginBottom: 14 },
  payTxt:      { color: '#fff', fontSize: 16, fontWeight: '700' },
  note:        { fontSize: 12, color: C.sub, textAlign: 'center', lineHeight: 18, marginBottom: 10 },
  intl:        { fontSize: 12, color: C.dim, textAlign: 'center', lineHeight: 18 },

  /* already premium */
  center:      { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center', padding: 32 },
  backBtn:     { marginTop: 24, paddingVertical: 12, paddingHorizontal: 28, borderRadius: 10, borderWidth: 1, borderColor: C.border2 },
  backTxt:     { color: C.sub, fontSize: 14 },
});
