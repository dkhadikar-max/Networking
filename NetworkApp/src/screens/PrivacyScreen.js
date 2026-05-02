import React from 'react';
import {
  View, Text, ScrollView, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C } from '../utils/theme';

const LAST_UPDATED = 'May 1, 2025';

const DATA_TABLE = [
  { type: 'Name & email',         why: 'Account creation & login',             kept: 'Until deletion' },
  { type: 'Professional info',    why: 'Profile & matching',                   kept: 'Until deletion' },
  { type: 'Photos',               why: 'Profile display',                      kept: 'Until deletion' },
  { type: 'Location (approx.)',   why: 'Proximity-based discovery',            kept: 'Session only' },
  { type: 'Messages',             why: 'Chat between matched users',           kept: 'Until deletion' },
  { type: 'Usage data',           why: 'App improvement & analytics',          kept: '12 months' },
  { type: 'Device identifiers',   why: 'Push notifications & crash reporting', kept: '12 months' },
];

const SECTIONS = [
  {
    title: 'Who we are',
    body: 'Build Your Network ("we", "us") operates the BYN mobile application. We are committed to protecting your personal information and being transparent about how we use it. For questions, contact us at supportbuildyournetwork@gmail.com.',
  },
  {
    title: 'What we collect',
    body: 'We collect information you give us directly (name, email, professional details, photos) and information generated as you use the app (usage patterns, device data, approximate location when enabled).',
    table: true,
  },
  {
    title: 'How we use your data',
    body: 'We use your data to: operate and improve the app; match you with relevant professionals; send notifications about matches and messages; ensure platform safety; comply with legal obligations. We do not use your data for advertising purposes.',
  },
  {
    title: 'We do not sell your data',
    body: 'We never sell, rent, or trade your personal information to third parties. Full stop. Your professional identity and network data belong to you.',
  },
  {
    title: 'Who we share with',
    body: 'We share limited data with: service providers who help us operate the App (hosting, analytics, push notifications) — bound by strict confidentiality obligations; law enforcement when legally required; other users — only what you choose to display on your public profile.',
  },
  {
    title: 'Your rights',
    body: 'Depending on your jurisdiction, you may have the right to: access your personal data; correct inaccurate data; request deletion of your data; withdraw consent at any time; lodge a complaint with a supervisory authority. To exercise any of these rights, email us at supportbuildyournetwork@gmail.com.',
  },
  {
    title: 'Data security',
    body: 'All data is encrypted in transit (TLS) and at rest. We use industry-standard security practices and regularly review our systems. However, no method of transmission over the internet is 100% secure — we cannot guarantee absolute security.',
  },
  {
    title: 'Data retention',
    body: 'We retain your data for as long as your account is active. When you delete your account, your personal data is removed within 30 days, except where retention is required by law (e.g., financial records for tax purposes).',
  },
  {
    title: 'Children',
    body: 'Build Your Network is intended for users 18 years and older. We do not knowingly collect data from minors. If you believe a minor has created an account, please contact us immediately and we will delete it.',
  },
  {
    title: 'Changes to this policy',
    body: 'We may update this Privacy Policy from time to time. Material changes will be communicated via push notification or in-app prompt. The "Last updated" date at the top of this page reflects the most recent revision.',
  },
  {
    title: 'Contact us',
    body: 'Privacy questions or requests: supportbuildyournetwork@gmail.com\n\nWe aim to respond to all privacy requests within 5 business days.',
  },
];

export default function PrivacyScreen() {
  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={s.screen}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={s.header}>
          <Text style={s.title}>Privacy Policy</Text>
          <View style={s.metaRow}>
            <View style={s.badge}><Text style={s.badgeTxt}>No data selling</Text></View>
            <Text style={s.meta}>Last updated {LAST_UPDATED}</Text>
          </View>
          <Text style={s.intro}>
            We respect your privacy. Here's exactly what we collect, why, and how we protect it.
          </Text>
        </View>

        {/* Sections */}
        {SECTIONS.map((sec, i) => (
          <View key={i} style={s.card}>
            <Text style={s.secTitle}>{sec.title}</Text>
            <Text style={s.secBody}>{sec.body}</Text>
            {sec.table && (
              <View style={s.table}>
                <View style={[s.tableRow, s.tableHead]}>
                  <Text style={[s.tableCell, s.headTxt, { flex: 1.3 }]}>Data type</Text>
                  <Text style={[s.tableCell, s.headTxt, { flex: 1.6 }]}>Why collected</Text>
                  <Text style={[s.tableCell, s.headTxt, { flex: 0.9 }]}>Kept for</Text>
                </View>
                {DATA_TABLE.map((row, j) => (
                  <View key={j} style={[s.tableRow, j % 2 === 1 && s.tableAlt]}>
                    <Text style={[s.tableCell, s.cellTxt, { flex: 1.3 }]}>{row.type}</Text>
                    <Text style={[s.tableCell, s.cellTxt, { flex: 1.6 }]}>{row.why}</Text>
                    <Text style={[s.tableCell, s.cellTxt, { flex: 0.9 }]}>{row.kept}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}

        <Text style={s.footer}>Build Your Network · Privacy Policy © 2025</Text>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen:    { flex: 1, backgroundColor: C.bg },
  scroll:    { padding: 20, paddingBottom: 48 },

  header:    {
    backgroundColor: C.primarySoft, borderRadius: 16, padding: 22,
    marginBottom: 16,
  },
  title:     { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 10 },
  metaRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  badge:     {
    backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  badgeTxt:  { color: '#fff', fontSize: 11, fontWeight: '600' },
  meta:      { color: 'rgba(255,255,255,0.75)', fontSize: 12 },
  intro:     { color: 'rgba(255,255,255,0.9)', fontSize: 13, lineHeight: 20 },

  card:      {
    backgroundColor: C.card, borderRadius: 14, padding: 16,
    marginBottom: 10, borderWidth: 1, borderColor: C.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  secTitle:  { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 8 },
  secBody:   { fontSize: 13, color: C.sub, lineHeight: 21 },

  table:     { marginTop: 14, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  tableRow:  { flexDirection: 'row' },
  tableHead: { backgroundColor: C.primaryLight },
  tableAlt:  { backgroundColor: C.bg },
  tableCell: { padding: 8 },
  headTxt:   { fontSize: 11, fontWeight: '700', color: C.primary, letterSpacing: 0.4 },
  cellTxt:   { fontSize: 11, color: C.sub, lineHeight: 16 },

  footer:    { fontSize: 12, color: C.dim, textAlign: 'center', marginTop: 20 },
});
