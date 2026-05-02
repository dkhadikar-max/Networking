import React from 'react';
import {
  View, Text, ScrollView, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C } from '../utils/theme';

const LAST_UPDATED = 'May 1, 2025';
const VERSION      = '1.0';

const SECTIONS = [
  {
    title: '1. Acceptance',
    body: 'By downloading or using Build Your Network ("App"), you agree to these Terms. If you disagree, do not use the App. These Terms apply to all users and constitute a binding agreement between you and Build Your Network.',
  },
  {
    title: '2. Eligibility',
    body: 'You must be at least 18 years old and legally able to enter into a binding agreement. You must not have been previously banned from our platform. By using the App, you represent that you meet these requirements.',
  },
  {
    title: '3. Your Account',
    body: 'You are responsible for safeguarding your login credentials and all activity under your account. Provide accurate, current information. Notify us immediately at support@buildyournetwork.online of any unauthorized use. One account per person — multiple accounts to evade restrictions will result in permanent suspension.',
  },
  {
    title: '4. User Conduct',
    body: 'You agree not to: post false or misleading information; harass, abuse, or threaten other users; solicit money or run MLM schemes; impersonate any person or entity; scrape data or use bots; post explicit, violent, or hateful content; violate any applicable law. Violations may result in immediate account suspension.',
  },
  {
    title: '5. Content & Intellectual Property',
    body: 'You retain ownership of content you post. By posting, you grant us a non-exclusive, worldwide, royalty-free licence to use it for operating and improving the Service. The App, logo, and features are owned exclusively by Build Your Network. You may not copy or redistribute our intellectual property without written permission.',
  },
  {
    title: '6. Premium Features & Payments',
    body: 'Premium features are billed through the Google Play Store or Apple App Store. Subscriptions auto-renew unless cancelled before the renewal date. Refunds are governed by the applicable store policy. Priority Message credits are consumed on delivery. Prices may change with reasonable notice.',
  },
  {
    title: '7. Abuse & Suspension',
    body: 'We may suspend or permanently ban any account that violates these Terms, engages in harassment, fraud, spam, or behaviour that harms our community. We may act without prior notice when necessary to protect users. Banned users may not create new accounts.',
  },
  {
    title: '8. Disclaimers',
    body: 'The App is provided "as is" without warranties of any kind. We do not guarantee uninterrupted service, accuracy of user profiles, or that connections made through the App will lead to specific professional outcomes. We are not a recruitment agency or employment service.',
  },
  {
    title: '9. Limitation of Liability',
    body: 'To the fullest extent permitted by law, Build Your Network shall not be liable for any indirect, incidental, or consequential damages. Our total liability for any claim shall not exceed the amount you paid us in the 12 months preceding the claim, or USD $100, whichever is greater.',
  },
  {
    title: '10. Termination',
    body: 'You may delete your account at any time from Settings. We may terminate your access for Terms violations. Upon termination, your right to use the Service ceases immediately. Sections on intellectual property, disclaimers, and liability survive termination.',
  },
  {
    title: '11. Changes to Terms',
    body: 'We may update these Terms at any time. Material changes will be notified via push notification or an in-app prompt. Continued use after the effective date constitutes acceptance. If you disagree with changes, you must stop using the App and delete your account.',
  },
  {
    title: '12. Governing Law',
    body: 'These Terms are governed by the laws of India. Disputes shall be submitted to binding arbitration after a 30-day informal resolution period. Class actions are waived — disputes must be resolved individually.',
  },
  {
    title: '13. Contact',
    body: 'Questions about these Terms? Email us at support@buildyournetwork.online. We aim to respond within 2 business days.',
  },
];

export default function TermsScreen() {
  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={s.screen}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={s.header}>
          <Text style={s.title}>Terms &amp; Conditions</Text>
          <View style={s.metaRow}>
            <View style={s.badge}><Text style={s.badgeTxt}>v{VERSION}</Text></View>
            <Text style={s.meta}>Last updated {LAST_UPDATED}</Text>
          </View>
          <Text style={s.intro}>
            Please read these terms carefully. They govern your use of the Build Your Network app and protect our community.
          </Text>
        </View>

        {/* Sections */}
        {SECTIONS.map((sec, i) => (
          <View key={i} style={s.card}>
            <Text style={s.secTitle}>{sec.title}</Text>
            <Text style={s.secBody}>{sec.body}</Text>
          </View>
        ))}

        <Text style={s.footer}>Build Your Network · All rights reserved © 2025</Text>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen:   { flex: 1, backgroundColor: C.bg },
  scroll:   { padding: 20, paddingBottom: 48 },

  header:   {
    backgroundColor: C.primary, borderRadius: 16, padding: 22,
    marginBottom: 16,
  },
  title:    { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 10 },
  metaRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  badge:    {
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  badgeTxt: { color: '#fff', fontSize: 11, fontWeight: '600' },
  meta:     { color: 'rgba(255,255,255,0.75)', fontSize: 12 },
  intro:    { color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 20 },

  card:     {
    backgroundColor: C.card, borderRadius: 14, padding: 16,
    marginBottom: 10, borderWidth: 1, borderColor: C.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  secTitle: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 8 },
  secBody:  { fontSize: 13, color: C.sub, lineHeight: 21 },

  footer:   { fontSize: 12, color: C.dim, textAlign: 'center', marginTop: 20 },
});
