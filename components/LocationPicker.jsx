import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import CustomerMap from './CustomerMap';
import { colors } from '../constants/theme';
import { geocodeAddress, nudge, parsePoint } from '../services/geo';

export default function LocationPicker({ address, areaName, latitude, longitude, onChange }) {
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const point = parsePoint(latitude, longitude);

  const find = async () => {
    setBusy('search');
    try {
      const hit = await geocodeAddress(address, areaName);
      onChange(hit);
      setNote(hit.label ? `Found: ${hit.label}. Move the pin onto the house if needed.` : 'Address found. Move the pin onto the house if needed.');
    } catch (error) {
      setNote('');
      Alert.alert('Address not found', error.message);
    } finally { setBusy(''); }
  };

  const here = async () => {
    setBusy('gps');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') throw new Error('Location permission was denied. Allow location, or drop the pin on the map.');
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const next = parsePoint(position.coords.latitude, position.coords.longitude);
      if (!next) throw new Error('Could not read a GPS position.');
      onChange(next);
      setNote('Pin set to your current location. Nudge it if the house is next door.');
    } catch (error) {
      Alert.alert('Location unavailable', error.message);
    } finally { setBusy(''); }
  };

  const move = (direction) => {
    const next = nudge(point, direction);
    onChange(next);
    setNote(point ? 'Pin moved about 80 metres.' : 'Pin started at Tirupati. Keep nudging, or search the address.');
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Delivery location</Text>
      <Text style={styles.hint}>The delivery boy sees this pin and can open directions. Search the address, use your location, tap the map, or nudge the pin onto the house.</Text>
      <CustomerMap
        interactive
        height={230}
        onPick={(next) => { onChange(next); setNote('Pin updated.'); }}
        points={point ? [{ ...point, title: address || 'Customer' }] : []}
      />
      <View style={styles.row}>
        <Pressable style={styles.action} onPress={find} disabled={!!busy}>
          {busy === 'search' ? <ActivityIndicator color={colors.primaryDark} /> : <Text style={styles.actionText}>Find address on map</Text>}
        </Pressable>
        <Pressable style={styles.action} onPress={here} disabled={!!busy}>
          {busy === 'gps' ? <ActivityIndicator color={colors.primaryDark} /> : <Text style={styles.actionText}>Use my location</Text>}
        </Pressable>
      </View>
      <View style={styles.nudgeRow}>
        {[['n', 'North'], ['s', 'South'], ['e', 'East'], ['w', 'West']].map(([direction, label]) => (
          <Pressable key={direction} style={styles.nudge} onPress={() => move(direction)}>
            <Text style={styles.nudgeText}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.pin}>{point ? `Pin ${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}` : 'No pin yet'}</Text>
      {!!note && <Text style={styles.note}>{note}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '800', color: colors.text, marginBottom: 6 },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8, marginTop: 8 },
  action: { flex: 1, minHeight: 44, backgroundColor: colors.infoBg, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  actionText: { color: colors.primaryDark, fontWeight: '900', fontSize: 12, textAlign: 'center' },
  nudgeRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  nudge: { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center' },
  nudgeText: { color: colors.text, fontWeight: '800', fontSize: 12 },
  pin: { color: colors.secondaryDark, fontWeight: '800', fontSize: 12, marginTop: 8 },
  note: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 4 },
});
