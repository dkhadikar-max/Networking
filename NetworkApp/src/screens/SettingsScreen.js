import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { C, SHADOW } from '../utils/theme';
import { trackSupportClicked } from '../utils/analytics';

function Row({ icon, label, sub, onPress, danger = false, chevron = true }) {
  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.7}>
      <View style={[s.rowIcon, danger && s.rowIconDanger]}>
        <Text style={s.rowIconTxt}>{icon}</Text>
      </View>
      <View style={s.rowBody}>
        <Text style={[s.rowLabel, danger && s.rowLabelDanger]}>{label}</Text>
        {!!sub && <Text style={s.rowSub}>{sub}</Text>}
      </View>
      {chevron && <Text style={s.chevron}>›</Text>}
    </TouchableOpacity>
  );
}

function Section({ title, children }) {
  return (
    <View style={s.section}>
      {!!title && <Text style={s.sectionTitle}>{title}</Text>}
      <View style={s.sectionCard}>{children}</View>
    </View>
  );
}

export default function SettingsScreen({ navigation }) {
  const { logout } = useAuth();

  function confirmLogout() {
    Alert.alert(
      'Sign out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: logout },
      ],
    );
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={s.screen}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        <Section title="Help">
          <Row
            icon="💬"
            label="Support"
            sub="Contact our team"
            onPress={() => {
              trackSupportClicked('settings');
              navigation.navigate('Support');
            }}
          />
        </Section>

        <Section title="Legal">
          <Row
            icon="📄"
            label="Terms & Conditions"
            sub="Rules, conduct, and your rights"
            onPress={() => navigation.navigate('Terms')}
          />
          <View style={s.divider} />
          <Row
            icon="🔒"
            label="Privacy Policy"
            sub="How we collect and use your data"
            onPress={() => navigation.navigate('Privacy')}
          />
        </Section>

        <Section title="Account">
          <Row
            icon="🚪"
            label="Sign Out"
            danger
            chevron={false}
            onPress={confirmLogout}
          />
        </Section>

        <Text style={s.versionTxt}>Build Your Network v1.0.0</Text>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen:          { flex: 1, backgroundColor: C.bg },
  scroll:          { padding: 20, paddingBottom: 48 },

  section:         { marginBottom: 24 },
  sectionTitle:    {
    fontSize: 11, color: C.sub, letterSpacing: 1, textTransform: 'uppercase',
    fontWeight: '600', marginBottom: 8, paddingLeft: 4,
  },
  sectionCard:     {
    backgroundColor: C.card, borderRadius: 14,
    borderWidth: 1, borderColor: C.border,
    overflow: 'hidden', ...SHADOW,
  },

  row:             {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  rowIcon:         {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: C.primaryLight,
    justifyContent: 'center', alignItems: 'center',
    marginRight: 14,
  },
  rowIconDanger:   { backgroundColor: 'rgba(239,68,68,0.1)' },
  rowIconTxt:      { fontSize: 18 },
  rowBody:         { flex: 1 },
  rowLabel:        { fontSize: 15, color: C.text, fontWeight: '500' },
  rowLabelDanger:  { color: C.danger },
  rowSub:          { fontSize: 12, color: C.dim, marginTop: 1 },
  chevron:         { fontSize: 22, color: C.dim },

  divider:         { height: 1, backgroundColor: C.border, marginHorizontal: 16 },

  versionTxt:      { textAlign: 'center', fontSize: 12, color: C.dim, marginTop: 8 },
});
