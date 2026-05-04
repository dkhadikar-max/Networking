import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator }    from '@react-navigation/stack';

import { useAuth }           from '../context/AuthContext';
import BYNLogo               from '../components/BYNLogo';
import LoginScreen           from '../screens/LoginScreen';
import SignupScreen          from '../screens/SignupScreen';
import ProfileCompleteScreen from '../screens/ProfileCompleteScreen';
import DiscoverScreen        from '../screens/DiscoverScreen';
import LikesScreen           from '../screens/LikesScreen';
import ChatListScreen        from '../screens/ChatListScreen';
import ChatScreen            from '../screens/ChatScreen';
import PriorityScreen        from '../screens/PriorityScreen';
import ProfileScreen         from '../screens/ProfileScreen';
import UserProfileScreen     from '../screens/UserProfileScreen';
import UpgradeScreen         from '../screens/UpgradeScreen';
import SettingsScreen        from '../screens/SettingsScreen';
import SupportScreen         from '../screens/SupportScreen';
import TermsScreen           from '../screens/TermsScreen';
import PrivacyScreen         from '../screens/PrivacyScreen';
import { C }                 from '../utils/theme';

const Tab   = createBottomTabNavigator();
const Stack = createStackNavigator();
const Auth  = createStackNavigator();

const navTheme = {
  ...DefaultTheme,                      // preserves fonts.regular/medium/bold/heavy
  dark: false,
  colors: {
    ...DefaultTheme.colors,
    primary:      C.primary,
    background:   C.bg,
    card:         C.card,
    text:         C.text,
    border:       C.border,
    notification: C.primary,
  },
};

function TabIcon({ name, focused }) {
  const icons = { Discover: '⬡', Likes: '♡', Chat: '◎', Profile: '◈' };
  return (
    <Text style={{ fontSize: 20, color: focused ? C.primary : C.dim }}>
      {icons[name] || '•'}
    </Text>
  );
}

function TabLabel({ name, focused }) {
  return (
    <Text style={{
      fontSize: 10, letterSpacing: 0.4,
      color: focused ? C.primary : C.dim,
      marginBottom: 2, fontWeight: focused ? '600' : '400',
    }}>
      {name}
    </Text>
  );
}

function LogoHeader() {
  return <BYNLogo size={28} />;
}

const stackScreenOptions = {
  headerStyle:        { backgroundColor: C.card, elevation: 0, shadowOpacity: 0.06 },
  headerTintColor:    C.primary,
  headerTitleStyle:   { color: C.text, fontSize: 17, fontWeight: '600' },
  animationEnabled:   true,
};

function DiscoverStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="DiscoverMain" component={DiscoverScreen}    options={{ headerShown: false }} />
      <Stack.Screen name="UserProfile"  component={UserProfileScreen} options={{ title: 'Profile' }} />
      <Stack.Screen name="ChatScreen"   component={ChatScreen}        options={{ title: 'Chat' }} />
    </Stack.Navigator>
  );
}

function LikesStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="LikesList"   component={LikesScreen}       options={{ headerShown: false }} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} options={{ title: 'Profile' }} />
      <Stack.Screen name="Upgrade"     component={UpgradeScreen}     options={{ title: 'Go Premium' }} />
    </Stack.Navigator>
  );
}

function ChatStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen
        name="ChatList"
        component={ChatListScreen}
        options={{
          headerShown: true,
          headerLeft:  () => <View style={{ paddingLeft: 16 }}><LogoHeader /></View>,
          headerTitle: () => null,
        }}
      />
      <Stack.Screen name="ChatDetail"       component={ChatScreen}        options={{ title: 'Chat' }} />
      <Stack.Screen name="UserProfile"      component={UserProfileScreen} options={{ title: 'Profile' }} />
      <Stack.Screen name="PriorityMessages" component={PriorityScreen}   options={{ title: 'Priority' }} />
    </Stack.Navigator>
  );
}

function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="ProfileMain" component={ProfileScreen}  options={{ title: 'My Profile' }} />
      <Stack.Screen name="Upgrade"     component={UpgradeScreen}  options={{ title: 'Go Premium' }} />
      <Stack.Screen name="Settings"    component={SettingsScreen} options={{ title: 'Settings' }} />
      <Stack.Screen name="Support"     component={SupportScreen}  options={{ title: 'Support' }} />
      <Stack.Screen name="Terms"       component={TermsScreen}    options={{ title: 'Terms & Conditions' }} />
      <Stack.Screen name="Privacy"     component={PrivacyScreen}  options={{ title: 'Privacy Policy' }} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon:  ({ focused }) => <TabIcon  name={route.name} focused={focused} />,
        tabBarLabel: ({ focused }) => <TabLabel name={route.name} focused={focused} />,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth:  1,
          borderTopColor:  'rgba(0,0,0,0.06)',
          height:          60,
          paddingBottom:   8,
          shadowColor:     '#000',
          shadowOpacity:   0.06,
          shadowRadius:    8,
          shadowOffset:    { width: 0, height: -2 },
          elevation:       8,
        },
      })}>
      <Tab.Screen name="Discover" component={DiscoverStack} />
      <Tab.Screen name="Likes"    component={LikesStack} />
      <Tab.Screen name="Chat"     component={ChatStack} />
      <Tab.Screen name="Profile"  component={ProfileStack} />
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
        options={{ headerShown: true, ...stackScreenOptions, title: 'Add Photos' }}
      />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  const { token, user, ready } = useAuth();

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={C.primary} size="large" />
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
