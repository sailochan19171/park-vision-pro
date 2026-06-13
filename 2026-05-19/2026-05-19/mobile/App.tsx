import React, { useEffect } from 'react';
import { StatusBar, LogBox } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import VayNavigator from './src/navigation/VayNavigator';
import useDriverAuth from './src/store/driverAuth';
import useLive from './src/store/liveStore';
import SplashScreen from './src/screens/parking/SplashScreen';
import { BRAND } from './src/config';

LogBox.ignoreLogs([
  'Non-serializable values were found in the navigation state',
  'Possible Unhandled Promise Rejection',
]);

function AppContent() {
  const hydrate = useDriverAuth((s) => s.hydrate);
  const loading = useDriverAuth((s) => s.loading);
  const user = useDriverAuth((s) => s.user);
  const startLive = useLive((s) => s.start);
  const stopLive  = useLive((s) => s.stop);

  useEffect(() => { hydrate(); }, [hydrate]);

  // Start/stop the live poller in lockstep with login state.
  useEffect(() => {
    if (user) startLive();
    else stopLive();
    return () => stopLive();
  }, [user, startLive, stopLive]);

  if (loading) return <SplashScreen />;
  return (
    <NavigationContainer>
      <VayNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={BRAND.primaryDark} translucent={false} />
      <AppContent />
    </SafeAreaProvider>
  );
}
