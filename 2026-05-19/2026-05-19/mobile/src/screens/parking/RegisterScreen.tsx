import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, KeyboardAvoidingView, Platform, Alert, TouchableOpacity } from 'react-native';
import { ui, Button } from './common';
import useDriverAuth from '../../store/driverAuth';
import { BRAND, VEHICLE_TYPES, VehicleType } from '../../config';

export default function RegisterScreen({ navigation }: any) {
  const register = useDriverAuth((s) => s.register);
  const [form, setForm] = useState({
    name: '', email: '', phone: '', password: '', primary_plate: '',
  });
  const [vtype, setVtype] = useState<VehicleType>('Car');
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (v: string) => setForm((s) => ({ ...s, [k]: v }));

  const onSubmit = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      Alert.alert('Missing fields', 'Name, email, and password are required.');
      return;
    }
    if (form.password.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }
    setBusy(true);
    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        password: form.password,
        primary_plate: form.primary_plate.trim().toUpperCase() || undefined,
        primary_type: vtype,
      });
    } catch (e: any) {
      Alert.alert('Sign up failed', e?.message || 'Could not create your account.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={ui.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={ui.card}>
          <Text style={ui.h2}>Create your account</Text>
          <Text style={[ui.muted, { marginBottom: 16 }]}>One-time signup — drives, books, pays.</Text>

          <Text style={ui.label}>Full Name</Text>
          <TextInput style={ui.input} value={form.name} onChangeText={set('name')} placeholder="Jane Driver" placeholderTextColor={BRAND.muted} />

          <Text style={ui.label}>Email</Text>
          <TextInput style={ui.input} value={form.email} onChangeText={set('email')}
            autoCapitalize="none" keyboardType="email-address"
            placeholder="you@example.com" placeholderTextColor={BRAND.muted} />

          <Text style={ui.label}>Phone</Text>
          <TextInput style={ui.input} value={form.phone} onChangeText={set('phone')}
            keyboardType="phone-pad" placeholder="+91 9xxxxxxxxx" placeholderTextColor={BRAND.muted} />

          <Text style={ui.label}>Password</Text>
          <TextInput style={ui.input} value={form.password} onChangeText={set('password')}
            secureTextEntry placeholder="min 6 characters" placeholderTextColor={BRAND.muted} />

          <Text style={ui.label}>Primary Number Plate</Text>
          <TextInput style={ui.input} value={form.primary_plate} onChangeText={set('primary_plate')}
            autoCapitalize="characters" placeholder="AP 12 AB 1234" placeholderTextColor={BRAND.muted} />

          <Text style={ui.label}>Vehicle Type</Text>
          <View style={[ui.row, { marginBottom: 16, gap: 8 }]}>
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

          <Button title="Create Account" onPress={onSubmit} loading={busy} />

          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 16, alignItems: 'center' }}>
            <Text style={{ color: BRAND.muted }}>Already have an account? Sign in</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
