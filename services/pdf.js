import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

function pdfName(title) {
  const slug = String(title || 'report')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return `${slug || 'report'}.pdf`;
}

/** Copy the generated PDF to a stable *.pdf name so Android and iOS can save and open it. */
async function namedPdf(uri, name) {
  try {
    const base = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    if (!base) return uri;
    const dest = `${base}${name}`;
    const info = await FileSystem.getInfoAsync(dest);
    if (info.exists) await FileSystem.deleteAsync(dest, { idempotent: true });
    await FileSystem.copyAsync({ from: uri, to: dest });
    return dest;
  } catch {
    return uri;
  }
}

/**
 * Build a real PDF file and hand it to the system so the user can save and open it.
 * Android and iOS use the share sheet (Save to Files / Downloads, or open in a PDF app).
 * Web opens the browser print dialog, which can save a PDF.
 */
export async function exportPdf(html, dialogTitle = 'Save PDF') {
  const name = pdfName(dialogTitle);
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return null;
  }
  const { uri } = await Print.printToFileAsync({ html });
  const fileUri = await namedPdf(uri, name);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: 'Save or open PDF',
    });
    return fileUri;
  }
  await Print.printAsync({ uri: fileUri });
  return fileUri;
}
