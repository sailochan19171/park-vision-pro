import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';

import useDriverAuth from '../store/driverAuth';
import useLive from '../store/liveStore';
import { BRAND } from '../config';

import LoginScreen from '../screens/parking/LoginScreen';
import RegisterScreen from '../screens/parking/RegisterScreen';
import HomeScreen from '../screens/parking/HomeScreen';
import ZonesScreen from '../screens/parking/ZonesScreen';
import FacilityDetailScreen from '../screens/parking/FacilityDetailScreen';
import ReserveScreen from '../screens/parking/ReserveScreen';
import PaymentScreen from '../screens/parking/PaymentScreen';
import ActiveSessionScreen from '../screens/parking/ActiveSessionScreen';
import QRPassScreen from '../screens/parking/QRPassScreen';
import HistoryScreen from '../screens/parking/HistoryScreen';
import NotificationsScreen from '../screens/parking/NotificationsScreen';
import ProfileScreen from '../screens/parking/ProfileScreen';
import ReservationDetailScreen from '../screens/parking/ReservationDetailScreen';

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  MainTabs: undefined;
  FacilityDetail: { facilityId: number };
  Reserve: { facilityId: number };
  Payment: { reservationDraft: any };
  QRPass: undefined;
  ReservationDetail: { reservation: any };
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

function TabIcon({ label, color }: { label: string; color: string }) {
  return <Text style={{ color, fontSize: 18 }}>{label}</Text>;
}

function MainTabs() {
  const unread = useLive((s) => s.snapshot?.unread || 0);
  const active = useLive((s) => !!s.snapshot?.active);
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: BRAND.primary,
        tabBarInactiveTintColor: BRAND.muted,
        headerStyle: { backgroundColor: BRAND.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'Find Parking',
          tabBarIcon: ({ color }) => <TabIcon label="P" color={color} />,
        }}
      />
      <Tab.Screen
        name="Zones"
        component={ZonesScreen}
        options={{
          title: 'Zone Live',
          tabBarIcon: ({ color }) => <TabIcon label="◫" color={color} />,
        }}
      />
      <Tab.Screen
        name="Active"
        component={ActiveSessionScreen}
        options={{
          title: 'My Session',
          tabBarIcon: ({ color }) => <TabIcon label="●" color={color} />,
          tabBarBadge: active ? 'LIVE' : undefined,
          tabBarBadgeStyle: { backgroundColor: BRAND.success, color: '#fff', fontSize: 10 },
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          title: 'History',
          tabBarIcon: ({ color }) => <TabIcon label="⏱" color={color} />,
        }}
      />
      <Tab.Screen
        name="Alerts"
        component={NotificationsScreen}
        options={{
          title: 'Alerts',
          tabBarIcon: ({ color }) => <TabIcon label="!" color={color} />,
          tabBarBadge: unread > 0 ? unread : undefined,
          tabBarBadgeStyle: { backgroundColor: BRAND.danger, color: '#fff' },
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <TabIcon label="@" color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

export default function VayNavigator() {
  const user = useDriverAuth((s) => s.user);

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: BRAND.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      {!user ? (
        <>
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Create Account' }} />
        </>
      ) : (
        <>
          <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
          <Stack.Screen name="FacilityDetail" component={FacilityDetailScreen} options={{ title: 'Facility' }} />
          <Stack.Screen name="Reserve" component={ReserveScreen} options={{ title: 'Reserve a Slot' }} />
          <Stack.Screen name="Payment" component={PaymentScreen} options={{ title: 'Payment' }} />
          <Stack.Screen name="QRPass" component={QRPassScreen} options={{ title: 'Entry QR Pass' }} />
          <Stack.Screen name="ReservationDetail" component={ReservationDetailScreen} options={{ title: 'Reservation' }} />
        </>
      )}
    </Stack.Navigator>
  );
}
