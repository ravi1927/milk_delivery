import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../constants/theme';

/** Bordered grid the admin can scan like a spreadsheet. Values are already formatted. */
export default function SheetTable({ columns, rows, totals }) {
  const width = columns.reduce((n, col) => n + col.width, 0);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator style={styles.wrap}>
      <View style={{ width }}>
        <View style={styles.line}>
          {columns.map((col) => (
            <View key={col.key} style={[styles.cell, styles.head, { width: col.width }]}>
              <Text style={styles.headTxt}>{col.label}</Text>
            </View>
          ))}
        </View>
        {rows.map((row, index) => (
          <View key={String(row.id ?? index)} style={styles.line}>
            {columns.map((col) => (
              <View key={col.key} style={[styles.cell, index % 2 === 1 && styles.alt, { width: col.width }]}>
                <Text style={[styles.txt, col.align === 'right' && styles.right]} numberOfLines={2}>{row[col.key]}</Text>
              </View>
            ))}
          </View>
        ))}
        {!!totals && (
          <View style={styles.line}>
            {columns.map((col) => (
              <View key={col.key} style={[styles.cell, styles.total, { width: col.width }]}>
                <Text style={[styles.totalTxt, col.align === 'right' && styles.right]}>{totals[col.key] ?? ''}</Text>
              </View>
            ))}
          </View>
        )}
        {!rows.length && <Text style={styles.empty}>No customers in this period.</Text>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderColor: '#8FB6D6', borderRadius: 8, backgroundColor: '#fff', marginBottom: 8 },
  line: { flexDirection: 'row' },
  cell: { borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#D0D7DE', paddingVertical: 8, paddingHorizontal: 8, justifyContent: 'center', minHeight: 36 },
  head: { backgroundColor: colors.primary, borderColor: '#0E5F9E' },
  headTxt: { color: '#fff', fontWeight: '800', fontSize: 11 },
  alt: { backgroundColor: '#F4FAFD' },
  txt: { color: colors.text, fontSize: 12, fontWeight: '600' },
  right: { textAlign: 'right' },
  total: { backgroundColor: '#E7F4FF' },
  totalTxt: { color: colors.primaryDark, fontWeight: '900', fontSize: 12 },
  empty: { color: colors.muted, padding: 12, fontWeight: '700' },
});
