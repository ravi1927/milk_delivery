import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SHOW_BILLING } from '../../constants/business';
import Header from '../../components/Header';
import { PrimaryButton, SectionTitle } from '../../components/Field';
import { ResponsiveContainer } from '../../components/ResponsiveScreen';
import * as s from '../../services/store';
import * as wa from '../../services/whatsapp';
import { exportPdf } from '../../services/pdf';
import { billsReportHtml, invoiceHtml } from '../../services/pdfHtml';
import {
  billingDayFor, computeBill, cycleDueKey, defaultStart, fmtAmount, fmtLitres, isBillingDue, isMessageOk,
  lastBilledEnd, messageProblem, niceDate, normalizePhone, shiftKey,
} from '../../services/billing';
import { colors } from '../../constants/theme';

const STATUS_STYLE = {
  pending: ['NOT SENT', colors.warningBg, colors.warning],
  opened: ['CONFIRM', colors.warningBg, colors.warning],
  failed: ['FAILED', colors.dangerBg, colors.danger],
  sent: ['SENT', colors.successBg, colors.success],
  delivered: ['DELIVERED', colors.successBg, colors.success],
  read: ['READ', colors.successBg, colors.success],
};

export default function Billing() {
  const router = useRouter();
  const today = s.dateKey();
  useEffect(() => { if (!SHOW_BILLING) router.replace('/admin'); }, [router]);
  const [customers, setCustomers] = useState([]);
  const [bills, setBills] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [end, setEnd] = useState(() => { const due = cycleDueKey(today); return today < due ? today : due; });
  const [mode, setMode] = useState('period'); // 'period' = every day in the period, 'delivered' = delivered days only
  const [selected, setSelected] = useState([]);
  const [filter, setFilter] = useState('action');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const initialSelect = useRef(false);
  const awaiting = useRef(null);   // link mode: { billId, queue } waiting for the admin to come back from WhatsApp
  const leftApp = useRef(false);

  const reload = useCallback(async () => {
    const [c, b, d] = await Promise.all([s.getCustomers(), s.getBills(), s.getDeliveries()]);
    setCustomers(c); setBills(b); setDeliveries(d);
    return b;
  }, []);

  useFocusEffect(useCallback(() => {
    (async () => {
      let b = await reload();
      if (wa.isApiMode()) { try { if (await wa.refreshStatuses(b)) await reload(); } catch { /* server offline: keep local state */ } }
    })();
  }, [reload]));

  // ───────── bill preview ─────────
  const preview = useMemo(() => customers.map((c) => {
    const effEnd = !c.active && c.stoppedOn && c.stoppedOn < end ? c.stoppedOn : end;
    const start = defaultStart(bills, c, effEnd);
    const calc = computeBill({ customer: c, start, end: effEnd, deliveries, mode });
    const phone = normalizePhone(c.phone);
    let issue = null;
    if (start > effEnd) issue = `Already billed till ${niceDate(lastBilledEnd(bills, c.id) || effEnd)}`;
    else if (!calc.days) issue = 'No delivered days in this period';
    else if (!calc.litres) issue = 'Milk quantity is empty – edit customer';
    else if (!c.ratePerLitre) issue = 'Rate per litre is empty – edit customer';
    return { c, start, end: effEnd, calc, phone, issue };
  }).filter((p) => p.c.active || !(p.start > p.end)), [customers, bills, deliveries, end, mode]);

  const billable = preview.filter((p) => !p.issue);
  useEffect(() => {
    if (!initialSelect.current && preview.length) { initialSelect.current = true; setSelected(billable.map((p) => p.c.id)); }
  }, [preview]);
  const toggle = (id) => setSelected((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const chosen = billable.filter((p) => selected.includes(p.c.id));
  const total = chosen.reduce((n, p) => n + p.calc.amount, 0);

  const dueNow = isBillingDue(today);
  const dueKey = cycleDueKey(today);
  const dueCount = customers.filter((c) => c.active && (lastBilledEnd(bills, c.id) || '') < dueKey && Number(c.ratePerLitre)).length;

  const generate = async () => {
    if (!chosen.length) return Alert.alert('Select customers', 'Tick at least one customer that can be billed.');
    setBusy(true);
    try {
      const drafts = chosen.map((p) => ({
        customerId: p.c.id, customerName: p.c.name, phone: p.phone, milkQuantity: p.c.milkQuantity, ratePerLitre: Number(p.c.ratePerLitre),
        periodStart: p.start, periodEnd: p.end, days: p.calc.days, litres: p.calc.litres, amount: p.calc.amount, basis: mode,
      }));
      const { created, skipped } = await s.createBills(drafts);
      await reload();
      setFilter('action'); setSelected([]);
      const lines = [`${created.length} bill(s) created.`];
      if (skipped.length) lines.push('', 'Skipped:', ...skipped.map((x) => `• ${x.customerName}: ${x.reason}`));
      lines.push('', 'Use "Send all pending" to send them on WhatsApp.');
      Alert.alert('Bills created', lines.join('\n'));
    } catch (e) { Alert.alert('Could not create bills', e.message); } finally { setBusy(false); }
  };

  // ───────── sending ─────────
  const needsAction = (b) => !isMessageOk(b);
  const queueable = (list) => list.filter((b) => b.wa?.status !== 'opened');

  const askConfirm = useCallback(async (billId, queue) => {
    const b = (await s.getBills()).find((x) => x.id === billId);
    if (!b) return continueQueue(queue);
    Alert.alert(`Did you send it to ${b.customerName}?`, 'Confirm only if you pressed Send in WhatsApp.', [
      { text: 'Stop', style: 'cancel', onPress: async () => { await reload(); } },
      { text: 'Not sent', style: 'destructive', onPress: async () => { await wa.markNotSent(billId); await reload(); continueQueue(queue); } },
      { text: 'Yes, sent', onPress: async () => { await wa.confirmSent(billId); await reload(); continueQueue(queue); } },
    ]);
  }, []);

  const continueQueue = useCallback(async (queue) => {
    if (!queue.length) { const b = await reload(); const bad = b.filter((x) => !isMessageOk(x) && x.wa?.status !== 'pending').length; if (bad) Alert.alert('Finished', `${bad} message(s) need attention – see the list below.`); return; }
    const [next, ...rest] = queue;
    const bill = (await s.getBills()).find((x) => x.id === next);
    if (!bill) return continueQueue(rest);
    // Register the wait BEFORE opening WhatsApp so the "app went to background" event is never missed.
    leftApp.current = false; awaiting.current = { billId: next, queue: rest };
    const updated = await wa.sendBill(bill);
    await reload();
    if (updated?.wa?.status !== 'opened') { awaiting.current = null; continueQueue(rest); }
  }, []);

  const sendOne = async (b) => {
    if (wa.isApiMode()) { await wa.sendBill(b); await reload(); return; }
    leftApp.current = false; awaiting.current = { billId: b.id, queue: [] };
    const updated = await wa.sendBill(b);
    if (updated?.wa?.status !== 'opened') awaiting.current = null;
    await reload();
  };

  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') { leftApp.current = true; return; }
      if (awaiting.current && leftApp.current) { const { billId, queue } = awaiting.current; awaiting.current = null; leftApp.current = false; askConfirm(billId, queue); }
    });
    return () => sub.remove();
  }, [askConfirm]);

  const sendMany = async (list) => {
    const todo = queueable(list);
    if (!todo.length) return Alert.alert('Nothing to send', 'All bills are already sent or waiting for confirmation.');
    if (wa.isApiMode()) {
      setBusy(true);
      try {
        for (let i = 0; i < todo.length; i++) { setProgress(`Sending ${i + 1} of ${todo.length}…`); await wa.sendBill(todo[i]); }
        const b = await reload();
        const failed = todo.filter((t) => b.find((x) => x.id === t.id)?.wa?.status === 'failed').length;
        Alert.alert('Sending finished', `${todo.length - failed} accepted by WhatsApp, ${failed} failed.${failed ? '\nSee "Needs action" below for the reasons.' : ''}`);
      } finally { setBusy(false); setProgress(''); }
    } else {
      Alert.alert('Send on WhatsApp', `WhatsApp will open for each customer (${todo.length}). Press Send there, then come back to this app and confirm.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Start', onPress: () => continueQueue(todo.map((t) => t.id)) },
      ]);
    }
  };

  const refresh = async () => {
    setBusy(true);
    try { const b = await reload(); const n = await wa.refreshStatuses(b); await reload(); Alert.alert('Status updated', n ? `${n} message(s) changed.` : 'No changes.'); }
    catch (e) { Alert.alert('Could not reach server', e.message); } finally { setBusy(false); }
  };

  const pdfFor = async (fn, title) => { try { await exportPdf(fn(), title); } catch (e) { Alert.alert('PDF failed', e.message); } };
  const remove = (b) => Alert.alert('Delete this bill?', `${b.customerName} • ${b.periodStart} to ${b.periodEnd}\nThe message history for this bill is also removed. The customer can be billed for this period again.`, [
    { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { await s.deleteBill(b.id); reload(); } },
  ]);

  const shown = bills.filter((b) => (filter === 'action' ? needsAction(b) : filter === 'sent' ? isMessageOk(b) : true)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const counts = { action: bills.filter(needsAction).length, sent: bills.filter(isMessageOk).length };
  const pendingList = bills.filter(needsAction);

  if (!SHOW_BILLING) return null;

  return (
    <ResponsiveContainer>
      <Header title="Billing & WhatsApp" subtitle="Create bills and send amounts to customers" />

      {dueNow && dueCount > 0 && (
        <View style={styles.due}><Text style={styles.dueTitle}>Monthly billing is due</Text><Text style={styles.dueText}>{dueCount} customer(s) have no bill up to {niceDate(dueKey)}. Create the bills below and send them.</Text></View>
      )}
      <View style={styles.mode}><Text style={styles.modeText}>Sending mode: <Text style={{ fontWeight: '900' }}>{wa.modeLabel()}</Text></Text></View>

      <SectionTitle title="1. Create bills" subtitle={`Bills run from the day after each customer's last bill (or the 1st of the month) up to the end date. The monthly bill day is the ${billingDayFor(today)}th; you can bill any time, e.g. when a customer stops.`} />
      <View style={styles.dateRow}>
        <Pressable style={styles.dayBtn} onPress={() => setEnd(shiftKey(end, -1))}><Text style={styles.dayTxt}>‹</Text></Pressable>
        <View><Text style={styles.dateSmall}>BILL UP TO (END DATE)</Text><Text style={styles.date}>{end}</Text></View>
        <Pressable style={[styles.dayBtn, end >= today && { opacity: 0.35 }]} disabled={end >= today} onPress={() => setEnd(shiftKey(end, 1))}><Text style={styles.dayTxt}>›</Text></Pressable>
      </View>
      <View style={styles.seg}>
        {[['period', 'Every day in period'], ['delivered', 'Delivered days only']].map(([k, label]) => (
          <Pressable key={k} style={[styles.segBtn, mode === k && styles.segOn]} onPress={() => setMode(k)}><Text style={[styles.segTxt, mode === k && styles.segTxtOn]}>{label}</Text></Pressable>
        ))}
      </View>
      <Text style={styles.hint}>{mode === 'period' ? 'Amount = daily litres × rate × number of days in the period (e.g. 30 days).' : 'Amount counts only days marked DELIVERED in the app. Days when the app was not used are not counted.'}</Text>

      <View style={styles.selRow}>
        <Text style={styles.selTitle}>{chosen.length} selected • {fmtAmount(total)}</Text>
        <Pressable onPress={() => setSelected(billable.map((p) => p.c.id))}><Text style={styles.link}>Select all</Text></Pressable>
        <Pressable onPress={() => setSelected([])}><Text style={styles.link}>Clear</Text></Pressable>
      </View>
      {preview.length === 0 && <View style={styles.empty}><Text style={styles.emptyTitle}>No customers yet</Text></View>}
      {preview.map((p) => {
        const on = selected.includes(p.c.id);
        return (
          <Pressable key={p.c.id} disabled={!!p.issue} onPress={() => toggle(p.c.id)} style={[styles.pick, on && styles.pickOn, !!p.issue && { opacity: 0.6 }]}>
            <View style={[styles.check, on && styles.checkOn]}>{on && <Text style={styles.tick}>✓</Text>}</View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{p.c.name}{!p.c.active ? '  (stopped)' : ''}</Text>
              {p.issue ? <Text style={styles.bad}>{p.issue}</Text> : <Text style={styles.meta}>{p.start} → {p.end} • {p.calc.days} days • {fmtLitres(p.calc.litres)} × {fmtAmount(p.calc.rate)}</Text>}
              {!p.phone && <Text style={styles.bad}>Mobile number missing / invalid – WhatsApp cannot be sent</Text>}
            </View>
            {!p.issue && <Text style={styles.amount}>{fmtAmount(p.calc.amount)}</Text>}
          </Pressable>
        );
      })}
      <PrimaryButton title={busy ? 'Please wait…' : `Create ${chosen.length} bill(s)`} onPress={generate} disabled={busy || !chosen.length} />

      <SectionTitle title="2. Send on WhatsApp" subtitle="Messages that are not sent or failed stay under “Needs action” so nothing is missed." />
      <View style={styles.stats}>
        <View style={styles.stat}><Text style={styles.statV}>{bills.length}</Text><Text style={styles.statL}>Bills</Text></View>
        <View style={styles.stat}><Text style={[styles.statV, { color: colors.success }]}>{counts.sent}</Text><Text style={styles.statL}>Sent</Text></View>
        <View style={styles.stat}><Text style={[styles.statV, counts.action ? { color: colors.danger } : null]}>{counts.action}</Text><Text style={styles.statL}>Needs action</Text></View>
      </View>
      <PrimaryButton title={progress || `Send all pending (${queueable(pendingList).length})`} onPress={() => sendMany(pendingList)} disabled={busy || !queueable(pendingList).length} />
      {wa.isApiMode() && <PrimaryButton title="Refresh delivery status" secondary onPress={refresh} disabled={busy} />}
      <PrimaryButton title="Export billing summary PDF" secondary onPress={() => pdfFor(() => billsReportHtml({ title: filter === 'action' ? 'Messages Needing Action' : filter === 'sent' ? 'Messages Sent' : 'Billing Summary', subtitle: filter === 'action' ? 'Not sent / failed' : filter === 'sent' ? 'Sent to customers' : 'All bills', bills: shown }), 'Billing summary')} disabled={!shown.length} />

      <View style={styles.seg}>
        {[['action', `Needs action (${counts.action})`], ['sent', `Sent (${counts.sent})`], ['all', 'All']].map(([k, label]) => (
          <Pressable key={k} style={[styles.segBtn, filter === k && styles.segOn]} onPress={() => setFilter(k)}><Text style={[styles.segTxt, filter === k && styles.segTxtOn]}>{label}</Text></Pressable>
        ))}
      </View>
      {shown.length === 0 && <View style={styles.empty}><Text style={styles.emptyTitle}>{filter === 'action' ? 'Nothing needs action 🎉' : 'No bills here yet'}</Text></View>}
      {shown.map((b) => {
        const st = STATUS_STYLE[b.wa?.status || 'pending'];
        const problem = messageProblem(b);
        return (
          <View key={b.id} style={styles.bill}>
            <View style={styles.billTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{b.customerName}</Text>
                <Text style={styles.meta}>{b.periodStart} → {b.periodEnd} • {b.days} days • {fmtLitres(b.litres)}</Text>
                <Text style={styles.meta}>{b.phone ? `+${b.phone}` : 'No valid mobile number'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.amount}>{fmtAmount(b.amount)}</Text>
                <View style={[styles.pill, { backgroundColor: st[1] }]}><Text style={[styles.pillTxt, { color: st[2] }]}>{st[0]}</Text></View>
              </View>
            </View>
            {!!problem && b.wa?.status !== 'pending' && <Text style={styles.bad}>{problem}</Text>}
            <View style={styles.actions}>
              {b.wa?.status === 'opened' ? (
                <>
                  <Pressable style={styles.act} onPress={async () => { await wa.confirmSent(b.id); reload(); }}><Text style={styles.actTxt}>Confirm sent</Text></Pressable>
                  <Pressable style={styles.actDanger} onPress={async () => { await wa.markNotSent(b.id); reload(); }}><Text style={styles.actDangerTxt}>Not sent</Text></Pressable>
                </>
              ) : !isMessageOk(b) ? (
                <Pressable style={styles.act} disabled={busy} onPress={() => sendOne(b)}><Text style={styles.actTxt}>{b.wa?.status === 'failed' ? 'Retry' : 'Send'}</Text></Pressable>
              ) : null}
              <Pressable style={styles.actGhost} onPress={() => pdfFor(() => invoiceHtml(b), `Bill – ${b.customerName}`)}><Text style={styles.actGhostTxt}>PDF</Text></Pressable>
              <Pressable style={styles.actGhost} onPress={() => remove(b)}><Text style={[styles.actGhostTxt, { color: colors.danger }]}>Delete</Text></Pressable>
            </View>
          </View>
        );
      })}
    </ResponsiveContainer>
  );
}

const styles = StyleSheet.create({
  due: { backgroundColor: colors.warningBg, borderWidth: 1, borderColor: '#F2D58B', borderRadius: 15, padding: 14, marginBottom: 10 },
  dueTitle: { fontWeight: '900', color: colors.text },
  dueText: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  mode: { backgroundColor: colors.infoBg, borderRadius: 12, padding: 10, marginBottom: 4 },
  modeText: { color: colors.primaryDark, fontSize: 12 },
  dateRow: { backgroundColor: colors.primary, borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  dayTxt: { fontSize: 22, color: colors.primaryDark, lineHeight: 26 },
  dateSmall: { color: '#D7EEFF', fontSize: 10, fontWeight: '900', textAlign: 'center' },
  date: { color: '#fff', fontWeight: '900', fontSize: 18, textAlign: 'center', marginTop: 2 },
  seg: { flexDirection: 'row', backgroundColor: colors.infoBg, borderRadius: 12, padding: 3, marginVertical: 10, gap: 3 },
  segBtn: { flex: 1, paddingVertical: 9, paddingHorizontal: 4, borderRadius: 10, alignItems: 'center' },
  segOn: { backgroundColor: '#fff' },
  segTxt: { fontSize: 12, fontWeight: '800', color: colors.muted, textAlign: 'center' },
  segTxtOn: { color: colors.primaryDark },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 17, marginBottom: 8 },
  selRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginVertical: 6 },
  selTitle: { flex: 1, fontWeight: '900', color: colors.text },
  link: { color: colors.primary, fontWeight: '800', fontSize: 12 },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12, marginBottom: 8 },
  pickOn: { borderColor: colors.primary, backgroundColor: '#F0F8FF' },
  check: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.primary },
  tick: { color: '#fff', fontWeight: '900' },
  name: { fontWeight: '900', color: colors.text, fontSize: 15 },
  meta: { color: colors.muted, fontSize: 12, marginTop: 3 },
  bad: { color: colors.danger, fontSize: 12, marginTop: 4, fontWeight: '700' },
  amount: { fontWeight: '900', color: colors.secondaryDark, fontSize: 16 },
  stats: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  stat: { flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12 },
  statV: { fontSize: 22, fontWeight: '900', color: colors.text },
  statL: { color: colors.muted, fontSize: 12, fontWeight: '700', marginTop: 2 },
  empty: { backgroundColor: colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  emptyTitle: { fontWeight: '900', color: colors.text },
  bill: { backgroundColor: colors.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 9 },
  billTop: { flexDirection: 'row', gap: 10 },
  pill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginTop: 6 },
  pillTxt: { fontSize: 10, fontWeight: '900' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  act: { backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  actTxt: { color: '#fff', fontWeight: '900', fontSize: 12 },
  actDanger: { backgroundColor: colors.dangerBg, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  actDangerTxt: { color: colors.danger, fontWeight: '900', fontSize: 12 },
  actGhost: { backgroundColor: colors.infoBg, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  actGhostTxt: { color: colors.primaryDark, fontWeight: '900', fontSize: 12 },
});
