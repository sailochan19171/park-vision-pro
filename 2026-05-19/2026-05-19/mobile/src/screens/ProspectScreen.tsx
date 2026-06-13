import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Platform,
  Alert,
  RefreshControl,
  ScrollView,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { v4 as uuidv4 } from 'uuid';
import { Q } from '@nozbe/watermelondb';
import { Colors } from '../utils/colors';
import { normalizePhone, isValidOptionalPhone, PHONE_VALIDATION_MESSAGE } from '../utils/phoneValidation';
import useAuthStore from '../store/auth';
import database from '../db/database';

type TabKey = 'list' | 'add';

type ProspectStatus = 'new' | 'contacted' | 'qualified' | 'rejected';

type ChannelType = 'Modern Trade' | 'General Trade' | 'HoReCa' | 'Others';

interface Prospect {
  id: string;
  prospectName: string;
  contactName: string;
  phone: string;
  address: string;
  city: string;
  channelType: string;
  notes: string;
  status: ProspectStatus;
  createdOn: number;
}

interface ProspectForm {
  prospectName: string;
  contactName: string;
  phone: string;
  address: string;
  city: string;
  channelType: ChannelType;
  notes: string;
}

const STATUS_STYLE: Record<ProspectStatus, { bg: string; text: string; label: string }> = {
  new: { bg: '#dbeafe', text: '#1d4ed8', label: 'New' },
  contacted: { bg: '#ffedd5', text: '#c2410c', label: 'Contacted' },
  qualified: { bg: '#dcfce7', text: '#15803d', label: 'Qualified' },
  rejected: { bg: '#f3f4f6', text: '#6b7280', label: 'Rejected' },
};

const CHANNEL_TYPES: ChannelType[] = [
  'Modern Trade',
  'General Trade',
  'HoReCa',
  'Others',
];

const STATUS_FILTERS: { key: ProspectStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'qualified', label: 'Qualified' },
  { key: 'rejected', label: 'Rejected' },
];

const EMPTY_FORM: ProspectForm = {
  prospectName: '',
  contactName: '',
  phone: '',
  address: '',
  city: '',
  channelType: 'General Trade',
  notes: '',
};

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Simple toast using Animated
function useToast() {
  const opacity = useRef(new Animated.Value(0)).current;
  const [toastMsg, setToastMsg] = useState('');

  const showToast = useCallback(
    (msg: string) => {
      setToastMsg(msg);
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.delay(1800),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    },
    [opacity],
  );

  return { opacity, toastMsg, showToast };
}

export default function ProspectScreen() {
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);

  const [activeTab, setActiveTab] = useState<TabKey>('list');
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ProspectStatus | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [form, setForm] = useState<ProspectForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const { opacity, toastMsg, showToast } = useToast();

  const loadProspects = useCallback(async () => {
    try {
      const records = await database
        .get('prospects')
        .query(Q.where('user_code', user?.code ?? ''), Q.sortBy('created_on', Q.desc))
        .fetch();

      const mapped: Prospect[] = records.map((r: any) => ({
        id: r.id,
        prospectName: r.prospectName,
        contactName: r.contactName ?? '',
        phone: r.phone ?? '',
        address: r.address ?? '',
        city: r.city ?? '',
        channelType: r.channelType ?? '',
        notes: r.notes ?? '',
        status: r.status as ProspectStatus,
        createdOn: r.createdOn,
      }));

      setProspects(mapped);
    } catch (err) {
      console.error('ProspectScreen loadProspects error:', err);
    }
  }, [user?.code]);

  useEffect(() => {
    loadProspects().finally(() => setLoadingList(false));
  }, [loadProspects]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadProspects();
    setRefreshing(false);
  }, [loadProspects]);

  const setField = <K extends keyof ProspectForm>(key: K, value: ProspectForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmitForm = async () => {
    if (form.prospectName.trim() === '') {
      Alert.alert('Required', 'Prospect Name is required.');
      return;
    }
    if (!isValidOptionalPhone(form.phone)) {
      Alert.alert('Invalid Phone', PHONE_VALIDATION_MESSAGE);
      return;
    }

    setSaving(true);
    try {
      const id = uuidv4();
      const now = Date.now();

      await database.write(async () => {
        await database.get('prospects').create((rec: any) => {
          rec._raw.id = id;
          rec.appTrxId = id;
          rec.userCode = user?.code ?? '';
          rec.prospectName = form.prospectName.trim();
          rec.contactName = form.contactName.trim() || null;
          rec.phone = form.phone.trim() || null;
          rec.address = form.address.trim() || null;
          rec.city = form.city.trim() || null;
          rec.channelType = form.channelType;
          rec.notes = form.notes.trim() || null;
          rec.status = 'new';
          rec.createdOn = now;
          rec.isSynced = false;
        });
      });

      setForm(EMPTY_FORM);
      await loadProspects();
      setActiveTab('list');
      showToast('Prospect added successfully');
    } catch (err) {
      Alert.alert('Error', 'Failed to save prospect. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const filteredProspects = prospects.filter((p) => {
    if (statusFilter === 'all') return true;
    return p.status === statusFilter;
  });

  const renderProspectCard = ({ item }: { item: Prospect }) => {
    const isExpanded = expandedId === item.id;
    const st = STATUS_STYLE[item.status] ?? STATUS_STYLE.new;

    return (
      <TouchableOpacity
        style={styles.prospectCard}
        activeOpacity={0.85}
        onPress={() => setExpandedId(isExpanded ? null : item.id)}
      >
        <View style={styles.prospectCardHeader}>
          <View style={styles.prospectMainInfo}>
            <Text style={styles.prospectName}>{item.prospectName}</Text>
            {item.phone !== '' && (
              <Text style={styles.prospectPhone}>{item.phone}</Text>
            )}
          </View>
          <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
            <Text style={[styles.statusBadgeText, { color: st.text }]}>
              {st.label}
            </Text>
          </View>
        </View>

        {item.address !== '' && !isExpanded && (
          <Text style={styles.prospectAddressPreview} numberOfLines={1}>
            {item.address}{item.city !== '' ? `, ${item.city}` : ''}
          </Text>
        )}

        {isExpanded && (
          <View style={styles.expandedContent}>
            <View style={styles.separator} />
            {item.contactName !== '' && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Contact</Text>
                <Text style={styles.detailValue}>{item.contactName}</Text>
              </View>
            )}
            {item.address !== '' && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Address</Text>
                <Text style={styles.detailValue}>
                  {item.address}{item.city !== '' ? `, ${item.city}` : ''}
                </Text>
              </View>
            )}
            {item.channelType !== '' && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Channel</Text>
                <Text style={styles.detailValue}>{item.channelType}</Text>
              </View>
            )}
            {item.notes !== '' && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Notes</Text>
                <Text style={styles.detailValue}>{item.notes}</Text>
              </View>
            )}
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Added</Text>
              <Text style={styles.detailValue}>{formatDate(item.createdOn)}</Text>
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderListTab = () => (
    <View style={styles.tabContent}>
      {/* Status Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterChipsRow}
      >
        {STATUS_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[
              styles.filterChip,
              statusFilter === f.key && styles.filterChipActive,
            ]}
            activeOpacity={0.7}
            onPress={() => setStatusFilter(f.key)}
          >
            <Text
              style={[
                styles.filterChipText,
                statusFilter === f.key && styles.filterChipTextActive,
              ]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loadingList ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredProspects}
          keyExtractor={(item) => item.id}
          renderItem={renderProspectCard}
          contentContainerStyle={[
            styles.listContent,
            filteredProspects.length === 0 && styles.listContentEmpty,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[Colors.primary]}
              tintColor={Colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No prospects yet</Text>
              <Text style={styles.emptySubtitle}>
                Tap "Add New" to add your first prospect.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );

  const renderAddTab = () => (
    <ScrollView
      style={styles.formScroll}
      contentContainerStyle={styles.formContent}
      keyboardShouldPersistTaps="handled"
    >
      {/* Prospect Name */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>
          Prospect Name <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={styles.fieldInput}
          placeholder="Enter business / store name"
          placeholderTextColor={Colors.textSecondary}
          value={form.prospectName}
          onChangeText={(v) => setField('prospectName', v)}
          returnKeyType="next"
        />
      </View>

      {/* Contact Name */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Contact Name</Text>
        <TextInput
          style={styles.fieldInput}
          placeholder="Owner / manager name"
          placeholderTextColor={Colors.textSecondary}
          value={form.contactName}
          onChangeText={(v) => setField('contactName', v)}
          returnKeyType="next"
        />
      </View>

      {/* Phone */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Phone</Text>
        <TextInput
          style={styles.fieldInput}
          placeholder="10-digit mobile number"
          placeholderTextColor={Colors.textSecondary}
          value={form.phone}
          onChangeText={(v) => setField('phone', normalizePhone(v))}
          keyboardType="phone-pad"
          maxLength={10}
          returnKeyType="next"
        />
      </View>

      {/* Address */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Address</Text>
        <TextInput
          style={[styles.fieldInput, styles.fieldInputMulti]}
          placeholder="Street address"
          placeholderTextColor={Colors.textSecondary}
          value={form.address}
          onChangeText={(v) => setField('address', v)}
          multiline
          numberOfLines={2}
          textAlignVertical="top"
        />
      </View>

      {/* City */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>City</Text>
        <TextInput
          style={styles.fieldInput}
          placeholder="City"
          placeholderTextColor={Colors.textSecondary}
          value={form.city}
          onChangeText={(v) => setField('city', v)}
          returnKeyType="next"
        />
      </View>

      {/* Channel Type */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Channel Type</Text>
        <View style={styles.channelGrid}>
          {CHANNEL_TYPES.map((ch) => (
            <TouchableOpacity
              key={ch}
              style={[
                styles.channelBtn,
                form.channelType === ch && styles.channelBtnActive,
              ]}
              activeOpacity={0.7}
              onPress={() => setField('channelType', ch)}
            >
              <Text
                style={[
                  styles.channelBtnText,
                  form.channelType === ch && styles.channelBtnTextActive,
                ]}
              >
                {ch}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Notes */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Notes</Text>
        <TextInput
          style={[styles.fieldInput, styles.fieldInputMulti]}
          placeholder="Any additional notes..."
          placeholderTextColor={Colors.textSecondary}
          value={form.notes}
          onChangeText={(v) => setField('notes', v)}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
      </View>

      {/* GPS note */}
      <View style={styles.gpsNote}>
        <Text style={styles.gpsNoteText}>
          GPS location will be captured automatically on submit.
        </Text>
      </View>

      {/* Submit */}
      <TouchableOpacity
        style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
        activeOpacity={0.8}
        onPress={handleSubmitForm}
        disabled={saving}
      >
        <Text style={styles.submitBtnText}>
          {saving ? 'Saving...' : 'Add Prospect'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );

  return (
    <View style={styles.container}>
      {/* Tab Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'list' && styles.tabBtnActive]}
          activeOpacity={0.7}
          onPress={() => setActiveTab('list')}
        >
          <Text
            style={[
              styles.tabBtnText,
              activeTab === 'list' && styles.tabBtnTextActive,
            ]}
          >
            My Prospects
            {prospects.length > 0 ? ` (${prospects.length})` : ''}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'add' && styles.tabBtnActive]}
          activeOpacity={0.7}
          onPress={() => setActiveTab('add')}
        >
          <Text
            style={[
              styles.tabBtnText,
              activeTab === 'add' && styles.tabBtnTextActive,
            ]}
          >
            + Add New
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'list' ? renderListTab() : renderAddTab()}

      {/* Toast */}
      <Animated.View style={[styles.toast, { opacity }]} pointerEvents="none">
        <Text style={styles.toastText}>{toastMsg}</Text>
      </Animated.View>
    </View>
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
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Tab Bar
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {
    borderBottomColor: Colors.primary,
  },
  tabBtnText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  tabBtnTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },

  // List Tab
  tabContent: {
    flex: 1,
  },
  filterChipsRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  filterChipTextActive: {
    color: Colors.white,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  prospectCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    ...cardShadow,
  },
  prospectCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  prospectMainInfo: {
    flex: 1,
  },
  prospectName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 2,
  },
  prospectPhone: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  prospectAddressPreview: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 6,
  },
  expandedContent: {
    marginTop: 4,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 10,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 6,
    gap: 8,
  },
  detailLabel: {
    width: 60,
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    paddingTop: 1,
  },
  detailValue: {
    flex: 1,
    fontSize: 13,
    color: Colors.text,
    lineHeight: 18,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Add Form Tab
  formScroll: {
    flex: 1,
  },
  formContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 40,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  required: {
    color: Colors.danger,
  },
  fieldInput: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 13 : 9,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    ...cardShadow,
  },
  fieldInputMulti: {
    minHeight: 70,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  channelGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  channelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    ...cardShadow,
  },
  channelBtnActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  channelBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  channelBtnTextActive: {
    color: Colors.primaryDark,
    fontWeight: '600',
  },
  gpsNote: {
    backgroundColor: '#fffbeb',
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  gpsNoteText: {
    fontSize: 12,
    color: '#92400e',
    textAlign: 'center',
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },

  // Toast
  toast: {
    position: 'absolute',
    bottom: 32,
    left: 32,
    right: 32,
    backgroundColor: '#1f2937',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
      },
      android: { elevation: 8 },
    }),
  },
  toastText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
