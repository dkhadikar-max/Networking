import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Linking, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, SHADOW } from '../utils/theme';
import { trackSupportClicked } from '../utils/analytics';

const SUPPORT_EMAIL = 'supportbuildyournetwork@gmail.com';
const APP_VERSION   = '1.0.0';

const FAQS = [
  {
    q: 'How does matching work?',
    a: 'When you swipe right on someone and they swipe right on you, you match. You\'ll both receive a notification and can start chatting instantly.',
  },
  {
    q: 'What is a Priority Message?',
    a: 'Priority Messages let you send a highlighted message to someone before matching. They stand out in the recipient\'s inbox and can spark a conversation sooner.',
  },
  {
    q: 'How do I get verified?',
    a: 'Tap your profile photo and follow the verification flow. We review submissions within 24 hours. Verified users get a badge and increased visibility.',
  },
  {
    q: 'How do I delete my account?',
    a: 'Go to Profile → Settings → Delete Account. Your data is permanently removed within 30 days, in line with our Privacy Policy.',
  },
  {
    q: 'Can I report abusive users?',
    a: 'Yes. Tap the three-dot menu (⋯) on any profile or message and select "Report". Our Trust & Safety team reviews all reports.',
  },
  {
    q: 'Why am I not seeing new profiles?',
    a: 'Try adjusting your filters or expanding your search radius. If the issue persists, pull to refresh or restart the app.',
  },
];

export default function SupportScreen() {
  function openEmail() {
    trackSupportClicked('support_screen');
    const subject = encodeURIComponent('BYN Support Request');
    const body    = encodeURIComponent(`\n\n---\nApp Version: ${APP_VERSION}\nPlatform: ${Platform.OS}`);
    const url     = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;

    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          return Linking.openURL(url);
        } else {
          Alert.alert(
            'Email not available',
            `Please email us directly at:\n\n${SUPPORT_EMAIL}`,
            [{ text: 'OK' }],
          );
        }
      })
      .catch(() => {
        Alert.alert(
          'Could not open email',
          `Please email us at:\n\n${SUPPORT_EMAIL}`,
          [{ text: 'OK' }],
        );
      });
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={s.screen}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}>

        {/* Hero */}
        <View style={s.hero}>
          <Text style={s.heroIcon}>💬</Text>
          <Text style={s.heroTitle}>We're here to help</Text>
          <Text style={s.heroSub}>Get answers fast or reach our team directly.</Text>
        </View>

        {/* Contact CTA */}
        <TouchableOpacity style={s.emailBtn} onPress={openEmail} activeOpacity={0.85}>
          <Text style={s.emailIcon}>✉</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.emailTitle}>Email Support</Text>
            <Text style={s.emailAddr}>{SUPPORT_EMAIL}</Text>
          </View>
          <Text style={s.emailArrow}>→</Text>
        </TouchableOpacity>
        <Text style={s.responseNote}>Typical response time: within 24 hours on business days</Text>

        {/* FAQs */}
        <Text style={s.sectionTitle}>Frequently Asked Questions</Text>
        {FAQS.map((faq, i) => (
          <View key={i} style={s.faqCard}>
            <Text style={s.faqQ}>{faq.q}</Text>
            <Text style={s.faqA}>{faq.a}</Text>
          </View>
        ))}

        {/* Version */}
        <Text style={s.version}>Build Your Network v{APP_VERSION}</Text>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen:       { flex: 1, backgroundColor: C.bg },
  scroll:       { padding: 20, paddingBottom: 48 },

  hero:         { alignItems: 'center', paddingVertical: 28, marginBottom: 8 },
  heroIcon:     { fontSize: 40, marginBottom: 12 },
  heroTitle:    { fontSize: 22, fontWeight: '700', color: C.text, marginBottom: 6 },
  heroSub:      { fontSize: 14, color: C.sub, textAlign: 'center', lineHeight: 20 },

  emailBtn:     {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: C.primary, borderRadius: 16, padding: 18,
    marginBottom: 10, ...SHADOW,
  },
  emailIcon:    { fontSize: 22, color: '#fff' },
  emailTitle:   { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 2 },
  emailAddr:    { fontSize: 12, color: 'rgba(255,255,255,0.75)' },
  emailArrow:   { fontSize: 20, color: 'rgba(255,255,255,0.7)' },
  responseNote: { fontSize: 12, color: C.dim, textAlign: 'center', marginBottom: 28 },

  sectionTitle: {
    fontSize: 11, color: C.sub, letterSpacing: 1, textTransform: 'uppercase',
    fontWeight: '600', marginBottom: 12,
  },
  faqCard:      {
    backgroundColor: C.card, borderRadius: 14, padding: 16,
    marginBottom: 10, borderWidth: 1, borderColor: C.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  faqQ:         { fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 6 },
  faqA:         { fontSize: 13, color: C.sub, lineHeight: 20 },

  version:      { fontSize: 12, color: C.dim, textAlign: 'center', marginTop: 24 },
});
