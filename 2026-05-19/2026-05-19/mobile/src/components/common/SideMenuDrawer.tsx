import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Modal,
  Animated,
  Dimensions,
  TouchableWithoutFeedback,
  Image,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Ionicons';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = SCREEN_WIDTH * 0.78;

interface DrawerItem {
  label: string;
  screen: string;
  mcIcon: string;
  tlOnly?: boolean;
}

const DRAWER_ITEMS: DrawerItem[] = [
  { label: 'My Tasks',              screen: 'SurveyList',          mcIcon: 'clipboard-text-outline' },
  { label: 'My Store(s)',           screen: 'Stores',              mcIcon: 'handshake-outline' },
  { label: 'Target Vs Achievement', screen: 'TargetVsAchievement', mcIcon: 'clipboard-text-outline' },
  { label: 'Rota Creation',         screen: 'RotaCreate',          mcIcon: 'clipboard-text-outline' },
  { label: 'Reports',               screen: 'MobileReports',       mcIcon: 'clipboard-text-outline' },
  { label: 'Location Approvals',    screen: 'LocationApproval',    mcIcon: 'map-marker-check-outline', tlOnly: true },
  { label: 'Others',                screen: 'Settings',            mcIcon: 'tune-vertical' },
];

const TL_USER_TYPES = new Set(['Team Leader', 'ATL', 'Manager', 'Senior Manager']);
const ALWAYS_ALLOWED = new Set(['RotaCreate', 'MobileReports', 'Settings']);

interface Props {
  visible: boolean;
  onClose: () => void;
  user: any;
  onNavigate: (screen: string) => void;
  onLogout: () => void;
  onEndDay: () => void;
  highlight?: string | null;
  dayEnded?: boolean;
  dayStarted?: boolean;
}

export default function SideMenuDrawer({
  visible,
  onClose,
  user,
  onNavigate,
  onLogout,
  onEndDay,
  highlight,
  dayEnded,
  dayStarted,
}: Props) {
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const [othersExpanded, setOthersExpanded] = React.useState(false);

  React.useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }),
        Animated.timing(overlayAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: -DRAWER_WIDTH, duration: 220, useNativeDriver: true }),
        Animated.timing(overlayAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!visible && (slideAnim as any).__getValue() === -DRAWER_WIDTH) return null;

  return (
    <Modal transparent visible={visible} onRequestClose={onClose} animationType="none">
      <View style={drawer.root}>
        {/* Overlay */}
        <TouchableWithoutFeedback onPress={onClose}>
          <Animated.View style={[drawer.overlay, { opacity: overlayAnim }]} />
        </TouchableWithoutFeedback>

        {/* Panel */}
        <Animated.View style={[drawer.panel, { transform: [{ translateX: slideAnim }] }]}>
          {/* Header */}
          <LinearGradient colors={['#3040B0', '#4858CC']} style={drawer.header}>
            <View style={drawer.avatar}>
              <Icon name="person" size={40} color="#555" />
            </View>
            <View style={drawer.headerInfo}>
              <Text style={drawer.headerName}>{user?.name ?? user?.code ?? 'User'}</Text>
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 2 }}>[{user?.code ?? '-'}]</Text>
              <Text style={drawer.headerRole}>{user?.userType ?? 'User'}</Text>
              <Text style={drawer.headerRoute}>Route : {user?.routeCode ?? user?.code ?? '-'}</Text>
            </View>
          </LinearGradient>

          {/* Orange separator */}
          <View style={{ height: 3, backgroundColor: '#E5A100' }} />

          {/* Menu Items */}
          <ScrollView style={drawer.menuScroll} showsVerticalScrollIndicator={false}>
            {DRAWER_ITEMS.filter((item) => {
              if (item.tlOnly) return TL_USER_TYPES.has(user?.userType ?? '');
              return true;
            }).map((item, idx) => {
              const isHighlighted = highlight && item.screen === highlight;
              const isBlocked = !!dayEnded
                && item.label !== 'Others'
                && !ALWAYS_ALLOWED.has(item.screen);
              return (
                <React.Fragment key={idx}>
                  <TouchableOpacity
                    style={[
                      drawer.menuItem,
                      isHighlighted && { backgroundColor: 'rgba(229,161,0,0.25)', borderLeftWidth: 4, borderLeftColor: '#E5A100' },
                      isBlocked && { opacity: 0.4 },
                    ]}
                    onPress={() => {
                      if (isBlocked) return;
                      if (item.label === 'Others') {
                        setOthersExpanded(!othersExpanded);
                      } else {
                        onClose(); onNavigate(item.screen);
                      }
                    }}
                    disabled={isBlocked}
                    activeOpacity={isBlocked ? 1 : 0.7}
                  >
                    <MCIcon name={item.mcIcon} size={26} color={isHighlighted ? '#FFFFFF' : 'rgba(255,255,255,0.7)'} style={drawer.menuIconStyle} />
                    <Text style={[drawer.menuLabel, isHighlighted && { color: '#FFFFFF' }]}>{item.label}</Text>
                    {isBlocked ? (
                      <MCIcon name="lock" size={18} color="rgba(255,255,255,0.55)" style={{ marginLeft: 'auto', marginRight: 8 }} />
                    ) : null}
                    {item.label === 'Others' && <Text style={drawer.menuChevron}>{othersExpanded ? 'v' : '>'}</Text>}
                  </TouchableOpacity>
                  {item.label === 'Others' && othersExpanded && (
                    <TouchableOpacity
                      style={[drawer.menuItem, { paddingLeft: 58 }]}
                      onPress={() => { onClose(); onNavigate('Settings'); }}
                      activeOpacity={0.7}
                    >
                      <MCIcon name="cog-outline" size={22} color="rgba(255,255,255,0.6)" style={drawer.menuIconStyle} />
                      <Text style={drawer.menuLabel}>Settings</Text>
                    </TouchableOpacity>
                  )}
                </React.Fragment>
              );
            })}

            {/* Day End */}
            <TouchableOpacity
              style={[drawer.menuItem, dayEnded && { opacity: 0.4 }]}
              disabled={dayEnded}
              onPress={() => { if (dayEnded) return; onClose(); onEndDay(); }}
              activeOpacity={dayEnded ? 1 : 0.7}
            >
              <MCIcon name="pencil-outline" size={26} color="rgba(255,255,255,0.7)" style={drawer.menuIconStyle} />
              <Text style={drawer.menuLabel}>Day End</Text>
              {dayEnded ? (
                <MCIcon name="lock" size={18} color="rgba(255,255,255,0.55)" style={{ marginLeft: 'auto', marginRight: 8 }} />
              ) : null}
            </TouchableOpacity>

            {/* Logout */}
            <TouchableOpacity
              style={drawer.menuItem}
              onPress={() => { onClose(); onLogout(); }}
              activeOpacity={0.7}
            >
              <MCIcon name="logout" size={26} color="rgba(255,255,255,0.7)" style={drawer.menuIconStyle} />
              <Text style={drawer.menuLabel}>Logout</Text>
            </TouchableOpacity>

          </ScrollView>

          {/* Footer - WINIT logo */}
          <View style={drawer.footer}>
            <Image source={require('../../assets/winit-logo.png')} style={drawer.footerLogo} resizeMode="contain" />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const drawer = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  panel: {
    width: DRAWER_WIDTH,
    backgroundColor: '#3D4FC4',
    height: '100%',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 4, height: 0 }, shadowOpacity: 0.2, shadowRadius: 16 },
      android: { elevation: 16 },
    }),
  },
  header: {
    padding: 24,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.6)',
    overflow: 'hidden',
  },
  headerInfo: { flex: 1 },
  headerName: { fontSize: 18, fontWeight: '700', color: '#FFFFFF', marginBottom: 4 },
  headerRole: { fontSize: 12, fontWeight: '600', color: '#F59E0B', marginBottom: 2 },
  headerRoute: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  menuScroll: { flex: 1, paddingTop: 12 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  menuIconStyle: { width: 32, marginRight: 12 },
  menuLabel: { flex: 1, fontSize: 16, color: '#FFFFFF', fontWeight: '700' },
  menuChevron: { fontSize: 20, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
  footer: { padding: 20, paddingBottom: Platform.OS === 'ios' ? 34 : 20, alignItems: 'center' },
  footerLogo: { width: 180, height: 50 },
});
