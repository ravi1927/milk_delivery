import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Header from '../components/Header';
import { Field, PrimaryButton, SectionTitle } from '../components/Field';
import { ResponsiveContainer } from '../components/ResponsiveScreen';
import { useAuth } from '../context/AuthContext';
import * as s from '../services/store';
import { niceDate } from '../services/billing';
import { colors } from '../constants/theme';

const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function monthLabel(year, month) {
  return new Date(year, month, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function cellsFor(year, month) {
  const first = new Date(year, month, 1).getDay();
  const count = new Date(year, month + 1, 0).getDate();
  const cells = Array(first).fill(null);
  for (let day = 1; day <= count; day += 1) cells.push(day);
  while (cells.length % 7) cells.push(null);
  return cells;
}

function dateFor(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export default function CustomerProfile() {
  const { user } = useAuth();
  const today = s.dateKey();
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [customer, setCustomer] = useState(null);
  const [skips, setSkips] = useState([]);
  const [selected, setSelected] = useState(today);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [customers, skipRows] = await Promise.all([s.getCustomers(), s.getSkipRequests()]);
      const linked = customers.find((c) => String(c.id) === String(user?.customerRecordId));
      const mine = linked || (customers.length === 1 ? customers[0] : null);
      setCustomer(mine);
      setSkips(skipRows);
    } catch (e) { Alert.alert('Could not load profile', e.message); }
  };
  useFocusEffect(useCallback(() => { load(); }, [user?.customerRecordId]));

  const mySkips = useMemo(() => {
    const mine = String(user?.customerRecordId || customer?.id || '');
    const rows = mine ? skips.filter((row) => String(row.customerRecordId || '') === mine) : skips;
    return [...rows].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  }, [skips, user?.customerRecordId, customer?.id]);
  const skipByDate = useMemo(() => {
    const map = new Map();
    mySkips.forEach((row) => map.set(String(row.date || '').slice(0, 10), row));
    return map;
  }, [mySkips]);

  const shiftMonth = (amount) => {
    const next = new Date(cursor.year, cursor.month + amount, 1);
    setCursor({ year: next.getFullYear(), month: next.getMonth() });
  };

  const submit = async () => {
    if (busy) return;
    if (!selected || selected <= today) {
      Alert.alert('Choose a later date', s.SKIP_DATE_MESSAGE);
      return;
    }
    setBusy(true);
    try {
      await s.requestSkip({ date: selected, reason });
      setReason('');
      await load();
      Alert.alert('Skip sent', `${selected} is no longer a delivery day. The dairy has been alerted, and you will not be on the delivery route that morning.`);
    } catch (e) { Alert.alert('Could not skip', e.message); }
    finally { setBusy(false); }
  };

  const runUndo = async (row) => {
    setBusy(true);
    try {
      await s.undoSkip(row.id);
      await load();
      Alert.alert('Skip removed', `${String(row.date || '').slice(0, 10)} is a delivery day again.`);
    } catch (e) { Alert.alert('Could not undo', e.message); }
    finally { setBusy(false); }
  };

  const undo = (row) => {
    if (busy || !row) return;
    const day = String(row.date || '').slice(0, 10);
    if (!day || day <= today) {
      Alert.alert('Cannot undo', s.UNDO_SKIP_MESSAGE);
      return;
    }
    Alert.alert('Undo this skip?', `${day} goes back on the delivery route. The dairy will no longer see this skip.`, [
      { text: 'Keep skip', style: 'cancel' },
      { text: 'Undo', onPress: () => runUndo(row) },
    ]);
  };

  const selectedSkip = skipByDate.get(selected);
  const cells = cellsFor(cursor.year, cursor.month);

  const skipForm = (
    <View style={styles.card}>
      <Text style={styles.selectedLabel}>{selected}</Text>
      <Text style={styles.hint}>{s.SKIP_DATE_MESSAGE}</Text>
      {selectedSkip ? (
        <>
          <Text style={styles.line}>Already skipped. Reason: {selectedSkip.reason}</Text>
          {selected > today ? (
            <PrimaryButton title={busy ? 'Undoing...' : 'Undo skip'} secondary onPress={() => undo(selectedSkip)} disabled={busy} />
          ) : (
            <Text style={styles.locked}>{s.UNDO_SKIP_MESSAGE}</Text>
          )}
        </>
      ) : (
        <>
          <Field label="Reason for skipping this date" value={reason} onChangeText={setReason} placeholder="Example: Out of town" multiline inputStyle={styles.reasonInput} />
          <PrimaryButton title={busy ? 'Sending...' : 'Submit skip'} onPress={submit} disabled={busy || !reason.trim()} />
        </>
      )}
    </View>
  );

  return (
    <ResponsiveContainer avoidKeyboard footer={skipForm}>
      <Header title="My profile" subtitle="Read only" />
      <View style={styles.card}>
        <Text style={styles.name}>{customer?.name || user?.name || 'Customer'}</Text>
        <Text style={styles.line}>Phone: {customer?.phone || 'Not set'}</Text>
        <Text style={styles.line}>Address: {customer?.address || 'Not set'}</Text>
        <Text style={styles.line}>Milk: {customer?.milkQuantity || 'Not set'}</Text>
        <Text style={styles.line}>Rate: {customer ? `${s.money(customer.ratePerLitre)} per litre` : 'Not set'}</Text>
        <Text style={styles.note}>These details can only be changed by the dairy admin.</Text>
      </View>

      <SectionTitle title="Delivery calendar" subtitle="Every date is a delivery day unless you skip it. Choose a date, add a reason, and submit." />
      <View style={styles.monthRow}>
        <Pressable style={styles.monthBtn} onPress={() => shiftMonth(-1)}><Text style={styles.monthBtnText}>‹</Text></Pressable>
        <Text style={styles.month}>{monthLabel(cursor.year, cursor.month)}</Text>
        <Pressable style={styles.monthBtn} onPress={() => shiftMonth(1)}><Text style={styles.monthBtnText}>›</Text></Pressable>
      </View>
      <View style={styles.week}>{WEEK.map((label) => <Text key={label} style={styles.weekDay}>{label}</Text>)}</View>
      <View style={styles.grid}>
        {cells.map((day, index) => {
          if (!day) return <View key={`empty-${index}`} style={styles.cell} />;
          const date = dateFor(cursor.year, cursor.month, day);
          const skipped = skipByDate.has(date);
          const isSelected = date === selected;
          return (
            <Pressable key={date} style={[styles.cell, styles.day, skipped ? styles.skipped : styles.delivery, isSelected && styles.selected]} onPress={() => setSelected(date)}>
              <Text style={styles.dayNum}>{day}</Text>
              <Text style={styles.dayTag}>{skipped ? 'Skip' : 'Milk'}</Text>
            </Pressable>
          );
        })}
      </View>

      <SectionTitle title="Your skips" subtitle="Undo a future skip to put that morning back on the delivery route." />
      {!mySkips.length && <Text style={styles.empty}>You have not skipped any dates.</Text>}
      {mySkips.map((row) => {
        const day = String(row.date || '').slice(0, 10);
        const future = day > today;
        return (
          <View key={row.id || day} style={styles.skipRow}>
            <View style={styles.skipCopy}>
              <Text style={styles.skipDate}>{/^\d{4}-\d{2}-\d{2}$/.test(day) ? niceDate(day) : day}</Text>
              <Text style={styles.line}>{row.reason || 'No reason given'}</Text>
              {!future && <Text style={styles.locked}>{s.UNDO_SKIP_MESSAGE}</Text>}
            </View>
            {future && (
              <Pressable style={styles.undo} onPress={() => undo(row)} disabled={busy} accessibilityRole="button" accessibilityLabel={`Undo skip for ${day}`}>
                <Text style={styles.undoText}>{busy ? '...' : 'Undo'}</Text>
              </Pressable>
            )}
          </View>
        );
      })}

    </ResponsiveContainer>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 17, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  name: { fontSize: 22, fontWeight: '900', color: colors.text },
  line: { color: colors.muted, marginTop: 8, lineHeight: 20 },
  note: { color: colors.primaryDark, marginTop: 12, fontSize: 12, fontWeight: '700' },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  month: { fontWeight: '900', color: colors.text, fontSize: 16 },
  monthBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.infoBg, alignItems: 'center', justifyContent: 'center' },
  monthBtnText: { fontSize: 22, color: colors.primaryDark, fontWeight: '900' },
  week: { flexDirection: 'row' },
  weekDay: { flex: 1, textAlign: 'center', color: colors.muted, fontSize: 11, fontWeight: '800', marginBottom: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.28%', minHeight: 52, padding: 2 },
  day: { borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  delivery: { backgroundColor: colors.successBg },
  skipped: { backgroundColor: colors.warningBg },
  dayNum: { fontWeight: '900', color: colors.text },
  dayTag: { fontSize: 9, fontWeight: '800', color: colors.muted, marginTop: 2 },
  selected: { borderColor: colors.primary, borderWidth: 2 },
  selectedLabel: { fontWeight: '900', color: colors.text, fontSize: 16 },
  hint: { color: colors.primaryDark, marginTop: 6, marginBottom: 8, fontSize: 12, fontWeight: '700', lineHeight: 18 },
  reasonInput: { maxHeight: 120 },
  empty: { color: colors.muted, marginBottom: 8 },
  skipRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  skipCopy: { flex: 1 },
  skipDate: { fontWeight: '900', color: colors.text, fontSize: 15 },
  locked: { color: colors.warning, marginTop: 6, fontSize: 12, fontWeight: '700', lineHeight: 18 },
  undo: { backgroundColor: colors.infoBg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  undoText: { color: colors.primaryDark, fontWeight: '900', fontSize: 13 },
});
