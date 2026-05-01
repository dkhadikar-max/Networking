import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator }    from '@react-navigation/stack';
import { Text } from 'react-native';

import { useAuth }        from '../context/AuthContext';
import LoginScreen        from '../screens/LoginScreen';
import SignupScreen       from '../screens/SignupScreen';
import DiscoverScreen     from '../screens/DiscoverScreen';
import ChatListScreen     from '../screens/ChatListScreen';
import ChatScreen         from '../screens/ChatScreen';
import ProfileScreen      from '../screens/ProfileScreen';
import UpgradeScreen      from '../screens/UpgradeScreen';
import { C }             from '../utils/theme';

const Tab   = createBottomTabNavigator();
const Stack = createStackNavigator();
const Auth  = createStackNavigator();

const navTheme = {
  dark: true,
  colors: {
    primary:       C.gold,
    background:    C.bg,
    card:          C.sur,
    text:          C.text,
    border:        C.border,
    notification:  C.gold,
  },
};

function tabIcon(name, focused) {
  const icons = { Discover:'⬡', Chat:'◎', Profile:'◈' };
  return <Text style={{ fontSize:20, color: focused ? C.gold : C.dim }}>{icons[name]||'•'}</Text>;
}

function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle:{backgroundColor:C.sur}, headerTintColor:C.text, headerTitleStyle:{fontWeight:'700'} }}>
      <Stack.Screen name="ProfileMain" component={ProfileScreen} options={{title:'My Profile'}} />
      <Stack.Screen name="Upgrade"     component={UpgradeScreen} options={{title:'Go Premium'}} />
    </Stack.Navigator>
  );
}

function ChatStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle:{backgroundColor:C.sur}, headerTintColor:C.text, headerTitleStyle:{fontWeight:'700'} }}>
      <Stack.Screen name="ChatList" component={ChatListScreen} options={{headerShown:false}} />
      <Stack.Screen name="Chat"     component={ChatScreen}     options={{title:'Chat'}} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => tabIcon(route.name, focused),
        tabBarStyle: { backgroundColor:C.sur, borderTopColor:C.border, height:60, paddingBottom:8 },
        tabBarActiveTintColor:   C.gold,
        tabBarInactiveTintColor: C.dim,
        tabBarLabelStyle: { fontSize:10, fontWeight:'600', letterSpacing:0.5 },
      })}>
      <Tab.Screen name="Discover" component={DiscoverScreen} />
      <Tab.Screen name="Chat"     component={ChatStack} />
      <Tab.Screen name="Profile"  component={ProfileStack} />
    </Tab.Navigator>
  );
}

function AuthStack() {
  return (
    <Auth.Navigator screenOptions={{ headerShown:false }}>
      <Auth.Screen name="Login"  component={LoginScreen} />
      <Auth.Screen name="Signup" component={SignupScreen} />
    </Auth.Navigator>
  );
}

export default function AppNavigator() {
  const { token, ready } = useAuth();

  if (!ready) {
    return (
      <View style={{flex:1, backgroundColor:C.bg, justifyContent:'center', alignItems:'center'}}>
        <ActivityIndicator color={C.gold} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      {token ? <MainTabs /> : <AuthStack />}
    </NavigationContainer>
  );
}
