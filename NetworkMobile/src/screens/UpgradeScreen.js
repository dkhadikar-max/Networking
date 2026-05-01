import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { C } from '../utils/theme';

const FEATURES = [
  { title:'200 profile views/day', sub:'vs 30 on free plan' },
  { title:'See who liked you',     sub:'Full list of people who swiped right' },
  { title:'20 Priority Connect messages', sub:'Reach anyone without matching first' },
  { title:'Boosted visibility',    sub:'Appear higher in discovery' },
];

export default function UpgradeScreen({ navigation }) {
  const { user, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);

  async function handleUpgrade() {
    // In production: integrate with Razorpay React Native SDK
    // For now: show instructions
    Alert.alert(
      'Razorpay Payment',
      'To complete payment, the Razorpay React Native SDK must be installed.\n\nRun:\nnpm install react-native-razorpay\n\nThen call createOrder → Razorpay.open() → verifyPayment.',
      [{ text: 'OK' }]
    );
  }

  if (user?.premium) {
    return (
      <View style={s.center}>
        <Text style={s.goldIcon}>⬡</Text>
        <Text style={s.heading}>You are Premium</Text>
        <Text style={s.sub}>Enjoy all the benefits of your membership.</Text>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Text style={s.backTxt}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.scroll}>
      <View style={s.hero}>
        <Text style={s.goldIcon}>⬡</Text>
        <Text style={s.heading}>Go Premium</Text>
        <Text style={s.sub}>Unlock the full networking experience</Text>
      </View>
      <View style={s.card}>
        <View style={s.cardTop}>
          <View>
            <Text style={s.planName}>Premium</Text>
            <Text style={s.planDesc}>Everything you need</Text>
          </View>
          <View style={s.priceWrap}>
            <Text style={s.price}>₹399</Text>
            <Text style={s.priceSub}>/month</Text>
          </View>
        </View>
        {FEATURES.map((f, i) => (
          <View key={i} style={s.feature}>
            <Text style={s.tick}>✓</Text>
            <View style={{flex:1}}>
              <Text style={s.fTitle}>{f.title}</Text>
              <Text style={s.fSub}>{f.sub}</Text>
            </View>
          </View>
        ))}
        <TouchableOpacity style={s.payBtn} onPress={handleUpgrade} disabled={loading}>
          {loading
            ? <ActivityIndicator color={C.bg} />
            : <Text style={s.payTxt}>Pay with Razorpay — ₹399/month</Text>
          }
        </TouchableOpacity>
        <Text style={s.note}>Cancel anytime · Secure payment · Instant activation</Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen:   { flex:1, backgroundColor:C.bg },
  scroll:   { padding:24, paddingBottom:40 },
  center:   { flex:1, backgroundColor:C.bg, justifyContent:'center', alignItems:'center', padding:24 },
  hero:     { alignItems:'center', marginBottom:28 },
  goldIcon: { fontSize:48, color:C.gold, marginBottom:10 },
  heading:  { fontSize:26, fontWeight:'700', color:C.text, marginBottom:6, textAlign:'center' },
  sub:      { fontSize:14, color:C.sub, textAlign:'center' },
  card:     { backgroundColor:C.sur, borderWidth:1, borderColor:C.gold, borderRadius:16, padding:20 },
  cardTop:  { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:20 },
  planName: { fontSize:18, fontWeight:'700', color:C.text },
  planDesc: { fontSize:13, color:C.sub, marginTop:2 },
  priceWrap:{ alignItems:'flex-end' },
  price:    { fontSize:32, fontWeight:'700', color:C.gold },
  priceSub: { fontSize:13, color:C.sub },
  feature:  { flexDirection:'row', gap:12, alignItems:'flex-start', marginBottom:14 },
  tick:     { color:C.gold, fontSize:16, marginTop:1 },
  fTitle:   { fontSize:14, fontWeight:'600', color:C.text },
  fSub:     { fontSize:12, color:C.sub, marginTop:2 },
  payBtn:   { backgroundColor:C.gold, borderRadius:10, padding:15, alignItems:'center', marginTop:20, marginBottom:10 },
  payTxt:   { color:C.bg, fontWeight:'700', fontSize:15 },
  note:     { fontSize:11, color:C.sub, textAlign:'center' },
  backBtn:  { marginTop:20, padding:12, borderWidth:1, borderColor:C.border2, borderRadius:10, paddingHorizontal:24 },
  backTxt:  { color:C.sub },
});
