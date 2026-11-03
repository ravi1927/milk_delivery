import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export function csvCell(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** UTF-8 CSV with a BOM so Excel opens Unicode names correctly. No xlsx library is installed. */
export function toCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) lines.push(row.map(csvCell).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export async function exportCsv(filename, headers, rows) {
  const name = String(filename || 'report.csv').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-');
  const file = name.endsWith('.csv') ? name : `${name}.csv`;
  const csv = toCsv(headers, rows);
  if (Platform.OS === 'web') {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return file;
  }
  const base = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!base) throw new Error('This device cannot save a file.');
  const uri = `${base}${file}`;
  await FileSystem.writeAsStringAsync(uri, csv);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'text/csv',
      UTI: 'public.comma-separated-values-text',
      dialogTitle: 'Save CSV',
    });
  }
  return uri;
}
