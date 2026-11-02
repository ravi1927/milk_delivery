import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

/** Turns HTML into a PDF file and opens the share sheet (save / WhatsApp / email / print). */
export async function exportPdf(html, dialogTitle = 'Share PDF') {
  if (Platform.OS === 'web') { await Print.printAsync({ html }); return null; }
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle });
  }
  return uri;
}
