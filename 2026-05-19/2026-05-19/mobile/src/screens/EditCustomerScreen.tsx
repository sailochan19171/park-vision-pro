import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Platform, Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Q } from '@nozbe/watermelondb';
import Icon from 'react-native-vector-icons/Ionicons';
import database from '../db/database';
import useAuthStore from '../store/auth';
import { getCurrentPosition, getCachedPosition } from '../services/locationService';

type Params = { EditCustomer: { customerCode: string; customerName: string } };

const CHANNELS = ['Modern Trade', 'General Trade', 'HoReCa', 'Wholesale', 'Others'];
const SOURCES = ['Direct', 'Referral', 'Cold Call', 'Exhibition', 'Online'];
const COUNTRIES = ['AE', 'IN', 'SA', 'OM', 'BH', 'KW', 'QA'];
const REGIONS = ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'RAK', 'Fujairah', 'UAQ'];
const CITIES = ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Al Ain', 'Fujairah', 'RAK'];

export default function EditCustomerScreen() {
  const route = useRoute<RouteProp<Params, 'EditCustomer'>>();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const { customerCode, customerName } = route.params;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAdditional, setShowAdditional] = useState(false);
  const [showDocuments, setShowDocuments] = useState(false);

  // Form fields
  const [prospectName, setProspectName] = useState(customerName);
  const [outletName, setOutletName] = useState('');
  const [legalName, setLegalName] = useState(customerName);
  const [aliasName, setAliasName] = useState(customerName);
  const [storeGroupType, setStoreGroupType] = useState('Channel');
  const [channel, setChannel] = useState('');
  const [source, setSource] = useState('');
  const [code, setCode] = useState(customerCode);
  const [country, setCountry] = useState('AE');
  const [region, setRegion] = useState('');
  const [city, setCity] = useState('');
  const [gpsLat, setGpsLat] = useState<number | null>(null);
  const [gpsLng, setGpsLng] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);

  // Dropdown state
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const custs: any[] = await database.get('customers').query(Q.where('code', customerCode)).fetch();
        if (custs.length > 0) {
          const c = custs[0];
          setProspectName(c.name || customerName);
          setLegalName(c.name || customerName);
          setAliasName(c.name || customerName);
          setChannel(c.channelCode || '');
          setRegion(c.regionCode || '');
          setCity(c.cityCode || '');
          if (c.latitude) setGpsLat(parseFloat(c.latitude));
          if (c.longitude) setGpsLng(parseFloat(c.longitude));
        }
      } catch (e) { console.warn("[App]", e); }
      setLoading(false);
    })();
  }, [customerCode]);

  const handleUpdateLocation = async () => {
    setLocating(true);
    // Show the last-known (cached) fix INSTANTLY so the lat/lng don't sit blank
    // while the fresh GPS read runs — that read can take several seconds on
    // older handsets (Nokia etc.), which is why the coordinates appeared empty
    // for a while before showing. The fresh fix below refines it when it lands.
    const cached = getCachedPosition();
    if (cached) {
      setGpsLat(cached.lat);
      setGpsLng(cached.lng);
    }
    try {
      const pos = await getCurrentPosition();
      if (pos) {
        setGpsLat(pos.lat);
        setGpsLng(pos.lng);
      } else if (!cached) {
        Alert.alert('Location Error', 'Could not get your current location.');
      }
    } finally {
      setLocating(false);
    }
  };

  const handleSubmit = async () => {
    if (!prospectName.trim()) { Alert.alert('Required', 'Prospect Name is required.'); return; }
    setSaving(true);
    try {
      const custs: any[] = await database.get('customers').query(Q.where('code', customerCode)).fetch();
      if (custs.length > 0) {
        await database.write(async () => {
          await custs[0].update((rec: any) => {
            rec.name = prospectName.trim();
            rec.channelCode = channel;
            rec.regionCode = region;
            rec.cityCode = city;
            if (gpsLat) rec.latitude = gpsLat;
            if (gpsLng) rec.longitude = gpsLng;
          });
        });
      }
      Alert.alert('Success', 'Edit request submitted successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to save.');
    } finally { setSaving(false); }
  };

  const Dropdown = ({ label, value, options, field }: { label: string; value: string; options: string[]; field: string }) => (
    <View style={st.fieldBox}>
      <Text style={st.fieldLabel}>{label}</Text>
      <TouchableOpacity
        style={st.dropdown}
        onPress={() => setActiveDropdown(activeDropdown === field ? null : field)}
      >
        <Text style={[st.dropdownText, !value && { color: '#9CA3AF' }]}>{value || `Select ${label.replace(' *', '')}`}</Text>
        <Icon name="chevron-down" size={18} color="#6B7280" />
      </TouchableOpacity>
      {activeDropdown === field && (
        <View style={st.dropdownList}>
          {options.map(opt => (
            <TouchableOpacity key={opt} style={st.dropdownItem} onPress={() => {
              if (field === 'channel') setChannel(opt);
              else if (field === 'source') setSource(opt);
              else if (field === 'country') setCountry(opt);
              else if (field === 'region') setRegion(opt);
              else if (field === 'city') setCity(opt);
              setActiveDropdown(null);
            }}>
              <Text style={[st.dropdownItemText, opt === value && { color: '#1a56db', fontWeight: '700' }]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );

  if (loading) return <View style={st.center}><ActivityIndicator size="large" color="#1a56db" /></View>;

  return (
    <View style={st.container}>
      <ScrollView style={st.scroll} contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>
        {/* Basic Information */}
        <View style={st.section}>
          <View style={st.sectionHeader}>
            <Icon name="grid-outline" size={20} color="#1a56db" />
            <Text style={st.sectionTitle}>Basic Information <Text style={st.req}>*</Text></Text>
          </View>
          <View style={st.sectionDivider} />

          <View style={st.fieldBox}>
            <Text style={st.fieldLabel}>Prospect Name <Text style={st.req}>*</Text></Text>
            <TextInput style={st.input} value={prospectName} onChangeText={setProspectName} />
          </View>

          <View style={st.fieldBox}>
            <Text style={st.fieldLabel}>Outlet Name <Text style={st.req}>*</Text></Text>
            <TextInput style={st.input} value={outletName} onChangeText={setOutletName} placeholder="Enter outlet/shop name" placeholderTextColor="#9CA3AF" />
          </View>

          <View style={st.fieldBox}>
            <Text style={st.fieldLabel}>Legal Name</Text>
            <TextInput style={st.input} value={legalName} onChangeText={setLegalName} />
          </View>

          <View style={st.fieldBox}>
            <Text style={st.fieldLabel}>Alias / Short Name</Text>
            <TextInput style={st.input} value={aliasName} onChangeText={setAliasName} />
          </View>

          <View style={st.fieldBox}>
            <Text style={st.fieldLabel}>Store Group Type</Text>
            <View style={st.dropdown}>
              <Text style={st.dropdownText}>{storeGroupType}</Text>
              <Icon name="chevron-down" size={18} color="#6B7280" />
            </View>
          </View>

          <Dropdown label="Channel *" value={channel} options={CHANNELS} field="channel" />
          <Dropdown label="Source *" value={source} options={SOURCES} field="source" />

          <View style={st.fieldBox}>
            <Text style={st.fieldLabel}>Code</Text>
            <TextInput style={[st.input, { backgroundColor: '#F9FAFB' }]} value={code} editable={false} />
          </View>
        </View>

        {/* Location */}
        <View style={st.section}>
          <View style={st.sectionHeader}>
            <Icon name="location-outline" size={20} color="#1a56db" />
            <Text style={st.sectionTitle}>Location <Text style={st.req}>*</Text></Text>
          </View>
          <View style={st.sectionDivider} />

          <Dropdown label="Country *" value={country} options={COUNTRIES} field="country" />
          <Dropdown label="Region *" value={region} options={REGIONS} field="region" />
          <Dropdown label="City *" value={city} options={CITIES} field="city" />

          <View style={st.fieldBox}>
            <Text style={st.fieldLabel}>GPS Location</Text>
            <TouchableOpacity style={st.gpsBtn} onPress={handleUpdateLocation} disabled={locating}>
              {locating ? (
                <ActivityIndicator size="small" color="#16A34A" />
              ) : (
                <Icon name="location" size={20} color="#16A34A" />
              )}
              <Text style={st.gpsBtnText}>{locating ? 'Getting location…' : 'Update Location'}</Text>
            </TouchableOpacity>
            {gpsLat && gpsLng ? (
              <View style={st.coordsRow}>
                <Icon name="navigate" size={16} color="#1a56db" />
                <Text style={st.coordsText}>{gpsLat.toFixed(6)}, {gpsLng.toFixed(6)}</Text>
                {locating && <ActivityIndicator size="small" color="#1a56db" style={{ marginLeft: 8 }} />}
              </View>
            ) : locating ? (
              <View style={st.coordsRow}>
                <ActivityIndicator size="small" color="#1a56db" />
                <Text style={[st.coordsText, { color: '#6B7280' }]}>Getting current location…</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Additional Information */}
        <TouchableOpacity style={st.collapseSection} onPress={() => setShowAdditional(!showAdditional)}>
          <View style={st.collapseSectionLeft}>
            <Icon name="settings-outline" size={20} color="#1a56db" />
            <View>
              <Text style={st.sectionTitle}>Additional Information</Text>
              <Text style={st.sectionSub}>Order & delivery settings</Text>
            </View>
          </View>
          <Icon name={showAdditional ? 'chevron-up' : 'chevron-down'} size={20} color="#6B7280" />
        </TouchableOpacity>

        {/* Documents */}
        <TouchableOpacity style={st.collapseSection} onPress={() => setShowDocuments(!showDocuments)}>
          <View style={st.collapseSectionLeft}>
            <Icon name="document-outline" size={20} color="#1a56db" />
            <View>
              <Text style={st.sectionTitle}>Documents</Text>
              <Text style={st.sectionSub}>Upload required documents</Text>
            </View>
          </View>
          <Icon name={showDocuments ? 'chevron-up' : 'chevron-down'} size={20} color="#6B7280" />
        </TouchableOpacity>

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Submit Button */}
      <TouchableOpacity style={st.submitBtn} onPress={handleSubmit} activeOpacity={0.8} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : (
          <>
            <Icon name="checkmark-circle" size={22} color="#fff" />
            <Text style={st.submitText}>Submit Edit Request</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F4FF' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 20 },

  section: {
    backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, marginBottom: 16,
    ...Platform.select({ android: { elevation: 2 }, ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 } }),
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  sectionSub: { fontSize: 12, color: '#9CA3AF', marginTop: 1 },
  sectionDivider: { height: 2, backgroundColor: '#1a56db', borderRadius: 1, marginBottom: 16 },
  req: { color: '#EF4444', fontSize: 14 },

  fieldBox: { marginBottom: 16 },
  fieldLabel: { fontSize: 13, color: '#6B7280', marginBottom: 6, fontWeight: '500' },
  input: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14,
    paddingVertical: 12, fontSize: 15, color: '#111827', backgroundColor: '#FFFFFF',
  },
  dropdown: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14,
    paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  dropdownText: { fontSize: 15, color: '#111827' },
  dropdownList: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, marginTop: 4,
    backgroundColor: '#FFFFFF', overflow: 'hidden',
  },
  dropdownItem: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  dropdownItemText: { fontSize: 14, color: '#374151' },

  gpsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderColor: '#16A34A', borderRadius: 10, paddingVertical: 14,
    backgroundColor: '#F0FDF4',
  },
  gpsBtnText: { fontSize: 15, fontWeight: '600', color: '#16A34A' },
  coordsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  coordsText: { fontSize: 14, color: '#374151', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  collapseSection: {
    backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, marginBottom: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    ...Platform.select({ android: { elevation: 1 }, ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 } }),
  },
  collapseSectionLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#1a3a8f', marginHorizontal: 16, marginBottom: Platform.OS === 'ios' ? 32 : 16,
    borderRadius: 12, height: 54,
    ...Platform.select({ android: { elevation: 4 }, ios: { shadowColor: '#1a3a8f', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 } }),
  },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
