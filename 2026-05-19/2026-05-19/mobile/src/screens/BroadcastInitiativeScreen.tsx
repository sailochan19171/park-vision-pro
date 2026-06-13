import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import FarmleyHeader from '../components/common/FarmleyHeader';
import SideMenuDrawer from '../components/common/SideMenuDrawer';
import { Q } from '@nozbe/watermelondb';
import Icon from 'react-native-vector-icons/Ionicons';
import useAuthStore from '../store/auth';
import api from '../api/client';
import database from '../db/database';
import { getCurrentPosition } from '../services/locationService';
import { normalizePhone, isValidPhone, PHONE_VALIDATION_MESSAGE } from '../utils/phoneValidation';

type RouteParams = {
  BroadcastInitiative: {
    initiativeId?: string;
    title?: string;
    customerCode?: string;
    visitCode?: string;
  };
};

interface StoreOption {
  code: string;
  name: string;
}

export default function BroadcastInitiativeScreen() {
  const route = useRoute<RouteProp<RouteParams, 'BroadcastInitiative'>>();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const { initiativeId, title, customerCode: preselectedStore, visitCode } = route.params ?? {};

  const [stores, setStores] = useState<StoreOption[]>([]);
  const [selectedStore, setSelectedStore] = useState<string>(preselectedStore ?? '');
  const [showStorePicker, setShowStorePicker] = useState(false);
  const [storeSearch, setStoreSearch] = useState('');
  const [gender, setGender] = useState<'Male' | 'Female' | ''>('');
  const [endCustomerName, setEndCustomerName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [customerType, setCustomerType] = useState<'FTB' | 'RC' | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    async function loadStores() {
      try {
        const custs: any[] = await database
          .get('customers')
          .query(Q.where('is_active', true))
          .fetch();
        setStores(custs.map((c: any) => ({ code: c.code, name: c.name })));
      } catch (e) { console.warn("[App]", e); }
      setLoading(false);
    }
    loadStores();
  }, []);

  const selectedStoreName = stores.find((s) => s.code === selectedStore)?.name ?? '';

  const handleSubmit = async () => {
    if (!selectedStore) {
      Alert.alert('Required', 'Please select a store.');
      return;
    }
    if (!gender) {
      Alert.alert('Required', 'Please select gender.');
      return;
    }
    if (!endCustomerName.trim()) {
      Alert.alert('Required', 'Please enter end customer name.');
      return;
    }
    if (!mobileNumber.trim()) {
      Alert.alert('Required', 'Please enter mobile number.');
      return;
    }
    if (!isValidPhone(mobileNumber)) {
      Alert.alert('Invalid Phone', PHONE_VALIDATION_MESSAGE);
      return;
    }
    if (!customerType) {
      Alert.alert('Required', 'Please select FTB or RC.');
      return;
    }

    setSubmitting(true);
    try {
      let geoLat: number | null = null;
      let geoLng: number | null = null;
      try {
        const pos = await getCurrentPosition(true);
        if (pos) { geoLat = pos.lat; geoLng = pos.lng; }
      } catch (e) { console.warn('[BroadcastInitiative] GPS fetch failed:', e); }

      // OPTIMISTIC submit: enqueue + show success immediately; the outbox posts
      // /initiatives/broadcast in the background and retries until it lands.
      const { enqueueOutbox } = require('../services/outbox');
      await enqueueOutbox({
        endpoint: '/initiatives/broadcast',
        payload: {
          initiativeId: initiativeId ?? null,
          userCode: user?.code,
          customerCode: selectedStore,
          gender,
          endCustomerName: endCustomerName.trim(),
          mobileNumber: mobileNumber.trim(),
          customerType,
          visitCode: visitCode ?? null,
          geoLat,
          geoLng,
        },
      });
      setSubmitting(false);
      Alert.alert('Success', 'Broadcast initiative submitted successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      setSubmitting(false);
      Alert.alert('Error', err?.message ?? 'Failed to submit. Please try again.');
    }
  };

  const RadioButton = ({
    label,
    selected: isSelected,
    onPress,
  }: {
    label: string;
    selected: boolean;
    onPress: () => void;
  }) => (
    <TouchableOpacity style={styles.radioRow} activeOpacity={0.7} onPress={onPress}>
      <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
        {isSelected && <View style={styles.radioInner} />}
      </View>
      <Text style={styles.radioLabel}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <SideMenuDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        user={user}
        onNavigate={(screen) => {
          setDrawerOpen(false);
          navigation.navigate(screen);
        }}
        onLogout={() => {
          setDrawerOpen(false);
          useAuthStore.getState().logout();
        }}
        onEndDay={() => {
          setDrawerOpen(false);
          navigation.navigate('EndOfDay');
        }}
        dayStarted={true}
      />

      <FarmleyHeader onMenuPress={() => setDrawerOpen(true)} />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          {/* Select Store */}
          <Text style={styles.fieldLabel}>Select Store</Text>
          <TouchableOpacity
            style={styles.dropdown}
            activeOpacity={0.7}
            onPress={() => setShowStorePicker(!showStorePicker)}
          >
            <Text style={selectedStore ? styles.dropdownText : styles.dropdownPlaceholder}>
              {selectedStoreName || 'Select Store'}
            </Text>
            <Icon name="chevron-down" size={20} color="#6B7280" />
          </TouchableOpacity>

          {showStorePicker && (
            <View style={styles.pickerList}>
              <View style={styles.searchRow}>
                <Icon name="search" size={18} color="#9CA3AF" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search store by name or code"
                  placeholderTextColor="#9CA3AF"
                  value={storeSearch}
                  onChangeText={setStoreSearch}
                  autoFocus
                />
                {storeSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setStoreSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Icon name="close-circle" size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                )}
              </View>
              <ScrollView style={styles.pickerScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {stores
                  .filter((s) => {
                    if (!storeSearch.trim()) return true;
                    const q = storeSearch.trim().toLowerCase();
                    return s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q);
                  })
                  .map((s) => (
                  <TouchableOpacity
                    key={s.code}
                    style={[styles.pickerItem, s.code === selectedStore && styles.pickerItemSelected]}
                    onPress={() => {
                      setSelectedStore(s.code);
                      setShowStorePicker(false);
                      setStoreSearch('');
                    }}
                  >
                    <Text style={styles.pickerItemText}>{s.name} ({s.code})</Text>
                  </TouchableOpacity>
                ))}
                {stores.filter((s) => {
                  if (!storeSearch.trim()) return true;
                  const q = storeSearch.trim().toLowerCase();
                  return s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q);
                }).length === 0 && (
                  <Text style={{ padding: 14, color: '#9CA3AF', textAlign: 'center', fontSize: 13 }}>No stores found</Text>
                )}
              </ScrollView>
            </View>
          )}

          {/* Gender */}
          <View style={styles.radioGroup}>
            <RadioButton label="Male" selected={gender === 'Male'} onPress={() => setGender('Male')} />
            <RadioButton label="Female" selected={gender === 'Female'} onPress={() => setGender('Female')} />
          </View>

          {/* End Customer Name — letters / spaces / common punctuation
              only. Reps were entering phone numbers and digits into the
              name field, which broke downstream report filters that match
              by name. Strip any digit before it lands in state. */}
          <Text style={styles.fieldLabel}>End Customer Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter End Customer Name"
            placeholderTextColor="#9CA3AF"
            value={endCustomerName}
            onChangeText={(v) => setEndCustomerName(v.replace(/[0-9]/g, ''))}
            autoCapitalize="words"
          />

          {/* Mobile Number */}
          <Text style={styles.fieldLabel}>Mobile Number</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter 10-digit mobile number"
            placeholderTextColor="#9CA3AF"
            value={mobileNumber}
            onChangeText={(v) => setMobileNumber(normalizePhone(v))}
            keyboardType="phone-pad"
            maxLength={10}
          />

          {/* FTB / RC */}
          <View style={styles.radioGroup}>
            <RadioButton label="FTB" selected={customerType === 'FTB'} onPress={() => setCustomerType('FTB')} />
            <RadioButton label="RC" selected={customerType === 'RC'} onPress={() => setCustomerType('RC')} />
          </View>
        </View>
      </ScrollView>

      {/* Submit */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          activeOpacity={0.8}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitBtnText}>Submit</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E5E7EB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
  },
  backBtn: {
    padding: 4,
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  headerLine: {
    height: 3,
    backgroundColor: '#1a3c7a',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 12,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
    marginTop: 4,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 16,
  },
  dropdownText: {
    fontSize: 15,
    color: '#111827',
  },
  dropdownPlaceholder: {
    fontSize: 15,
    color: '#9CA3AF',
  },
  pickerList: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    marginBottom: 16,
    maxHeight: 280,
    backgroundColor: '#F9FAFB',
  },
  searchRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: '#111827',
    paddingVertical: 4,
  },
  pickerScroll: {
    maxHeight: 220,
  },
  pickerItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  pickerItemSelected: {
    backgroundColor: '#EBF5FF',
  },
  pickerItemText: {
    fontSize: 14,
    color: '#111827',
  },
  radioGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    gap: 32,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#6B7280',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  radioOuterSelected: {
    borderColor: '#1a3c7a',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#1a3c7a',
  },
  radioLabel: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: '#111827',
    marginBottom: 16,
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#E5E7EB',
  },
  submitBtn: {
    backgroundColor: '#1a237e',
    borderRadius: 10,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});
