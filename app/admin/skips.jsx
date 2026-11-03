import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Header from '../../components/Header';
import { SectionTitle } from '../../components/Field';
import { ResponsiveContainer } from '../../components/ResponsiveScreen';
import * as s from '../../services/store';
import { niceDate } from '../../services/billing';
import { colors } from '../../constants/theme';

const unseen = (row) => row.seen !== 1 && row.seen !== '1' && row.seen !== true;

function dateLabel(value) {
  const day = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return day || 'No date';
  return niceDate(day);
}

export default function SkipMessages() {
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);

  const load = async () => {
    try {
      const [skips, cs] = await Promise.all([s.getSkipRequests(), s.getCustomers()]);
      const sorted = [...skips].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      setRows(sorted);
      setCustomers(cs);
    } catch (e) { Alert.alert('Could not load skip messages', e.message); }
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  const nameFor = (row) => customers.find((c) => String(c.id) === String(row.customerRecordId))?.name || 'A customer';
  const ack = async (id) => {
    try { await s.acknowledgeSkip(id); await load(); }
    catch (e) { Alert.alert('Could not update the message', e.message); }
  };

  return (
    <ResponsiveContainer>
      <Header title="Skip messages" subtitle="Customer, date and reason" />
      <SectionTitle title="Customer skip messages" subtitle="Each message is a date that customer will not be on the delivery route." />
      {!rows.length && <Text style={styles.empty}>No skip messages yet.</Text>}
      {rows.map((row) => (
        <View key={row.id} style={styles.card}>
          <View style={styles.top}>
            <Text style={styles.name}>{nameFor(row)}</Text>
            {unseen(row) && <View style={styles.badge}><Text style={styles.badgeText}>New</Text></View>}
          </View>
          <Text style={styles.date}>{dateLabel(row.date)}</Text>
          <Text style={styles.reason}>{row.reason || 'No reason given'}</Text>
          {unseen(row) && <Pressable style={styles.ack} onPress={() => ack(row.id)}><Text style={styles.ackText}>Mark as seen</Text></Pressable>}
        </View>
      ))}
    </ResponsiveContainer>
  );
}

const styles = StyleSheet.create({
  empty: { color: colors.muted, marginTop: 8 },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, fontSize: 17, fontWeight: '900', color: colors.text },
  badge: { backgroundColor: colors.warningBg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { color: colors.text, fontWeight: '900', fontSize: 11 },
  date: { marginTop: 8, fontWeight: '800', color: colors.primaryDark },
  reason: { marginTop: 6, color: colors.text, lineHeight: 20 },
  ack: { alignSelf: 'flex-start', marginTop: 10, backgroundColor: colors.infoBg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  ackText: { fontWeight: '900', color: colors.primaryDark, fontSize: 12 },
});
