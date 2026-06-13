import React, { useState } from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { ui, Button, Tag } from './common';
import { parkingApi, Reservation } from '../../api/parking';
import { BRAND } from '../../config';

export default function ReservationDetailScreen({ route, navigation }: any) {
  const initial: Reservation = route.params.reservation;
  const [r, setR] = useState<Reservation>(initial);
  const [busy, setBusy] = useState(false);

  const onCancel = () => {
    Alert.alert('Cancel reservation?', 'Refund policy depends on facility rules.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel booking',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            const updated = await parkingApi.cancel(r.id);
            setR(updated);
          } catch (e: any) {
            Alert.alert('Could not cancel', e?.message || 'Try again.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const tone: 'success' | 'warning' | 'danger' | 'neutral' =
    r.status === 'confirmed' ? 'success'
    : r.status === 'cancelled' ? 'danger'
    : r.status === 'consumed' ? 'neutral'
    : 'warning';

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.pad}>
      <View style={ui.card}>
        <View style={ui.spaceBetween}>
          <Text style={ui.h2}>Reservation</Text>
          <Tag text={r.status.toUpperCase()} tone={tone} />
        </View>
        <View style={[ui.spaceBetween, { marginTop: 10 }]}>
          <Text style={ui.body}>Facility</Text><Text style={ui.h3}>{r.yard}</Text>
        </View>
        <View style={[ui.spaceBetween, { marginTop: 6 }]}>
          <Text style={ui.body}>Plate</Text><Text style={ui.h3}>{r.vehicle_plate}</Text>
        </View>
        <View style={[ui.spaceBetween, { marginTop: 6 }]}>
          <Text style={ui.body}>Vehicle</Text><Text style={ui.h3}>{r.vehicle_type}</Text>
        </View>
        <View style={[ui.spaceBetween, { marginTop: 6 }]}>
          <Text style={ui.body}>Window</Text>
          <Text style={ui.h3}>{r.start_at} → {r.end_at}</Text>
        </View>
        <View style={ui.divider} />
        <View style={ui.spaceBetween}>
          <Text style={ui.h2}>Amount</Text>
          <Text style={[ui.h2, { color: BRAND.primary }]}>₹{r.amount}</Text>
        </View>
        <View style={[ui.spaceBetween, { marginTop: 6 }]}>
          <Text style={ui.body}>Paid via</Text>
          <Text style={ui.h3}>{r.payment_method || '—'}</Text>
        </View>
        <View style={[ui.spaceBetween, { marginTop: 4 }]}>
          <Text style={ui.body}>Txn ID</Text>
          <Text style={ui.h3}>{r.transaction_id || '—'}</Text>
        </View>
      </View>

      {r.status === 'confirmed' && (
        <>
          <Button title="Show Entry QR" onPress={() => navigation.navigate('QRPass')} />
          <View style={{ height: 8 }} />
          <Button title="Cancel Reservation" onPress={onCancel} kind="danger" loading={busy} />
        </>
      )}
    </ScrollView>
  );
}
