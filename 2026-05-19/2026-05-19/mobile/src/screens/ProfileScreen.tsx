import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../utils/colors';
import useAuthStore from '../store/auth';
import api from '../api/client';

interface ExtendedProfile {
  email?: string;
  phone?: string;
}

interface InfoRowProps {
  label: string;
  value: string;
  last?: boolean;
}

function InfoRow({ label, value, last = false }: InfoRowProps) {
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || '—'}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const [extended, setExtended] = useState<ExtendedProfile>({});
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/users/profile');
        if (res.data) {
          setExtended({
            email: res.data.email,
            phone: res.data.phone,
          });
        }
      } catch {
        // Fall back to auth store data silently
      } finally {
        setLoadingProfile(false);
      }
    })();
  }, []);

  const initial = user?.name?.charAt(0)?.toUpperCase() ?? 'U';

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* Avatar + name */}
      <View style={styles.avatarSection}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarInitial}>{initial}</Text>
        </View>
        <Text style={styles.userName}>{user?.name ?? 'User'}</Text>
        <Text style={styles.userCode}>{user?.code ?? ''}</Text>
      </View>

      {/* Profile info card */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Account Details</Text>

        {loadingProfile ? (
          <ActivityIndicator
            size="small"
            color={Colors.primary}
            style={styles.loadingIndicator}
          />
        ) : null}

        <InfoRow label="User Code" value={user?.code ?? ''} />
        <InfoRow label="User Type" value={user?.userType ?? ''} />
        <InfoRow label="Route Code" value={user?.routeCode ?? ''} />

        {extended.email ? (
          <InfoRow label="Email" value={extended.email} />
        ) : null}

        {extended.phone ? (
          <InfoRow label="Phone" value={extended.phone} last />
        ) : (
          <InfoRow
            label="Phone"
            value={extended.phone ?? ''}
            last
          />
        )}
      </View>

      {/* Change password button */}
      <TouchableOpacity
        style={styles.changePasswordBtn}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('ChangePassword')}
      >
        <Text style={styles.changePasswordText}>Change Password</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const cardShadow = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  android: { elevation: 2 },
});

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 32,
    paddingBottom: 40,
    alignItems: 'center',
  },

  // Avatar section
  avatarSection: {
    alignItems: 'center',
    marginBottom: 28,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarInitial: {
    fontSize: 32,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  userName: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  userCode: {
    fontSize: 14,
    color: Colors.textSecondary,
  },

  // Info card
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
    width: '100%',
    marginBottom: 20,
    ...cardShadow,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  loadingIndicator: {
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  infoRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  infoLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    flex: 1,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    flex: 1,
    textAlign: 'right',
  },

  // Change password button
  changePasswordBtn: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    height: 56,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.primary,
    ...cardShadow,
  },
  changePasswordText: {
    color: Colors.primaryDark,
    fontSize: 16,
    fontWeight: '600',
  },
});
