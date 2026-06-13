import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Alert, ActivityIndicator, Image } from 'react-native';
import { ui, Tag, Empty } from './common';
import { parkingApi, Reservation } from '../../api/parking';
import { API_BASE_URL, BRAND } from '../../config';

export default function QRPassScreen() {
  const [data, setData] = useState<{ reservation: Reservation; token: string; pass_url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    parkingApi.qrPass()
      .then(setData)
      .catch((e) => setError(e?.message || 'No active reservation.'));
  }, []);

  if (error) {
    return (
      <View style={ui.screen}>
        <Empty text={error} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[ui.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={BRAND.primary} />
      </View>
    );
  }

  // Hot-link Google's chart API for a quick QR — no native lib required.
  // Encodes the same signed pass URL the gate kiosk verifies via /v/<token>.
  const qrUrl =
    `https://chart.googleapis.com/chart?cht=qr&chs=300x300&chl=${encodeURIComponent(data.pass_url)}`;

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.pad}>
      <View style={[ui.card, { alignItems: 'center' }]}>
        <Text style={ui.h2}>Entry QR Pass</Text>
        <Tag text={data.reservation.status.toUpperCase()} tone="success" />
        <Image
          source={{ uri: qrUrl }}
          style={{ width: 240, height: 240, marginTop: 16, marginBottom: 8 }}
          resizeMode="contain"
        />
        <Text style={ui.muted}>{data.reservation.yard}</Text>
        <Text style={ui.h3}>{data.reservation.vehicle_plate}</Text>
        <Text style={[ui.muted, { marginTop: 6 }]}>
          {data.reservation.start_at} → {data.reservation.end_at}
        </Text>
      </View>
      <View style={ui.card}>
        <Text style={ui.h3}>How to use</Text>
        <Text style={[ui.body, { marginTop: 8 }]}>
          Hold this screen up to the gate's QR scanner. The kiosk validates the signed pass against
          your reservation window and opens the boom.
        </Text>
      </View>
    </ScrollView>
  );
}
