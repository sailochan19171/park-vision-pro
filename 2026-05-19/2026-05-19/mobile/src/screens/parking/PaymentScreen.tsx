import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import { ui, Button } from './common';
import { parkingApi } from '../../api/parking';
import { BRAND, PAYMENT_METHODS, PaymentMethod } from '../../config';

export default function PaymentScreen({ route, navigation }: any) {
  const draft = route.params.reservationDraft;
  const [method, setMethod] = useState<PaymentMethod>('PhonePe');
  const [upiId, setUpiId] = useState('');
  const [txnId, setTxnId] = useState('');
  const [busy, setBusy] = useState(false);

  const onConfirm = async () => {
    if (method !== 'Cash' && method !== 'FASTag' && method !== 'Card' && !upiId.trim()) {
      Alert.alert('UPI ID required', 'Enter the UPI ID you paid from.');
      return;
    }
    if (method !== 'Cash' && method !== 'FASTag' && !txnId.trim()) {
      Alert.alert('Transaction ID required', 'Enter the transaction ID (8–30 alphanumeric).');
      return;
    }
    if (txnId && !/^[A-Za-z0-9]{8,30}$/.test(txnId.trim())) {
      Alert.alert('Invalid transaction ID', 'Use 8–30 alphanumeric characters.');
      return;
    }
    setBusy(true);
    try {
      const reservation = await parkingApi.reserve({
        yard: draft.yard,
        vehicle_plate: draft.vehicle_plate,
        vehicle_type: draft.vehicle_type,
        start_at: draft.start_at,
        end_at: draft.end_at,
        amount: draft.amount,
        payment_method: method,
        upi_id: upiId.trim() || undefined,
        transaction_id: txnId.trim() || undefined,
      });
      navigation.reset({
        index: 1,
        routes: [
          { name: 'MainTabs' },
          { name: 'ReservationDetail', params: { reservation } },
        ],
      });
    } catch (e: any) {
      Alert.alert('Payment failed', e?.message || 'Could not confirm the booking.');
    } finally {
      setBusy(false);
    }
  };

  const upiless = method === 'Cash' || method === 'FASTag' || method === 'Card';

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.pad}>
      <View style={ui.card}>
        <Text style={ui.h2}>Order Summary</Text>
        <View style={[ui.spaceBetween, { marginTop: 8 }]}>
          <Text style={ui.body}>Facility</Text>
          <Text style={ui.h3}>{draft.facility_label}</Text>
        </View>
        <View style={[ui.spaceBetween, { marginTop: 4 }]}>
          <Text style={ui.body}>Plate</Text>
          <Text style={ui.h3}>{draft.vehicle_plate}</Text>
        </View>
        <View style={[ui.spaceBetween, { marginTop: 4 }]}>
          <Text style={ui.body}>Window</Text>
          <Text style={ui.h3}>{draft.start_at.slice(11)} → {draft.end_at.slice(11)}</Text>
        </View>
        <View style={ui.divider} />
        <View style={ui.spaceBetween}>
          <Text style={ui.h2}>Total</Text>
          <Text style={[ui.h2, { color: BRAND.primary }]}>₹{draft.amount}</Text>
        </View>
      </View>

      <View style={ui.card}>
        <Text style={ui.h2}>Payment Method</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 8 }}>
          {PAYMENT_METHODS.map((m) => (
            <TouchableOpacity key={m} onPress={() => setMethod(m)}
              style={{
                paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8,
                borderWidth: 1, borderColor: method === m ? BRAND.primary : BRAND.border,
                backgroundColor: method === m ? BRAND.primary : '#fff',
              }}>
              <Text style={{ color: method === m ? '#fff' : BRAND.text, fontWeight: '700' }}>{m}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {!upiless && (
          <>
            <Text style={[ui.label, { marginTop: 16 }]}>UPI ID</Text>
            <TextInput style={ui.input} value={upiId} onChangeText={setUpiId}
              autoCapitalize="none" placeholder="yourname@ybl"
              placeholderTextColor={BRAND.muted} />
          </>
        )}
        {method !== 'Cash' && method !== 'FASTag' && (
          <>
            <Text style={ui.label}>Transaction ID</Text>
            <TextInput style={ui.input} value={txnId} onChangeText={setTxnId}
              autoCapitalize="characters" placeholder="8–30 alphanumeric"
              placeholderTextColor={BRAND.muted} />
          </>
        )}
      </View>

      <Button title={`Pay ₹${draft.amount} · Confirm Booking`} onPress={onConfirm} loading={busy} />
    </ScrollView>
  );
}
