import React, { useEffect, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as store from '../services/store';
import Header from '../components/Header';
import { PrimaryButton, SectionTitle } from '../components/Field';
import { ResponsiveContainer } from '../components/ResponsiveScreen';
import CustomerMap from '../components/CustomerMap';
import { openDirections } from '../services/directions';
import { hasCoords } from '../services/geo';
import { colors } from '../constants/theme';

export default function Deliver() {
  const { id } = useLocalSearchParams();
  const r = useRouter();
  const [row, setRow] = useState();
  const [uri, setUri] = useState();
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      await store.ensureTodayRecords();
      const [d, c, a] = await Promise.all([store.getDeliveries(), store.getCustomers(), store.getAreas()]);
      const x = d.find((z) => String(z.id) === String(id));
      setRow(x ? { ...x, c: c.find((z) => String(z.id) === String(x.customerId)), a: a.find((z) => String(z.id) === String(x.areaId)) } : null);
    } catch (e) { Alert.alert('Could not load delivery', e.message); }
  };
  useEffect(() => { load(); }, [id]);

  const photo = async (camera) => {
    if (camera) {
      const p = await ImagePicker.requestCameraPermissionsAsync();
      if (!p.granted) return Alert.alert('Permission required', 'Camera permission is needed to take delivery proof.');
      const x = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: .8 });
      if (!x.canceled) setUri(x.assets[0].uri);
    } else {
      const x = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: .8 });
      if (!x.canceled) setUri(x.assets[0].uri);
    }
  };

  const submit = async () => {
    if (!uri) return Alert.alert('Proof required', 'Take or select a delivery image before submitting.');
    setBusy(true);
    try {
      await store.delivered(id, uri);
      Alert.alert('Delivery submitted', 'The customer is marked DELIVERED and the proof is saved for this daily record.', [{ text: 'OK', onPress: () => r.back() }]);
    } catch (e) { Alert.alert('Could not save delivery', e.message); }
    finally { setBusy(false); }
  };

  const navigate = () => openDirections({
    latitude: row?.c?.latitude,
    longitude: row?.c?.longitude,
    address: row?.c?.address,
    areaName: row?.a?.name,
    name: row?.c?.name,
  });

  if (!row) return <ResponsiveContainer><Header title="Delivery" back /><Text>Loading...</Text></ResponsiveContainer>;
  const pinned = hasCoords(row.c);
  return (
    <ResponsiveContainer>
      <Header title="Complete Delivery" subtitle={row.c?.name} back />
      <View style={styles.customer}>
        <Text style={styles.name}>{row.c?.name}</Text>
        <Text style={styles.meta}>{row.c?.phone}</Text>
        <Text style={styles.meta}>{row.c?.address}</Text>
        <View style={styles.pills}>
          <Text style={styles.pill}>🥛 {row.c?.milkQuantity}</Text>
          <Text style={styles.pill}>{store.money(row.c?.ratePerLitre)}/L</Text>
          <Text style={styles.pill}>{row.a?.name}</Text>
        </View>
      </View>
      <SectionTitle title="Customer location" subtitle={pinned ? 'Saved delivery pin. Open directions to navigate there.' : 'No map pin yet. Directions will search the written address.'} />
      {pinned && <CustomerMap height={240} points={[{ latitude: Number(row.c.latitude), longitude: Number(row.c.longitude), title: [row.c.name, row.c.address].filter(Boolean).join(' · ') }]} />}
      <PrimaryButton title="Open directions" secondary onPress={navigate} />
      <SectionTitle title="Delivery proof" subtitle="Take a clear image after handing over the milk." />
      {uri ? <Image source={{ uri }} style={styles.photo} /> : <View style={styles.placeholder}><Text style={styles.camera}>📷</Text><Text style={styles.placeholderText}>No proof image selected</Text></View>}
      <View style={styles.actions}>
        <Pressable style={styles.secondaryBtn} onPress={() => photo(true)}><Text style={styles.secondaryText}>📷 Take Photo</Text></Pressable>
        <Pressable style={styles.secondaryBtn} onPress={() => photo(false)}><Text style={styles.secondaryText}>🖼 Gallery</Text></Pressable>
      </View>
      <PrimaryButton title={busy ? 'Saving...' : 'Submit & Mark Delivered'} onPress={submit} disabled={busy || !uri} />
    </ResponsiveContainer>
  );
}

const styles = StyleSheet.create({
  customer: { backgroundColor: colors.card, borderRadius: 17, padding: 18, borderWidth: 1, borderColor: colors.border },
  name: { fontSize: 23, fontWeight: '900', color: colors.text, flexShrink: 1 },
  meta: { color: colors.muted, marginTop: 6, flexShrink: 1 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  pill: { backgroundColor: colors.infoBg, color: colors.primaryDark, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, fontSize: 11, fontWeight: '800' },
  placeholder: { height: 270, borderRadius: 17, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  camera: { fontSize: 48 },
  placeholderText: { color: colors.muted, marginTop: 8 },
  photo: { width: '100%', height: 300, borderRadius: 17, backgroundColor: '#ddd' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginVertical: 12 },
  secondaryBtn: { flexGrow: 1, flexBasis: '46%', minWidth: 120, backgroundColor: colors.infoBg, borderRadius: 13, padding: 15, alignItems: 'center' },
  secondaryText: { color: colors.primaryDark, fontWeight: '900' },
});
