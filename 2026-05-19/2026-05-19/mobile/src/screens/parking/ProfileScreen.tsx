import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import { ui, Button, Brand } from './common';
import useDriverAuth from '../../store/driverAuth';
import useLive from '../../store/liveStore';
import { parkingApi } from '../../api/parking';
import { BRAND, VEHICLE_TYPES, VehicleType } from '../../config';

export default function ProfileScreen() {
  const user = useDriverAuth((s) => s.user);
  const setUser = useDriverAuth((s) => s.setUser);
  const logout = useDriverAuth((s) => s.logout);
  const liveUser = useLive((s) => s.snapshot?.user);

  // Mirror admin-pushed profile changes back into the auth store within ~5s.
  useEffect(() => {
    if (!liveUser || !user) return;
    if (JSON.stringify(liveUser) !== JSON.stringify(user)) setUser(liveUser);
  }, [liveUser, user, setUser]);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    primary_plate: user?.primary_plate || '',
    fastag_id: user?.fastag_id || '',
    password: '',
  });
  const [vtype, setVtype] = useState<VehicleType>((user?.primary_type as VehicleType) || 'Car');
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  const set = (k: keyof typeof form) => (v: string) => setForm((s) => ({ ...s, [k]: v }));

  const onSave = async () => {
    setBusy(true);
    try {
      const updated = await parkingApi.updateMe({
        name: form.name.trim(),
        phone: form.phone.trim(),
        primary_plate: form.primary_plate.trim().toUpperCase(),
        primary_type: vtype,
        fastag_id: form.fastag_id.trim(),
        ...(form.password ? { password: form.password } : {}),
      } as any);
      setUser(updated);
      setForm((s) => ({ ...s, password: '' }));
      setEditing(false);
    } catch (e: any) {
      Alert.alert('Could not save', e?.message || 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.pad}>
      <View style={[ui.card, { alignItems: 'center' }]}>
        <Brand size={28} />
        <Text style={[ui.h2, { marginTop: 12 }]}>{user.name}</Text>
        <Text style={ui.muted}>{user.email}</Text>
      </View>

      <View style={ui.card}>
        <View style={ui.spaceBetween}>
          <Text style={ui.h2}>Account</Text>
          <TouchableOpacity onPress={() => setEditing((v) => !v)}>
            <Text style={{ color: BRAND.primary, fontWeight: '700' }}>{editing ? 'Cancel' : 'Edit'}</Text>
          </TouchableOpacity>
        </View>

        {editing ? (
          <>
            <Text style={[ui.label, { marginTop: 8 }]}>Name</Text>
            <TextInput style={ui.input} value={form.name} onChangeText={set('name')} placeholderTextColor={BRAND.muted} />

            <Text style={ui.label}>Phone</Text>
            <TextInput style={ui.input} value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" placeholderTextColor={BRAND.muted} />

            <Text style={ui.label}>Primary Plate</Text>
            <TextInput style={ui.input} value={form.primary_plate} onChangeText={set('primary_plate')}
              autoCapitalize="characters" placeholderTextColor={BRAND.muted} />

            <Text style={ui.label}>Vehicle Type</Text>
            <View style={[ui.row, { marginBottom: 12, gap: 8 }]}>
              {VEHICLE_TYPES.map((t) => (
                <TouchableOpacity key={t} onPress={() => setVtype(t)}
                  style={{
                    flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center',
                    borderWidth: 1, borderColor: vtype === t ? BRAND.primary : BRAND.border,
                    backgroundColor: vtype === t ? BRAND.primary : '#fff',
                  }}>
                  <Text style={{ color: vtype === t ? '#fff' : BRAND.text, fontWeight: '700' }}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={ui.label}>FASTag ID</Text>
            <TextInput style={ui.input} value={form.fastag_id} onChangeText={set('fastag_id')} placeholderTextColor={BRAND.muted} />

            <Text style={ui.label}>New Password (optional)</Text>
            <TextInput style={ui.input} value={form.password} onChangeText={set('password')}
              secureTextEntry placeholder="leave blank to keep current" placeholderTextColor={BRAND.muted} />

            <Button title="Save Changes" onPress={onSave} loading={busy} />
          </>
        ) : (
          <>
            <Row label="Name"     value={user.name} />
            <Row label="Email"    value={user.email} />
            <Row label="Phone"    value={user.phone || '—'} />
            <Row label="Plate"    value={user.primary_plate || '—'} />
            <Row label="Vehicle"  value={user.primary_type || 'Car'} />
            <Row label="FASTag"   value={user.fastag_id || '—'} />
          </>
        )}
      </View>

      <Button title="Sign Out" kind="danger" onPress={() => logout()} />
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={[ui.spaceBetween, { paddingVertical: 6 }]}>
      <Text style={ui.muted}>{label}</Text>
      <Text style={ui.h3}>{value}</Text>
    </View>
  );
}
