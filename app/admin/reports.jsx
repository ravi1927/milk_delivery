import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Header from '../../components/Header';
import SheetTable from '../../components/SheetTable';
import { ResponsiveContainer, useResponsiveColumns } from '../../components/ResponsiveScreen';
import { SectionTitle } from '../../components/Field';
import StatusBadge from '../../components/StatusBadge';
import { exportPdf } from '../../services/pdf';
import { consumptionReportHtml, deliveryReportHtml } from '../../services/pdfHtml';
import { exportCsv } from '../../services/sheet';
import { consumptionTotals, customerConsumptionRows, fmtAmount, fmtLitres, shiftKey } from '../../services/billing';
import * as s from '../../services/store';
import { colors } from '../../constants/theme';

const SHEET_COLUMNS = [
  { key: 'name', label: 'Name', width: 150 },
  { key: 'area', label: 'Area', width: 120 },
  { key: 'rate', label: 'Rate / litre', width: 100, align: 'right' },
  { key: 'billedDays', label: 'Billed days', width: 100, align: 'right' },
  { key: 'skippedDays', label: 'Skipped days', width: 110, align: 'right' },
  { key: 'litres', label: 'Litres consumed', width: 120, align: 'right' },
  { key: 'amount', label: 'Amount', width: 110, align: 'right' },
];

const cardWidth = (cols) => (cols <= 1 ? '100%' : cols === 2 ? '47%' : '31%');

export default function Reports() {
  const [date, setDate] = useState(s.dateKey());
  const [from, setFrom] = useState(() => `${s.dateKey().slice(0, 8)}01`);
  const [ds, setDs] = useState([]);
  const [cs, setCs] = useState([]);
  const [us, setUs] = useState([]);
  const [areas, setAreas] = useState([]);
  const [skips, setSkips] = useState([]);
  const [error, setError] = useState('');
  const statCols = useResponsiveColumns(140);
  const cardCols = useResponsiveColumns(156);

  const load = async () => {
    try {
      const [d, c, u, a, sk] = await Promise.all([s.getDeliveries(), s.getCustomers(), s.getUsers(), s.getAreas(), s.getSkipRequests()]);
      setDs(d); setCs(c); setUs(u); setAreas(a); setSkips(sk); setError('');
    } catch (e) {
      setError(e?.message || 'Could not load reports.');
    }
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  const day = ds.filter(d => d.date === date);
  const delivered = day.filter(d => d.status === 'delivered');
  const pending = day.filter(d => d.status === 'pending');
  const litres = day.reduce((n, d) => n + Number(d.expectedLitres || 0), 0);
  const amount = day.reduce((n, d) => n + Number(d.amount || 0), 0);
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const dayDate = s.dateKey(s.addDays(date, -6 + i));
    const rows = ds.filter(d => d.date === dayDate);
    return { date: dayDate, rows, delivered: rows.filter(x => x.status === 'delivered').length };
  });
  const boyRows = us.filter(u => u.role === 'delivery').map(u => {
    const rows = day.filter(d => String(d.boyId ?? '') === String(u.id ?? ''));
    return { ...u, rows, done: rows.filter(d => d.status === 'delivered').length };
  });
  const areaRows = areas.map(a => {
    const rows = day.filter(d => String(d.areaId ?? '') === String(a.id ?? ''));
    return { ...a, rows, done: rows.filter(d => d.status === 'delivered').length };
  });
  const monthStart = `${date.slice(0, 8)}01`;
  const stats = [
    ['Customers', day.length],
    ['Delivered', delivered.length],
    ['Pending', pending.length],
    ['Litres', `${litres.toFixed(2)} L`],
    ['Amount', s.money(amount)],
    ['Completion', `${day.length ? Math.round(delivered.length / day.length * 100) : 0}%`],
  ];

  const periodStart = from > date ? date : from;
  const periodEnd = date;
  const sheetRows = customerConsumptionRows({ customers: cs, areas, skips, deliveries: ds, start: periodStart, end: periodEnd, mode: 'period' });
  const sheetTotals = consumptionTotals(sheetRows);
  const sheetView = sheetRows.map((row) => ({
    id: row.id,
    name: row.name,
    area: row.area,
    rate: fmtAmount(row.rate),
    billedDays: String(row.billedDays),
    skippedDays: String(row.skippedDays),
    litres: fmtLitres(row.litres),
    amount: fmtAmount(row.amount),
  }));
  const sheetTotalView = {
    name: 'Total',
    area: '',
    rate: '',
    billedDays: String(sheetTotals.billedDays),
    skippedDays: String(sheetTotals.skippedDays),
    litres: fmtLitres(sheetTotals.litres),
    amount: fmtAmount(sheetTotals.amount),
  };

  const exportRange = async (rangeFrom, rangeTo, label) => {
    try {
      await exportPdf(deliveryReportHtml({ deliveries: ds, customers: cs, users: us, areas, from: rangeFrom, to: rangeTo }), label);
    } catch (e) {
      Alert.alert('PDF failed', e.message);
    }
  };
  const exportTotalsPdf = async () => {
    try {
      await exportPdf(consumptionReportHtml({ customers: cs, areas, skips, deliveries: ds, start: periodStart, end: periodEnd }), `Customer totals ${periodStart} to ${periodEnd}`);
    } catch (e) {
      Alert.alert('PDF failed', e.message);
    }
  };
  const exportTotalsCsv = async () => {
    try {
      const headers = ['Name', 'Area', 'Rate per litre', 'Billed days', 'Skipped days', 'Litres consumed', 'Amount'];
      const data = sheetRows.map((row) => [row.name, row.area, row.rate, row.billedDays, row.skippedDays, row.litres, row.amount]);
      data.push(['Total', '', '', sheetTotals.billedDays, sheetTotals.skippedDays, sheetTotals.litres, sheetTotals.amount]);
      await exportCsv(`customer-totals-${periodStart}-to-${periodEnd}.csv`, headers, data);
    } catch (e) {
      Alert.alert('CSV failed', e.message);
    }
  };

  return (
    <ResponsiveContainer>
      <Header title="Reports" subtitle="Daily, weekly, area and delivery-boy performance" />
      {!!error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.dateBox}>
        <Pressable style={styles.dayBtn} onPress={() => { const next = s.dateKey(s.addDays(date, -1)); setDate(next); if (from > next) setFrom(next); }}><Text>‹</Text></Pressable>
        <View style={styles.dateMid}><Text style={styles.dateSmall}>REPORT DATE / PERIOD END</Text><Text style={styles.date}>{date}</Text></View>
        <Pressable style={styles.dayBtn} onPress={() => setDate(s.dateKey(s.addDays(date, 1)))}><Text>›</Text></Pressable>
      </View>
      <View style={styles.exportRow}>
        {[['Download PDF • this day', date, date], ['Download PDF • last 7 days', s.dateKey(s.addDays(date, -6)), date], ['Download PDF • this month', monthStart, date]].map(([label, from, to]) => (
          <Pressable key={label} style={styles.exportBtn} onPress={() => exportRange(from, to, label.replace(/^Download PDF • /, 'Delivery report '))}>
            <Text style={styles.exportTxt}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <SectionTitle
        title="Customer totals"
        subtitle={`${periodStart} to ${periodEnd}. Amount = billed days × daily litres × rate. A skip request on a date in this period removes that day from billed days, litres, and amount. Days before the customer was added, and days after a stopped customer’s stop date, are left out.`}
      />
      <View style={styles.dateBox}>
        <Pressable style={styles.dayBtn} onPress={() => setFrom(shiftKey(from, -1))}><Text>‹</Text></Pressable>
        <View style={styles.dateMid}><Text style={styles.dateSmall}>PERIOD START</Text><Text style={styles.date}>{from}</Text></View>
        <Pressable style={[styles.dayBtn, from >= date && { opacity: 0.35 }]} disabled={from >= date} onPress={() => setFrom(shiftKey(from, 1))}><Text>›</Text></Pressable>
      </View>
      <Text style={styles.periodNote}>Period end is the report date above ({date}). Move that date to change the end.</Text>
      <View style={styles.exportRow}>
        <Pressable style={styles.exportBtn} onPress={exportTotalsCsv}><Text style={styles.exportTxt}>Download CSV • customer totals</Text></Pressable>
        <Pressable style={styles.exportBtn} onPress={exportTotalsPdf}><Text style={styles.exportTxt}>Download PDF • customer totals</Text></Pressable>
      </View>
      <SheetTable columns={SHEET_COLUMNS} rows={sheetView} totals={sheetTotalView} />
      <SectionTitle title="Daily summary" />
      <View style={styles.grid}>
        {stats.map(([k, v]) => (
          <View key={k} style={[styles.stat, { width: cardWidth(statCols) }]}>
            <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>{v}</Text>
            <Text style={styles.label}>{k}</Text>
          </View>
        ))}
      </View>
      <SectionTitle title="Delivery boy report" subtitle="Who delivered how many customers today" />
      <View style={styles.grid}>
        {boyRows.map(b => (
          <View key={b.id} style={[styles.row, { width: cardWidth(cardCols) }]}>
            <View style={styles.rowBody}>
              <Text style={styles.name}>{b.name}</Text>
              <Text style={styles.meta}>{b.rows.length} assigned • {b.done} delivered • {b.rows.length - b.done} pending</Text>
            </View>
            <Text style={styles.percent}>{b.rows.length ? Math.round(b.done / b.rows.length * 100) : 0}%</Text>
          </View>
        ))}
      </View>
      <SectionTitle title="Area report" />
      <View style={styles.grid}>
        {areaRows.map(a => (
          <View key={a.id} style={[styles.row, { width: cardWidth(cardCols) }]}>
            <View style={styles.rowBody}>
              <Text style={styles.name}>{a.name}</Text>
              <Text style={styles.meta}>{a.rows.length} customers • {a.done} delivered</Text>
            </View>
            <Text style={styles.percent}>{a.rows.length ? Math.round(a.done / a.rows.length * 100) : 0}%</Text>
          </View>
        ))}
      </View>
      <SectionTitle title="7-day delivery trend" />
      <View style={styles.week}>
        {last7.map(x => (
          <View key={x.date} style={styles.weekRow}>
            <Text style={styles.weekDate}>{x.date.slice(5)}</Text>
            <View style={styles.barTrack}><View style={[styles.bar, { width: `${x.rows.length ? Math.max(4, x.delivered / x.rows.length * 100) : 0}%` }]} /></View>
            <Text style={styles.weekValue}>{x.delivered}/{x.rows.length}</Text>
          </View>
        ))}
      </View>
      <SectionTitle title={`Customer delivery details • ${date}`} />
      <View style={styles.grid}>
        {day.map(d => {
          const c = cs.find(x => String(x.id) === String(d.customerId));
          const u = us.find(x => String(x.id) === String(d.boyId));
          const a = areas.find(x => String(x.id) === String(d.areaId));
          return (
            <View key={d.id} style={[styles.detail, { width: cardWidth(cardCols) }]}>
              <View style={styles.rowBody}>
                <Text style={styles.name}>{c?.name || 'Customer'}</Text>
                <Text style={styles.meta}>{a?.name || 'No area'} • {u?.name || 'Unassigned'}</Text>
                <Text style={styles.meta}>{d.expectedLitres || 0} L • {s.money(d.amount)}</Text>
                {d.deliveredAt && <Text style={styles.meta}>Delivered {new Date(d.deliveredAt).toLocaleTimeString()}</Text>}
              </View>
              <StatusBadge status={d.status} />
            </View>
          );
        })}
      </View>
    </ResponsiveContainer>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.danger, fontWeight: '700', marginBottom: 8 },
  dateBox: { backgroundColor: colors.primary, borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  dayBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  dateMid: { flex: 1, minWidth: 0 },
  dateSmall: { color: '#D7EEFF', fontSize: 10, fontWeight: '900', textAlign: 'center' },
  date: { color: '#fff', fontWeight: '900', fontSize: 18, textAlign: 'center', marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'stretch' },
  stat: { backgroundColor: colors.card, borderRadius: 15, padding: 14, borderWidth: 1, borderColor: colors.border, minWidth: 0, maxWidth: '100%' },
  value: { fontSize: 22, fontWeight: '900', color: colors.text },
  label: { fontSize: 12, color: colors.muted, marginTop: 4, fontWeight: '700' },
  row: { backgroundColor: colors.card, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, minWidth: 0, maxWidth: '100%', gap: 8 },
  rowBody: { flex: 1, minWidth: 0 },
  name: { fontWeight: '900', color: colors.text, flexShrink: 1 },
  meta: { color: colors.muted, fontSize: 12, marginTop: 4, flexShrink: 1 },
  percent: { fontWeight: '900', fontSize: 17, color: colors.primary },
  week: { backgroundColor: colors.card, borderRadius: 15, padding: 15, borderWidth: 1, borderColor: colors.border },
  weekRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 11, gap: 8 },
  weekDate: { fontSize: 11, color: colors.muted, width: 46 },
  barTrack: { height: 9, backgroundColor: '#EAF2F7', borderRadius: 6, flex: 1, minWidth: 0, overflow: 'hidden' },
  bar: { height: 9, backgroundColor: colors.secondary, borderRadius: 6 },
  weekValue: { fontSize: 11, fontWeight: '800', width: 42, textAlign: 'right', color: colors.text },
  detail: { backgroundColor: colors.card, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, minWidth: 0, maxWidth: '100%', gap: 8 },
  exportRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  exportBtn: { flexGrow: 1, flexBasis: '30%', minWidth: 132, maxWidth: '100%', backgroundColor: colors.infoBg, borderWidth: 1, borderColor: '#BBDDF4', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center' },
  exportTxt: { color: colors.primaryDark, fontWeight: '900', fontSize: 12, textAlign: 'center' },
  periodNote: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 8 },
});
