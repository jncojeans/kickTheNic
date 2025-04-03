import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { Platform } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import ErrorBoundary from '@/components/ErrorBoundary';

// Only prevent auto hide on native platforms
if (Platform.OS !== 'web') {
  SplashScreen.preventAutoHideAsync();
}

// Global error handler to prevent app crashes
if (Platform.OS !== 'web') {
  // Override global error handler
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    console.error('Global error caught:', error);
    // Don't terminate the app on non-fatal errors
    if (isFatal) {
      console.error('Fatal error detected');
    }
  });
}

export default function RootLayout() {
  useFrameworkReady();

  return (
    <ErrorBoundary>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade',
        }}
      >
        <Stack.Screen
          name="auth"
          options={{
            // Prevent going back to other screens
            headerBackVisible: false,
          }}
        />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </ErrorBoundary>
  );
}
