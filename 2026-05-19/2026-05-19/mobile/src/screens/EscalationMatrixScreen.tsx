import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Platform,
  Image,
  Dimensions,
  Modal,
  StatusBar,
} from 'react-native';
import { ReactNativeZoomableView } from '@openspacelabs/react-native-zoomable-view';
import useAuthStore from '../store/auth';

const escalationImage = require('../assets/escalation_matrix.jpeg');

const TM_CONTACTS = [
  { poc: 'Abuzar Ansari', dept: 'North/South', domain: 'Stock, Visibility, Price, Sales, Hiring', phone: '91 88029 01588' },
  { poc: 'Vedant Sharma', dept: 'North/South', domain: 'High Focus, Delivery, Data Reports', phone: '91 99101 90062' },
  { poc: 'Pranjal Singh', dept: 'East/West/Central', domain: 'Stock, Visibility, Price, Sales', phone: '91 99108 88245' },
  { poc: 'Prerak Boora', dept: 'East/West/Central', domain: 'High Focus, Delivery, Data Reports', phone: '91 7428 033 645' },
  { poc: 'Ankita Pattnaik', dept: 'Pan India', domain: 'Winit/Data', phone: '91 9090932982' },
  { poc: 'Kanchan Chauhan', dept: 'Pan India', domain: 'Aging/Delivery', phone: '91 88820 02779' },
];

const HR_CONTACTS = [
  { poc: 'Sakshi', dept: 'HR', domain: 'Attendance and Documentation', phone: '919990816401' },
  { poc: 'Hitesh', dept: 'HR', domain: 'FNF', phone: '91 98174 40699' },
  { poc: 'Arun', dept: 'HR', domain: 'PF and ESIC', phone: '919013540199' },
  { poc: 'Rubi', dept: 'HR', domain: 'Reimbursements', phone: '918826552058' },
  { poc: 'Sanam', dept: 'HR', domain: 'Reimbursements', phone: '918743873673' },
  { poc: 'Shubham', dept: 'HR - IT', domain: 'E-mail & Razorpay Technical Issues', phone: '91 97160 06774' },
  { poc: 'Neeraj', dept: 'HR', domain: 'Attendance & Salary Disbursement', phone: '919717472021' },
];

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function EscalationMatrixScreen() {
  const user = useAuthStore((s) => s.user);
  const [previewOpen, setPreviewOpen] = useState(false);

  const callNumber = (phone: string) => {
    const cleaned = phone.replace(/\s/g, '');
    Linking.openURL(`tel:+${cleaned}`);
  };


  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* User Info Card */}
      <View style={styles.userCard}>
        <View style={styles.avatarBox}>
          <Text style={styles.avatarText}>{user?.name?.charAt(0)?.toUpperCase() ?? 'U'}</Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{user?.name ?? '-'}</Text>
          <Text style={styles.userRole}>{user?.userType ?? '-'}</Text>
        </View>
      </View>

      {/* Escalation Image — tap to open the full-screen zoomable preview */}
      <TouchableOpacity
        style={styles.imageCard}
        activeOpacity={0.85}
        onPress={() => setPreviewOpen(true)}
      >
        <Image
          source={escalationImage}
          style={styles.escalationImage}
          resizeMode="contain"
        />
        <View style={styles.imageHintPill}>
          <Text style={styles.imageHintText}>Tap to preview · pinch to zoom</Text>
        </View>
      </TouchableOpacity>

      {/* TM Section */}
      <Text style={styles.sectionTitle}>TM — TERRITORY MANAGEMENT</Text>
      {TM_CONTACTS.map((c, idx) => (
        <View key={idx} style={styles.contactCard}>
          <View style={[styles.categoryStrip, { backgroundColor: '#00BCD4' }]} />
          <View style={styles.contactBody}>
            <View style={styles.contactHeader}>
              <Text style={styles.contactName}>{c.poc}</Text>
              <Text style={styles.contactDept}>{c.dept}</Text>
            </View>
            <Text style={styles.contactDomain}>{c.domain}</Text>
            <TouchableOpacity style={styles.phoneRow} onPress={() => callNumber(c.phone)}>
              <Text style={styles.phoneIcon}>📞</Text>
              <Text style={styles.phoneText}>{c.phone}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {/* HR Section */}
      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>HR — HUMAN RESOURCES</Text>
      {HR_CONTACTS.map((c, idx) => (
        <View key={idx} style={styles.contactCard}>
          <View style={[styles.categoryStrip, { backgroundColor: '#FFEB3B' }]} />
          <View style={styles.contactBody}>
            <View style={styles.contactHeader}>
              <Text style={styles.contactName}>{c.poc}</Text>
              <Text style={styles.contactDept}>{c.dept}</Text>
            </View>
            <Text style={styles.contactDomain}>{c.domain}</Text>
            <TouchableOpacity style={styles.phoneRow} onPress={() => callNumber(c.phone)}>
              <Text style={styles.phoneIcon}>📞</Text>
              <Text style={styles.phoneText}>{c.phone}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      <View style={{ height: 40 }} />

      {/* Full-screen preview with pinch-to-zoom (ReactNativeZoomableView) */}
      <Modal
        visible={previewOpen}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => setPreviewOpen(false)}
      >
        {previewOpen && (
          <View style={styles.previewBg}>
            <StatusBar barStyle="light-content" backgroundColor="#000" />
            <ReactNativeZoomableView
              maxZoom={5}
              minZoom={1}
              initialZoom={1}
              bindToBorders={true}
              style={styles.zoomableContainer}
            >
              <Image
                source={escalationImage}
                style={styles.previewImage}
                resizeMode="contain"
              />
            </ReactNativeZoomableView>

            {/* Close (top-right) */}
            <TouchableOpacity style={styles.previewClose} onPress={() => setPreviewOpen(false)} activeOpacity={0.75}>
              <Text style={styles.previewCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  content: { padding: 16, paddingBottom: 40 },

  userCard: {
    backgroundColor: '#1a56db',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarBox: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    marginRight: 16,
  },
  avatarText: { fontSize: 26, fontWeight: '700', color: '#FFFFFF' },
  userInfo: { flex: 1 },
  userName: { fontSize: 18, fontWeight: '700', color: '#FFFFFF', marginBottom: 4 },
  userRole: { fontSize: 13, color: 'rgba(255,255,255,0.8)' },

  imageCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 8,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  escalationImage: {
    width: SCREEN_WIDTH - 48,
    height: (SCREEN_WIDTH - 48) * 0.55,
    borderRadius: 8,
  },
  imageHintPill: {
    position: 'absolute', bottom: 14, right: 14,
    backgroundColor: 'rgba(15,23,42,0.72)',
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999,
  },
  imageHintText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },

  previewBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
  },
  previewScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomableContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.8,
  },
  previewClose: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 24,
    right: 16,
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  previewCloseText: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },

  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },

  contactCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    flexDirection: 'row',
    overflow: 'hidden',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 },
      android: { elevation: 1 },
    }),
  },
  categoryStrip: {
    width: 5,
  },
  contactBody: {
    flex: 1,
    padding: 14,
  },
  contactHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  contactName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  contactDept: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  contactDomain: {
    fontSize: 13,
    color: '#4B5563',
    marginBottom: 8,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  phoneIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  phoneText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a56db',
  },
});
