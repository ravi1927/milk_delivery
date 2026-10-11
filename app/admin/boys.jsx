import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Header from '../../components/Header';
import { ResponsiveContainer, useResponsiveColumns } from '../../components/ResponsiveScreen';
import { SectionTitle, PrimaryButton, Field, SelectField } from '../../components/Field';
import SheetModal from '../../components/SheetModal';
import * as s from '../../services/store';
import { colors } from '../../constants/theme';

const emptyForm = { name: '', email: '', password: '', areaId: '' };

export default function Boys() {
  const [rows, setRows] = useState([]);
  const [areas, setAreas] = useState([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [pickArea, setPickArea] = useState(false);
  const cols = useResponsiveColumns(300);
  const r = useRouter();

  const load = async () => {
    try {
      const [u, a, c, lr] = await Promise.all([s.getUsers(), s.getAreas(), s.getCustomers(), s.getLeaveRequests()]);
      const today = s.dateKey();
      const areaList = (a || []).filter((x) => x && x.name && x.role !== 'delivery' && x.role !== 'admin' && !x.email);
      setAreas(areaList);
      setRows((u || []).filter((x) => String(x.role || '').toLowerCase() === 'delivery' && x.active !== false && x.active !== 0).map((x) => ({
        ...x,
        area: areaList.find((z) => String(z.id) === String(x.areaId)),
        count: (c || []).filter((z) => String(z.defaultBoyId) === String(x.id)).length,
        leave: (lr || []).find((q) => String(q.boyId) === String(x.id) && q.date === today),
      })));
    } catch (e) {
      console.warn(e);
      setRows([]);
    }
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  const close = () => {
    setModal(false);
    setPickArea(false);
    setBusy(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const open = (row = null) => {
    setPickArea(false);
    setBusy(false);
    setEditing(row);
    setForm(row
      ? { name: row.name || '', email: row.email || '', password: '', areaId: row.areaId || row.area?.id || '' }
      : { ...emptyForm, areaId: areas[0]?.id || '' });
    setModal(false);
    setTimeout(() => setModal(true), 40);
  };

  const save = async () => {
    if (!form.name.trim() || !form.email.trim()) return Alert.alert('Required', 'Name and email are required.');
    if (!form.areaId) return Alert.alert('Required', 'Select an area.');
    setBusy(true);
    try {
      if (editing) {
        await s.updateDeliveryBoy(editing.id, form);
        Alert.alert('Updated', 'Delivery boy details were saved. Only admin can change these.');
      } else {
        await s.createDeliveryBoy(form);
        Alert.alert('Delivery boy added', 'They can sign in with that email and password. Then assign customers from Assignments.');
      }
      close();
      await load();
    } catch (e) {
      Alert.alert(editing ? 'Could not update' : 'Could not add delivery boy', e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = (b) => Alert.alert(
    'Delete delivery boy?',
    `${b.name} will be removed from the team. Assigned customers become unassigned.`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await s.deleteDeliveryBoy(b.id);
            close();
            await load();
          } catch (e) {
            Alert.alert('Could not delete', e.message);
          }
        },
      },
    ],
  );

  return (
    <ResponsiveContainer onRefresh={load}>
      <Header title="Delivery Boys" subtitle="Admin can add, edit and delete boys. Boys cannot change their own profile." />
      <View style={styles.top}>
        <SectionTitle title="Delivery team" subtitle="Add, update or delete a boy here, then assign customers from Assignments." />
        <PrimaryButton title="+ Add Delivery Boy" onPress={() => open()} />
      </View>
      <View style={styles.grid}>
        {rows.length === 0 ? <Text style={styles.meta}>No delivery boys yet. Add one to start assignments.</Text> : rows.map((b) => (
          <View key={String(b.id)} style={[styles.card, { width: cols === 1 ? '100%' : cols === 2 ? '48%' : '31%' }]}>
            <View style={styles.cardTop}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{b.name?.charAt(0)}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{b.name}</Text>
                <Text style={styles.meta}>{b.email}</Text>
              </View>
            </View>
            <Text style={styles.line}>📍 {b.area?.name || 'No area'}</Text>
            <Text style={styles.line}>Permanent customers: {b.count}</Text>
            <View style={b.leave?.status === 'approved' ? styles.leave : b.leave?.status === 'pending' ? styles.pending : styles.available}>
              <Text style={b.leave?.status === 'approved' ? styles.leaveText : b.leave?.status === 'pending' ? styles.pendingText : styles.availableText}>
                {b.leave?.status === 'approved' ? 'ON APPROVED LEAVE' : b.leave?.status === 'pending' ? 'LEAVE REQUEST PENDING' : 'AVAILABLE'}
              </Text>
            </View>
            {b.leave?.reason ? <Text style={styles.reason}>Reason: {b.leave.reason}</Text> : null}
            <View style={styles.actions}>
              <Pressable style={styles.edit} onPress={() => open(b)}><Text style={styles.editText}>Edit</Text></Pressable>
              <Pressable style={styles.delete} onPress={() => remove(b)}><Text style={styles.deleteText}>Delete</Text></Pressable>
            </View>
          </View>
        ))}
      </View>
      <PrimaryButton title="Open Leave & Cover" onPress={() => r.push('/admin/leave')} />

      <SheetModal visible={modal} title={editing ? 'Update Delivery Boy' : 'Add Delivery Boy'} onClose={close}>
        <Field label="Full name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="Enter delivery boy name" />
        <Field label="Login email" value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} keyboardType="email-address" placeholder="boy@dhaara.com" />
        <Field
          label={editing ? 'New password (leave blank to keep current)' : 'Password (8+ characters)'}
          value={form.password}
          onChangeText={(v) => setForm({ ...form, password: v })}
          secureTextEntry
          placeholder={editing ? 'Optional' : 'Set a login password'}
        />
        <SelectField
          label="Area"
          valueLabel={areas.find((a) => String(a.id) === String(form.areaId))?.name}
          placeholder={areas.length ? 'Select area' : 'Add an area first'}
          onPress={() => {
            if (!areas.length) return Alert.alert('No areas', 'Create an area first, then add the delivery boy.');
            setPickArea((v) => !v);
          }}
        />
        {pickArea ? areas.map((a) => (
          <Pressable
            key={String(a.id)}
            style={[styles.option, String(a.id) === String(form.areaId) && styles.optionOn]}
            onPress={() => { setForm({ ...form, areaId: a.id }); setPickArea(false); }}
          >
            <Text style={styles.name}>{a.name}</Text>
          </Pressable>
        )) : null}
        <PrimaryButton title={busy ? 'Saving…' : (editing ? 'Update Delivery Boy' : 'Save Delivery Boy')} onPress={save} disabled={busy} />
        <PrimaryButton title="Cancel" secondary onPress={close} />
      </SheetModal>
    </ResponsiveContainer>
  );
}

const styles = StyleSheet.create({
  top: { marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  card: { backgroundColor: colors.card, borderRadius: 17, padding: 16, borderWidth: 1, borderColor: colors.border },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.infoBg, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontWeight: '900', color: colors.primaryDark },
  name: { fontSize: 17, fontWeight: '900', color: colors.text },
  meta: { color: colors.muted, fontSize: 12, marginTop: 5 },
  line: { color: colors.muted, fontSize: 13, marginTop: 7 },
  reason: { fontSize: 11, color: colors.muted, marginTop: 8, lineHeight: 16 },
  leave: { backgroundColor: colors.warningBg, padding: 8, borderRadius: 10, marginTop: 12, alignSelf: 'flex-start' },
  leaveText: { color: colors.warning, fontWeight: '900', fontSize: 10 },
  pending: { backgroundColor: '#FFF7E8', padding: 8, borderRadius: 10, marginTop: 12, alignSelf: 'flex-start' },
  pendingText: { color: colors.warning, fontWeight: '900', fontSize: 10 },
  available: { backgroundColor: colors.successBg, padding: 8, borderRadius: 10, marginTop: 12, alignSelf: 'flex-start' },
  availableText: { color: colors.success, fontWeight: '900', fontSize: 10 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  edit: { flex: 1, padding: 11, borderRadius: 10, backgroundColor: colors.infoBg, alignItems: 'center' },
  editText: { fontWeight: '900', color: colors.primaryDark },
  delete: { flex: 1, padding: 11, borderRadius: 10, backgroundColor: colors.dangerBg, alignItems: 'center' },
  deleteText: { fontWeight: '900', color: colors.danger },
  option: { backgroundColor: colors.card, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  optionOn: { borderColor: colors.primary, backgroundColor: '#F0F8FF' },
});
