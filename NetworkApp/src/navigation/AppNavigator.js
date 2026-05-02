import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator }    from '@react-navigation/stack';

import { useAuth }           from '../context/AuthContext';
import LoginScreen           from '../screens/LoginScreen';
import SignupScreen          from '../screens/SignupScreen';
import ProfileCompleteScreen from '../screens/ProfileCompleteScreen';
import DiscoverScreen        from '../screens/DiscoverScreen';
import LikesScreen           from '../screens/LikesScreen';
import ChatListScreen        from '../screens/ChatListScreen';
import ChatScreen            from '../screens/ChatScreen';
import ProfileScreen         from '../screens/ProfileScreen';
import UserProfileScreen     from '../screens/UserProfileScreen';
import UpgradeScreen         from '../screens/UpgradeScreen';
import { C }                 from '../utils/theme';

const Tab   = createBottomTabNavigator();
const Stack = createStackNavigator();
const Auth  = createStackNavigator();

const navTheme = {
  dark: true,
  colors: {
    primary:      C.gold,
    background:   C.bg,
    card:         C.sur,
    text:         C.text,
    border:       C.border,
    notification: C.gold,
  },
};

// ── Custom renderers (bypass React Navigation font-weight resolution) ─────────

function TabIcon({ name, focused }) {
  const icons = { Discover: '⬡', Likes: '♡', Connections: '◎', Profile: '◈' };
  return (
    <Text style={{ fontSize: 20, color: focused ? C.gold : C.dim }}>
      {icons[name] || '•'}
    </Text>
  );
}

function TabLabel({ name, focused }) {
  return (
    <Text style={{ fontSize: 10, letterSpacing: 0.5, color: focused ? C.gold : C.dim, marginBottom: 2 }}>
      {name}
    </Text>
  );
}

function HeaderTitle({ children }) {
  return (
    <Text style={{ color: C.text, fontSize: 17, fontFamily: 'System' }} numberOfLines={1}>
      {children}
    </Text>
  );
}

// Shared stack screenOptions — custom headerTitle prevents HeaderTitle.js crash
const stackScreenOptions = {
  headerStyle:      { backgroundColor: C.sur },
  headerTintColor:  C.text,
  headerTitle:      (props) => <HeaderTitle {...props} />,
};

// ── Stacks ────────────────────────────────────────────────────────────────────

function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="ProfileMain" component={ProfileScreen} options={{ title: 'My Profile' }} />
      <Stack.Screen name="Upgrade"     component={UpgradeScreen} options={{ title: 'Go Premium' }} />
    </Stack.Navigator>
  );
}

function LikesStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="LikesList"   component={LikesScreen}       options={{ headerShown: false }} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen}  options={{ title: 'Profile' }} />
      <Stack.Screen name="Upgrade"     component={UpgradeScreen}      options={{ title: 'Go Premium' }} />
    </Stack.Navigator>
  );
}

function ChatStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="ChatList"    component={ChatListScreen}    options={{ headerShown: false }} />
      <Stack.Screen name="ChatDetail"  component={ChatScreen}        options={{ title: 'Chat' }} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} options={{ title: 'Profile' }} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown:    false,
        tabBarIcon:     ({ focused }) => <TabIcon name={route.name} focused={focused} />,
        tabBarLabel:    ({ focused }) => <TabLabel name={route.name} focused={focused} />,
        tabBarStyle:    { backgroundColor: C.sur, borderTopColor: C.border, height: 60, paddingBottom: 8 },
      })}>
      <Tab.Screen name="Discover"    component={DiscoverScreen} />
      <Tab.Screen name="Likes"       component={LikesStack} />
      <Tab.Screen name="Connections" component={ChatStack} />
      <Tab.Screen name="Profile"     component={ProfileStack} />
    </Tab.Navigator>
  );
}

function AuthStack() {
  return (
    <Auth.Navigator screenOptions={{ headerShown: false }}>
      <Auth.Screen name="Login"  component={LoginScreen} />
      <Auth.Screen name="Signup" component={SignupScreen} />
    </Auth.Navigator>
  );
}

function ProfileSetupStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProfileComplete" component={ProfileCompleteScreen} />
      <Stack.Screen name="ProfileForSetup" component={ProfileScreen}
        options={{
          headerShown:    true,
          ...stackScreenOptions,
          title: 'Add Photos',
        }}
      />
    </Stack.Navigator>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function AppNavigator() {
  const { token, user, ready } = useAuth();

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={C.gold} size="large" />
      </View>
    );
  }

  if (!token) {
    return (
      <NavigationContainer theme={navTheme}>
        <AuthStack />
      </NavigationContainer>
    );
  }

  const profileComplete =
    user?.is_profile_complete === true ||
    (user?.profile_score != null && user.profile_score >= 70);

  if (!profileComplete) {
    return (
      <NavigationContainer theme={navTheme}>
        <ProfileSetupStack />
      </NavigationContainer>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      <MainTabs />
    </NavigationContainer>
  );
}
