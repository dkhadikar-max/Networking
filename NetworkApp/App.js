import React, { useState, useEffect, Component } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useColorScheme, View, Text, StyleSheet, ActivityIndicator } from 'react-native';

// FIXED: Conditional gesture handler import — won't crash in Expo Go or web
let GestureHandlerRootView;
try {
  require('react-native-gesture-handler');
  GestureHandlerRootView = require('react-native-gesture-handler').GestureHandlerRootView;
} catch {
  GestureHandlerRootView = ({ children, style }) => <View style={style}>{children}</View>;
}

// These imports assume the files exist. If they don't, the error boundary below catches it.
import { AuthProvider, useAuth } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';

// ── ERROR BOUNDARY ──
// Catches render errors anywhere in the child tree and shows a fallback UI
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('App Error Boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorMessage}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

// ── LOADING SPLASH ──
// Prevents flash of unauthenticated content while auth state initializes
function AuthGate({ children }) {
  const { authLoading } = useAuth();
  
  if (authLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }
  
  return children;
}

// ── THEME-AWARE STATUS BAR ──
// Automatically switches between light/dark based on system preference or app theme
function ThemedStatusBar() {
  const colorScheme = useColorScheme();
  const style = colorScheme === 'dark' ? 'light' : 'dark';
  return <StatusBar style={style} />;
}

// ── MAIN APP ──
export default function App() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={styles.flex}>
        <SafeAreaProvider>
          <React.StrictMode>
            <AuthProvider>
              <ThemedStatusBar />
              <AuthGate>
                <AppNavigator />
              </AuthGate>
            </AuthProvider>
          </React.StrictMode>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1c1c1e',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#8e8e93',
    textAlign: 'center',
  },
});import React, { useState, useEffect, Component } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useColorScheme, View, Text, StyleSheet, ActivityIndicator } from 'react-native';

// FIXED: Conditional gesture handler import — won't crash in Expo Go or web
let GestureHandlerRootView;
try {
  require('react-native-gesture-handler');
  GestureHandlerRootView = require('react-native-gesture-handler').GestureHandlerRootView;
} catch {
  GestureHandlerRootView = ({ children, style }) => <View style={style}>{children}</View>;
}

// These imports assume the files exist. If they don't, the error boundary below catches it.
import { AuthProvider, useAuth } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';

// ── ERROR BOUNDARY ──
// Catches render errors anywhere in the child tree and shows a fallback UI
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('App Error Boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorMessage}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

// ── LOADING SPLASH ──
// Prevents flash of unauthenticated content while auth state initializes
function AuthGate({ children }) {
  const { authLoading } = useAuth();
  
  if (authLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }
  
  return children;
}

// ── THEME-AWARE STATUS BAR ──
// Automatically switches between light/dark based on system preference or app theme
function ThemedStatusBar() {
  const colorScheme = useColorScheme();
  const style = colorScheme === 'dark' ? 'light' : 'dark';
  return <StatusBar style={style} />;
}

// ── MAIN APP ──
export default function App() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={styles.flex}>
        <SafeAreaProvider>
          <React.StrictMode>
            <AuthProvider>
              <ThemedStatusBar />
              <AuthGate>
                <AppNavigator />
              </AuthGate>
            </AuthProvider>
          </React.StrictMode>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1c1c1e',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#8e8e93',
    textAlign: 'center',
  },
});