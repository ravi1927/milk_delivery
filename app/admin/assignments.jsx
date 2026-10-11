import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Header from '../../components/Header';
import { PrimaryButton, SectionTitle, SelectField } from '../../components/Field';
import { ResponsiveContainer } from '../../components/ResponsiveScreen';
import SheetModal from '../../components/SheetModal';
import * as s from '../../services/store';
import { colors } from '../../constants/theme';

export default function Assignments() {
  const [customers, setCustomers] = useState([]);
  const [boys, setBoys] = useState([]);
  const [areas, setAreas] = useState([]);
  const [areaId, setAreaId] = useState('');
  const [boyId, setBoyId] = useState('');
  const [selected, setSelected] = useState([]);
  const [picker, setPicker] = useState(null);

  const load = async () => {
    const [c, u, a] = await Promise.all([s.getCustomers(), s.getUsers(), s.getAreas()]);
    const areaList = (a || []).filter((x) => x && x.name && x.role !== 'delivery' && x.role !== 'admin' && !x.email);
    setCustomers((c || []).filter((x) => x.active !== false && x.active !== 0));
    setBoys((u || []).filter((x) => String(x.role || '').toLowerCase() === 'delivery' && x.active !== false && x.active !== 0));
    setAreas(areaList);
    setAreaId((prev) => prev || areaList[0]?.id || '');
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  const assigned = customers.filter((c) => c.defaultBoyId);
  const available = customers.filter((c) => !c.defaultBoyId && (!areaId || String(c.areaId) === String(areaId)));
  const assignedForArea = assigned.filter((c) => !areaId || String(c.areaId) === String(areaId));
  const boy = boys.find((b) => String(b.id) === String(boyId));
  const area = areas.find((a) => String(a.id) === String(areaId));
  const boysForArea = boys.filter((b) => !b.onLeave);

  const pickArea = (id) => {
    setAreaId(id);
    setBoyId('');
    setSelected([]);
    setPicker(null);
  };
  const pickBoy = (id) => {
    setBoyId(id);
    setPicker(null);
  };

  const toggle = (id) => setSelected((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const assign = async () => {
    if (!selected.length || !boyId) return Alert.alert('Complete assignment', 'Select customer(s) and a delivery boy.');
    try {
      await s.assignCustomers(selected, boyId);
      setSelected([]);
      await load();
      Alert.alert('Assigned', 'Customers are now permanently assigned to the selected delivery boy.');
    } catch (e) {
      Alert.alert('Assignment blocked', e.message);
    }
  };
  const unassign = (id) => Alert.alert('Unassign customer?', 'After unassigning, this customer becomes available for a new permanent assignment.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Unassign', style: 'destructive', onPress: async () => { await s.unassignCustomer(id); load(); } },
  ]);

  return (
    <ResponsiveContainer onRefresh={load}>
      <Header title="Assignments" subtitle="Permanent customer → delivery boy assignment" />
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>How assignment works</Text>
        <Text style={styles.noticeText}>A customer can have only one permanent delivery boy. If the boy is on leave, use Leave & Cover instead of changing this assignment.</Text>
      </View>

      <SectionTitle title="1. Existing assignments" subtitle={`${assignedForArea.length} assigned customer(s) in ${area?.name || 'selected area'}`} />
      {assignedForArea.map((c) => {
        const b = boys.find((x) => String(x.id) === String(c.defaultBoyId));
        return (
          <View key={c.id} style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{c.name}</Text>
              <Text style={styles.meta}>{area?.name || ''} • {c.milkQuantity} • {s.money(c.ratePerLitre)}/L</Text>
              <Text style={styles.boy}>Assigned to: {b?.name || 'Unknown'}</Text>
            </View>
            <Pressable style={styles.unassign} onPress={() => unassign(c.id)}><Text style={styles.unassignText}>Unassign</Text></Pressable>
          </View>
        );
      })}

      <SectionTitle title="2. Make a new permanent assignment" subtitle="Only unassigned customers appear below." />
      <SelectField label="Selected area" valueLabel={area?.name} placeholder="Select area" onPress={() => setPicker('area')} />
      <SelectField
        label="Delivery boy"
        valueLabel={boy?.name}
        placeholder={areaId ? 'Select available delivery boy' : 'Select an area first'}
        onPress={() => {
          if (!areaId) return Alert.alert('Select area first', 'Choose an area, then pick a delivery boy.');
          setPicker('boy');
        }}
      />

      {boy && (
        <View style={styles.selectedBoy}>
          <Text style={styles.boyTitle}>Selected boy</Text>
          <Text style={styles.name}>{boy.name}</Text>
          <Text style={styles.meta}>{(areas.find((a) => a.id === boy.areaId)?.name) || area?.name || 'No area'} • {boy.onLeave ? 'ON LEAVE' : 'Available'}</Text>
        </View>
      )}

      <Text style={styles.subheading}>Available customers</Text>
      {available.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No unassigned customers in this area</Text>
          <Text style={styles.meta}>Add a customer or unassign an existing permanent assignment first.</Text>
        </View>
      ) : available.map((c) => (
        <Pressable key={c.id} onPress={() => toggle(c.id)} style={[styles.card, selected.includes(c.id) && styles.selected]}>
          <View style={styles.check}><Text>{selected.includes(c.id) ? '✓' : ''}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{c.name}</Text>
            <Text style={styles.meta}>{c.phone} • {c.milkQuantity} • {s.money(c.ratePerLitre)}/L</Text>
          </View>
        </Pressable>
      ))}
      <PrimaryButton title={`Assign ${selected.length ? `${selected.length} customer(s)` : 'selected customers'}`} onPress={assign} disabled={!selected.length || !boyId} />

      <SheetModal visible={!!picker} title={picker === 'boy' ? 'Select delivery boy' : 'Select area'} onClose={() => setPicker(null)}>
        {picker === 'area' && areas.map((a) => (
          <Pressable key={String(a.id)} style={[styles.option, String(a.id) === String(areaId) && styles.optionOn]} onPress={() => pickArea(a.id)}>
            <Text style={styles.name}>{a.name}</Text>
          </Pressable>
        ))}
        {picker === 'boy' && (boysForArea.length === 0 ? (
          <Text style={styles.meta}>No delivery boys yet. Add a boy from Delivery Boys, then come back here.</Text>
        ) : boysForArea.map((b) => (
          <Pressable key={String(b.id)} style={[styles.option, String(b.id) === String(boyId) && styles.optionOn]} onPress={() => pickBoy(b.id)}>
            <Text style={styles.name}>{b.name}</Text>
            <Text style={styles.meta}>{b.email}{b.areaId ? ` • ${areas.find((x) => String(x.id) === String(b.areaId))?.name || 'Area'}` : ''}</Text>
          </Pressable>
        )))}
        <PrimaryButton title="Close" secondary onPress={() => setPicker(null)} />
      </SheetModal>
    </ResponsiveContainer>
  );
}

const styles = StyleSheet.create({
  notice: { backgroundColor: colors.infoBg, borderColor: '#B9DDF4', borderWidth: 1, borderRadius: 16, padding: 15 },
  noticeTitle: { fontWeight: '900', color: colors.primaryDark },
  noticeText: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  card: { backgroundColor: colors.card, borderRadius: 15, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center' },
  name: { fontWeight: '900', fontSize: 16, color: colors.text },
  meta: { fontSize: 12, color: colors.muted, marginTop: 4 },
  boy: { fontSize: 12, color: colors.secondaryDark, fontWeight: '800', marginTop: 6 },
  unassign: { padding: 9, borderRadius: 10, backgroundColor: colors.dangerBg },
  unassignText: { color: colors.danger, fontWeight: '800', fontSize: 12 },
  selectedBoy: { backgroundColor: colors.successBg, borderRadius: 14, padding: 14, marginBottom: 12 },
  boyTitle: { fontSize: 11, fontWeight: '900', color: colors.success, textTransform: 'uppercase' },
  subheading: { fontSize: 15, fontWeight: '900', color: colors.text, marginVertical: 10 },
  check: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: colors.primary, marginRight: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  selected: { borderColor: colors.primary, backgroundColor: '#F0F8FF' },
  empty: { backgroundColor: colors.card, borderRadius: 14, padding: 18, borderWidth: 1, borderColor: colors.border },
  emptyTitle: { fontWeight: '900', color: colors.text, marginBottom: 4 },
  option: { backgroundColor: colors.card, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  optionOn: { borderColor: colors.primary, backgroundColor: '#F0F8FF' },
});
