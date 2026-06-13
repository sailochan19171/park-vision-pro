import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, KeyboardAvoidingView, Platform, Alert, TouchableOpacity } from 'react-native';
import { ui, Button, Brand } from './common';
import useDriverAuth from '../../store/driverAuth';
import { BRAND } from '../../config';

export default function LoginScreen({ navigation }: any) {
  const login = useDriverAuth((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing fields', 'Enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (e: any) {
      Alert.alert('Sign in failed', e?.message || 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={ui.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
        <View style={{ marginBottom: 32 }}>
          <Brand size={36} />
        </View>
        <View style={ui.card}>
          <Text style={ui.h2}>Welcome back</Text>
          <Text style={[ui.muted, { marginBottom: 16 }]}>Sign in to find, book, and access parking.</Text>

          <Text style={ui.label}>Email</Text>
          <TextInput
            style={ui.input}
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholderTextColor={BRAND.muted}
          />

          <Text style={ui.label}>Password</Text>
          <TextInput
            style={ui.input}
            placeholder="Your password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholderTextColor={BRAND.muted}
          />

          <Button title="Sign In" onPress={onSubmit} loading={busy} />

          <TouchableOpacity onPress={() => navigation.navigate('Register')} style={{ marginTop: 16, alignItems: 'center' }}>
            <Text style={{ color: BRAND.primary, fontWeight: '600' }}>
              New here? <Text style={{ textDecorationLine: 'underline' }}>Create an account</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
