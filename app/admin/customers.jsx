import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Header from '../../components/Header';
import { Field, PrimaryButton, SelectField, SectionTitle } from '../../components/Field';
import { ResponsiveContainer, useResponsiveColumns } from '../../components/ResponsiveScreen';
import SheetModal from '../../components/SheetModal';
import LocationPicker from '../../components/LocationPicker';
import { normalizePhone } from '../../services/billing';
import { geocodeAddress, hasCoords, parsePoint } from '../../services/geo';
import * as s from '../../services/store';
import { colors } from '../../constants/theme';

const emptyForm = (areaId = '') => ({ name: '', phone: '', address: '', areaId, milkQuantity: '1 L', ratePerLitre: '60', latitude: null, longitude: null, email: '', password: '' });

export default function Customers() {
  const [rows, setRows] = useState([]);
  const [areas, setAreas] = useState([]);
  const [users, setUsers] = useState([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [busy, setBusy] = useState(false);
  const cols = useResponsiveColumns(300);

  const load = async () => {
    try {
      const [c, a, u] = await Promise.all([s.getCustomers(), s.getAreas(), s.getUsers()]);
      setAreas(a);
      setUsers(u);
      setRows(c.filter((x) => x.active !== false && x.active !== 0 && x.active !== '0').map((x) => ({ ...x, area: a.find((z) => String(z.id) === String(x.areaId)), boy: u.find((z) => String(z.id) === String(x.defaultBoyId)) })));
    } catch (e) { Alert.alert('Could not load customers', e.message); }
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  const loginFor = (row) => users.find((u) => u.role === 'customer' && String(u.customerRecordId) === String(row?.id) && u.active !== false && u.active !== 0 && u.active !== '0');
  const open = (row = null) => {
    setEditing(row);
    setForm(row ? {
      name: row.name,
      phone: row.phone || '',
      address: row.address || '',
      areaId: row.areaId || '',
      milkQuantity: row.milkQuantity || '1 L',
      ratePerLitre: String(row.ratePerLitre || 60),
      latitude: row.latitude ?? null,
      longitude: row.longitude ?? null,
      email: loginFor(row)?.email || '',
      password: '',
    } : emptyForm(areas[0]?.id || ''));
    setModal(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.areaId || !form.ratePerLitre) return Alert.alert('Required', 'Name, area and rate per litre are required.');
    if (form.phone.trim() && !normalizePhone(form.phone)) return Alert.alert('Mobile number', 'Enter a valid 10-digit mobile number. It is used to send the WhatsApp bill.');
    setBusy(true);
    try {
      let latitude = form.latitude;
      let longitude = form.longitude;
      if (!parsePoint(latitude, longitude)) {
        try {
          const hit = await geocodeAddress(form.address, areas.find((a) => a.id === form.areaId)?.name);
          latitude = hit.latitude;
          longitude = hit.longitude;
          setForm((current) => ({ ...current, latitude, longitude }));
        } catch (error) {
          Alert.alert('Location needed', error.message || 'Set a map pin so the delivery boy can navigate to this customer.');
          return;
        }
      }
      const saved = await s.saveCustomer({ ...form, name: form.name.trim(), address: String(form.address || '').trim(), latitude, longitude }, editing?.id);
      setModal(false);
      await load();
      if (saved?.loginWarning) Alert.alert('Customer saved', saved.loginWarning);
    } catch (error) {
      Alert.alert('Could not save', error.message || 'Try again.');
    } finally { setBusy(false); }
  };

  const remove = (id) => Alert.alert('Delete customer?', 'The customer is removed from daily delivery lists. Past records and bills are kept, and you can still create a final bill from Billing.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { await s.deleteCustomer(id); load(); } },
  ]);

  const areaName = areas.find((a) => a.id === form.areaId)?.name;

  return (
    <ResponsiveContainer>
      <Header title="Customers" subtitle={`${rows.length} customer${rows.length === 1 ? '' : 's'}`} />
      <View style={styles.top}>
        <SectionTitle title="Customer management" subtitle="Add, update, view and delete customers. Each customer has an individual milk rate per litre and a map pin for delivery." />
        <PrimaryButton title="+ Add Customer" onPress={() => open()} />
      </View>
      <View style={styles.grid}>
        {rows.map((c) => (
          <View key={c.id} style={[styles.card, { width: cols === 1 ? '100%' : cols === 2 ? '48%' : '31%' }]}>
            <View style={styles.cardTop}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{c.name?.charAt(0) || 'C'}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{c.name}</Text>
                <Text style={styles.meta}>{c.phone || 'No mobile'}</Text>
              </View>
            </View>
            <Text style={styles.line}>📍 {c.area?.name || 'No area'}</Text>
            {!!c.address && <Text style={styles.line}>{c.address}</Text>}
            <Text style={styles.line}>{hasCoords(c) ? '🗺 Map pin saved' : '🗺 No map pin yet'}</Text>
            <Text style={styles.line}>🥛 {c.milkQuantity} • <Text style={styles.rate}>{s.money(c.ratePerLitre)}/L</Text></Text>
            <Text style={styles.line}>🛵 {c.boy?.name || 'Not assigned'}</Text>
            <Text style={styles.line}>✉ {loginFor(c)?.email || 'No customer login'}</Text>
            <View style={styles.actions}>
              <Pressable style={styles.edit} onPress={() => open(c)}><Text style={styles.editText}>Edit</Text></Pressable>
              <Pressable style={styles.delete} onPress={() => remove(c.id)}><Text style={styles.deleteText}>Delete</Text></Pressable>
            </View>
          </View>
        ))}
      </View>
      <SheetModal visible={modal} title={editing ? 'Update Customer' : 'Add Customer'} onClose={() => setModal(false)}>
        <Field label="Customer name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="Enter customer name" />
        <Field label="Mobile number" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} keyboardType="phone-pad" placeholder="10 digit mobile" />
        <Field label="Address" value={form.address} onChangeText={(v) => setForm({ ...form, address: v })} placeholder="House / street / landmark" multiline />
        <SelectField label="Area" valueLabel={areaName} onPress={() => Alert.alert('Select area', areas.map((a) => a.name).join('\n'), areas.map((a) => ({ text: a.name, onPress: () => setForm({ ...form, areaId: a.id }) })))} />
        <LocationPicker
          address={form.address}
          areaName={areaName}
          latitude={form.latitude}
          longitude={form.longitude}
          onChange={(point) => setForm((current) => ({ ...current, latitude: point.latitude, longitude: point.longitude }))}
        />
        <Field label="Daily milk quantity" value={form.milkQuantity} onChangeText={(v) => setForm({ ...form, milkQuantity: v })} placeholder="Example: 1 L / 500 ml" />
        <Field label="Rate per litre (₹)" value={form.ratePerLitre} onChangeText={(v) => setForm({ ...form, ratePerLitre: v.replace(/[^0-9.]/g, '') })} keyboardType="decimal-pad" placeholder="60" />
        <Field label="Login email (optional)" value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} keyboardType="email-address" autoComplete="off" textContentType="none" importantForAutofill="no" placeholder="Leave blank to save without a login" />
        <Field label="Login password (optional)" value={form.password} onChangeText={(v) => setForm({ ...form, password: v })} secureTextEntry autoComplete="off" textContentType="none" importantForAutofill="no" placeholder="Leave blank to save without a login" />
        <PrimaryButton title={busy ? 'Saving...' : editing ? 'Update Customer' : 'Save Customer'} onPress={save} disabled={busy} />
        <PrimaryButton title="Cancel" secondary onPress={() => setModal(false)} />
      </SheetModal>
    </ResponsiveContainer>
  );
}

const styles = StyleSheet.create({
  top: { marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { backgroundColor: colors.card, borderRadius: 17, padding: 16, borderWidth: 1, borderColor: colors.border, minWidth: 0, maxWidth: '100%' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.infoBg, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontWeight: '900', color: colors.primary },
  name: { fontSize: 17, fontWeight: '900', color: colors.text, flexShrink: 1 },
  meta: { color: colors.muted, fontSize: 12, marginTop: 3 },
  line: { color: colors.muted, fontSize: 13, marginTop: 7 },
  rate: { fontWeight: '900', color: colors.secondaryDark },
  actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  edit: { flex: 1, padding: 11, borderRadius: 10, backgroundColor: colors.infoBg, alignItems: 'center' },
  editText: { fontWeight: '900', color: colors.primaryDark },
  delete: { flex: 1, padding: 11, borderRadius: 10, backgroundColor: colors.dangerBg, alignItems: 'center' },
  deleteText: { fontWeight: '900', color: colors.danger },
});
