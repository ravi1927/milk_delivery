import { Alert, Linking, Platform } from 'react-native';
import { appleDirectionsUrl, directionsUrl, parsePoint } from './geo';

export async function openDirections(target) {
  const google = directionsUrl(target);
  if (!google) {
    Alert.alert('No location', 'This customer has no address or map pin yet. Add one from Customers.');
    return;
  }
  const point = parsePoint(target?.latitude, target?.longitude);
  const apple = Platform.OS === 'ios' ? appleDirectionsUrl(point?.latitude, point?.longitude) : null;
  try {
    await Linking.openURL(apple || google);
  } catch {
    try { await Linking.openURL(google); }
    catch { Alert.alert('Cannot open maps', 'No maps app is available to show directions.'); }
  }
}
