import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { ui, Button } from './common';
import { parkingApi, Facility } from '../../api/parking';
import { BRAND, VEHICLE_TYPES, VehicleType } from '../../config';
import useDriverAuth from '../../store/driverAuth';

function pad(n: number) { return n < 10 ? `0${n}` : String(n); }
function fmtLocal(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ReserveScreen({ route, navigation }: any) {
  const facilityId: number = route.params.facilityId;
  const user = useDriverAuth((s) => s.user);
  const [f, setF] = useState<Facility | null>(null);
  const [plate, setPlate] = useState(user?.primary_plate || '');
  const [vtype, setVtype] = useState<VehicleType>((user?.primary_type as VehicleType) || 'Car');
  const [hours, setHours] = useState('2');

  useEffect(() => { parkingApi.facility(facilityId).then(setF).catch(() => {}); }, [facilityId]);

  if (!f) return <View style={[ui.screen, ui.pad]}><Text style={ui.muted}>Loading…</Text></View>;

  const hrs = Math.max(1, parseInt(hours, 10) || 0);
  const tariff = f.tariffs[vtype];
  const rate = tariff?.rate || 0;
  const cap = tariff?.dailyCap || 0;
  const estimate = cap > 0 && hrs * rate > cap ? cap : hrs * rate;

  const onProceed = () => {
    if (!plate.trim()) { Alert.alert('Missing plate', 'Enter the vehicle plate.'); return; }
    if (hrs < 1) { Alert.alert('Invalid duration', 'At least 1 hour.'); return; }
    const start = new Date();
    start.setMinutes(start.getMinutes() + 5);  // grace 5 minutes
    const end = new Date(start.getTime() + hrs * 60 * 60 * 1000);
    navigation.navigate('Payment', {
      reservationDraft: {
        yard: f.name,
        vehicle_plate: plate.trim().toUpperCase(),
        vehicle_type: vtype,
        start_at: fmtLocal(start),
        end_at: fmtLocal(end),
        amount: estimate,
        facility_label: f.name,
        hours: hrs,
      },
    });
  };

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.pad}>
      <View style={ui.card}>
        <Text style={ui.h2}>{f.name}</Text>
        <Text style={ui.muted}>{f.location}</Text>
      </View>

      <View style={ui.card}>
        <Text style={ui.label}>Vehicle Plate</Text>
        <TextInput style={ui.input} value={plate} onChangeText={setPlate}
          autoCapitalize="characters" placeholder="AP 12 AB 1234"
          placeholderTextColor={BRAND.muted} />

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

        <Text style={ui.label}>Duration (hours)</Text>
        <TextInput style={ui.input} value={hours} onChangeText={setHours}
          keyboardType="numeric" placeholder="2" placeholderTextColor={BRAND.muted} />
      </View>

      <View style={ui.card}>
        <Text style={ui.h2}>Cost Estimate</Text>
        <View style={ui.spaceBetween}>
          <Text style={ui.body}>Rate</Text>
          <Text style={ui.h3}>₹{rate}/hr</Text>
        </View>
        <View style={[ui.spaceBetween, { marginTop: 6 }]}>
          <Text style={ui.body}>Hours</Text>
          <Text style={ui.h3}>{hrs}</Text>
        </View>
        {cap > 0 && (
          <View style={[ui.spaceBetween, { marginTop: 6 }]}>
            <Text style={ui.body}>Daily Cap</Text>
            <Text style={ui.h3}>₹{cap}</Text>
          </View>
        )}
        <View style={ui.divider} />
        <View style={ui.spaceBetween}>
          <Text style={ui.h2}>Total</Text>
          <Text style={[ui.h2, { color: BRAND.primary }]}>₹{estimate}</Text>
        </View>
      </View>

      <Button title="Proceed to Payment" onPress={onProceed} />
    </ScrollView>
  );
}
