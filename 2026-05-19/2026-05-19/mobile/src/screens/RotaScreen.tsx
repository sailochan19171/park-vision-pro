import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal, FlatList, TextInput, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import useAuthStore from '../store/auth';
import api from '../api/client';

interface RotaEntry {
  id: string;
  activityName: string;
  rotaDate: string;
  startTime: string;
  endTime: string;
}

interface UserOption { label: string; value: string; }

const SHIFT_COLORS: Record<string, string> = {
  'general shift': '#22c55e',
  'morning shift': '#3b82f6',
  'evening shift': '#60a5fa',
  'night shift': '#6366f1',
  'week off': '#9ca3af',
  'holiday': '#ef4444',
  'leave': '#ef4444',
};

function getShiftColor(name: string): string {
  const key = (name || '').toLowerCase().trim();
  for (const [pattern, color] of Object.entries(SHIFT_COLORS)) {
    if (key.includes(pattern)) return color;
  }
  return '#60a5fa';
}

function getDayAbbrev(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
}

function formatShortDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export default function RotaScreen() {
  const user = useAuthStore((s) => s.user);
  const [entries, setEntries] = useState<RotaEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(
    user ? { label: user.name ?? user.code, value: user.code } : null,
  );
  const [userModal, setUserModal] = useState(false);
  const [userSearch, setUserSearch] = useState('');

  const loadUsers = useCallback(async () => {
    try {
      const { data } = await api.get('/team/members');
      const members = data.members ?? [];
      const opts: UserOption[] = members.map((m: any) => ({ label: m.name ?? m.code, value: m.code }));
      if (user && !opts.find((o: UserOption) => o.value === user.code)) {
        opts.unshift({ label: user.name ?? user.code, value: user.code });
      }
      setUsers(opts);
    } catch {
      if (user) setUsers([{ label: user.name ?? user.code, value: user.code }]);
    }
  }, [user]);

  const loadRota = useCallback(async (userCode: string) => {
    setLoading(true);
    try {
      const { data } = await api.get('/rota', { params: { userCode, pageSize: 100 } });
      const raw: any[] = data.data ?? data.items ?? (Array.isArray(data) ? data : []);
      const items: RotaEntry[] = raw.map((r, i) => ({
        id: r.id?.toString() ?? `r_${i}`,
        activityName: r.activityName ?? r.activity_name ?? '',
        rotaDate: r.rotaDate ?? r.date ?? '',
        startTime: r.startTime ?? r.start_time ?? '',
        endTime: r.endTime ?? r.end_time ?? '',
      }));
      // Show only the LAST 3 MONTHS of rota, with the LATEST date at the top.
      // rotaDate is YYYY-MM-DD, so string compare is a valid date compare.
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 3);
      const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
      const recent = items
        .filter((it) => it.rotaDate && it.rotaDate >= cutoffStr)
        .sort((a, b) => b.rotaDate.localeCompare(a.rotaDate)); // latest first
      setEntries(recent);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadUsers();
    if (selectedUser) loadRota(selectedUser.value);
  }, [selectedUser?.value]));

  const handleSelectUser = (opt: UserOption) => {
    setSelectedUser(opt);
    setUserModal(false);
    setUserSearch('');
    loadRota(opt.value);
  };

  const filteredUsers = users.filter(
    (u) => u.label.toLowerCase().includes(userSearch.toLowerCase()) ||
            u.value.toLowerCase().includes(userSearch.toLowerCase()),
  );

  return (
    <View style={s.wrapper}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.pageTitle}>ROTA Schedule</Text>

        <Text style={s.label}>User Selection</Text>
        <TouchableOpacity style={s.dropdown} onPress={() => setUserModal(true)} activeOpacity={0.7}>
          <Text style={[s.dropdownText, !selectedUser && s.placeholder]}>
            {selectedUser ? selectedUser.label : 'Select User'}
          </Text>
          <Text style={s.dropdownArrow}>{'\u2228'}</Text>
        </TouchableOpacity>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color="#1a56db" size="large" />
        ) : entries.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={s.emptyText}>No data available.</Text>
          </View>
        ) : (
          <View style={s.entriesList}>
            {entries.map((entry) => {
              const color = getShiftColor(entry.activityName);
              return (
                <View key={entry.id} style={s.entryCard}>
                  <View style={s.entryLeft}>
                    <Text style={s.dayAbbrev}>{getDayAbbrev(entry.rotaDate)}</Text>
                    <Text style={s.entryDate}>{formatShortDate(entry.rotaDate)}</Text>
                  </View>
                  <View style={[s.shiftBadge, { backgroundColor: color + '22' }]}>
                    <Text style={[s.shiftBadgeText, { color }]}>{entry.activityName}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Modal visible={userModal} animationType="slide" onRequestClose={() => setUserModal(false)}>
        <View style={s.modal}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Select User</Text>
            <TouchableOpacity onPress={() => setUserModal(false)}>
              <Text style={s.modalClose}>Done</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={s.modalSearch}
            placeholder="Search user..."
            placeholderTextColor="#9CA3AF"
            value={userSearch}
            onChangeText={setUserSearch}
          />
          <FlatList
            data={filteredUsers}
            keyExtractor={(i) => i.value}
            renderItem={({ item }) => (
              <TouchableOpacity style={s.modalItem} onPress={() => handleSelectUser(item)}>
                <Text style={s.modalItemText}>{item.label}</Text>
                <Text style={s.modalItemSub}>{item.value}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#F5F7FA' },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  pageTitle: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 18 },
  label: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 8 },
  dropdown: {
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8,
    height: 48, paddingHorizontal: 14, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFFFFF',
    marginBottom: 20,
  },
  dropdownText: { fontSize: 15, color: '#111827', flex: 1 },
  placeholder: { color: '#9CA3AF' },
  dropdownArrow: { fontSize: 16, color: '#6B7280' },
  emptyBox: { paddingTop: 60, alignItems: 'center' },
  emptyText: { fontSize: 15, color: '#9CA3AF' },
  entriesList: { gap: 10 },
  entryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  entryLeft: {},
  dayAbbrev: { fontSize: 16, fontWeight: '700', color: '#111827' },
  entryDate: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  shiftBadge: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  shiftBadgeText: { fontSize: 13, fontWeight: '600' },
  modal: { flex: 1, backgroundColor: '#FFFFFF' },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, paddingTop: Platform.OS === 'ios' ? 52 : 16,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  modalClose: { fontSize: 15, color: '#1a56db', fontWeight: '600' },
  modalSearch: {
    margin: 12, backgroundColor: '#F9FAFB', borderRadius: 10,
    borderWidth: 1, borderColor: '#E5E7EB', padding: 12, fontSize: 15, color: '#111827',
  },
  modalItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  modalItemText: { fontSize: 15, color: '#111827', fontWeight: '500' },
  modalItemSub: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
});
