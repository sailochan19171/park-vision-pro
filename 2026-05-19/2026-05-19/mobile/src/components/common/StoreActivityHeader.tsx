import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TouchableWithoutFeedback, Modal,
  Platform, ScrollView, Image, Animated, Dimensions, BackHandler, Alert, StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Ionicons';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import useAuthStore from '../../store/auth';

const DRAWER_WIDTH = Dimensions.get('window').width * 0.78;

interface Props {
  title?: string;
  customerCode?: string;
  customerName?: string;
  visitCode?: string;
  priceList?: string;
  rightElement?: React.ReactNode;
  /**
   * When true, pressing back asks for confirmation before leaving (use when the
   * user has started entering data on the screen). When false/undefined, the
   * default back behavior runs immediately with no prompt.
   */
  hasUnsavedChanges?: boolean;
}

export default function StoreActivityHeader({ title, customerCode, customerName, visitCode, priceList, rightElement, hasUnsavedChanges }: Props) {
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [othersExpanded, setOthersExpanded] = useState(false);
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;

  // Back gesture/button — only confirm when the screen reports unsaved changes.
  // Otherwise let the default back behavior run, so plain navigation never
  // shows an "exit" popup.
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const onBackPress = () => {
      Alert.alert(
        'Alert !',
        'Do you want to exit this current page? Your unsaved changes will be lost.',
        [
          { text: 'No', style: 'cancel' },
          { text: 'Yes', onPress: () => navigation.goBack() },
        ],
      );
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [hasUnsavedChanges, navigation]);

  const openDrawer = () => {
    setDrawerVisible(true);
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }),
      Animated.timing(overlayAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  };

  const closeDrawer = () => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: -DRAWER_WIDTH, duration: 220, useNativeDriver: true }),
      Animated.timing(overlayAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => {
      setDrawerVisible(false);
    });
  };

  return (
    <>
      {/* Header: Hamburger (left) | Farmley Logo (center) | Right element */}
      <View style={st.logoBar}>
        {Platform.OS === 'ios' && (
          <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}>
            <Icon name="chevron-back" size={22} color="#333" />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={openDrawer} style={st.hamburgerBtn}>
          <View style={{ width: 22, height: 16, justifyContent: 'space-between' }}>
            <View style={{ height: 2.5, backgroundColor: '#333', borderRadius: 1 }} />
            <View style={{ height: 2.5, backgroundColor: '#333', borderRadius: 1 }} />
            <View style={{ height: 2.5, backgroundColor: '#333', borderRadius: 1 }} />
          </View>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Image source={require('../../assets/farmley_logo.png')} style={st.logo} resizeMode="contain" />
        </View>
        <View style={{ width: 40 }}>{rightElement ?? null}</View>
      </View>
      <View style={st.blueLine} />

      {/* Side Drawer */}
      {drawerVisible && (
        <Modal transparent visible={true} onRequestClose={closeDrawer} animationType="none">
          <View style={st.drawerRoot}>
            <TouchableWithoutFeedback onPress={closeDrawer}>
              <Animated.View style={[st.drawerOverlay, { opacity: overlayAnim }]} />
            </TouchableWithoutFeedback>

            <Animated.View style={[st.drawerPanel, { transform: [{ translateX: slideAnim }] }]}>
              {/* Blue Header */}
              <LinearGradient colors={['#3040B0', '#4858CC']} style={st.drawerHeader}>
                <View style={st.avatar}>
                  <Icon name="person" size={40} color="#555" />
                </View>
                <View style={st.headerInfo}>
                  <Text style={st.headerName}>{user?.name ?? user?.code ?? 'User'}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#F59E0B', marginBottom: 2 }}>{user?.userType ?? 'User'}</Text>
                  <Text style={st.headerRoute}>Route : {user?.routeCode ?? user?.code ?? '-'}</Text>
                </View>
              </LinearGradient>
              <View style={{ height: 3, backgroundColor: '#E5A100' }} />

              {/* Menu */}
              <ScrollView style={st.menuScroll} showsVerticalScrollIndicator={false}>
                {/* Others — expands to show Settings */}
                <TouchableOpacity style={st.menuItem} onPress={() => setOthersExpanded(!othersExpanded)} activeOpacity={0.7}>
                  <MCIcon name="tune-vertical" size={26} color="rgba(255,255,255,0.7)" style={st.menuIcon} />
                  <Text style={st.menuLabel}>Others</Text>
                  <Text style={st.menuChevron}>{othersExpanded ? 'v' : '>'}</Text>
                </TouchableOpacity>
                {othersExpanded && (
                  <TouchableOpacity style={[st.menuItem, { paddingLeft: 58 }]} onPress={() => {
                    closeDrawer();
                    setOthersExpanded(false);
                    setTimeout(() => navigation.navigate('Settings'), 250);
                  }} activeOpacity={0.7}>
                    <MCIcon name="cog-outline" size={22} color="rgba(255,255,255,0.6)" style={st.menuIcon} />
                    <Text style={st.menuLabel}>Settings</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>

              {/* Footer */}
              <View style={st.footer}>
                <Image source={require('../../assets/winit-logo.png')} style={st.footerLogo} resizeMode="contain" />
              </View>
            </Animated.View>
          </View>
        </Modal>
      )}
    </>
  );
}

const st = StyleSheet.create({
  logoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'ios' ? 56 : (StatusBar.currentHeight ?? 24) + 8,
    paddingBottom: 8,
    paddingHorizontal: 12,
  },
  logo: { height: 38, width: 140 },
  blueLine: { height: 3, backgroundColor: '#1a3178' },
  titleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  backBtn: { padding: 4, marginRight: 2 },
  hamburgerBtn: { padding: 8 },
  screenTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },

  // Drawer
  drawerRoot: { flex: 1, flexDirection: 'row' },
  drawerOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  drawerPanel: {
    width: DRAWER_WIDTH,
    backgroundColor: '#3D4FC4',
    height: '100%',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 4, height: 0 }, shadowOpacity: 0.2, shadowRadius: 16 },
      android: { elevation: 16 },
    }),
  },
  drawerHeader: {
    padding: 24,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.5)',
    overflow: 'hidden',
  },
  headerInfo: { flex: 1 },
  headerName: { fontSize: 18, fontWeight: '700', color: '#FFFFFF', marginBottom: 4 },
  headerRoute: { fontSize: 14, color: 'rgba(255,255,255,0.8)' },
  headerChevron: { fontSize: 22, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  menuScroll: { flex: 1, paddingTop: 12 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  menuIcon: { width: 32, marginRight: 12 },
  menuLabel: { flex: 1, fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  menuChevron: { fontSize: 20, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
  footer: { padding: 20, paddingBottom: Platform.OS === 'ios' ? 34 : 20, alignItems: 'center' },
  footerLogo: { width: 180, height: 50 },
});
