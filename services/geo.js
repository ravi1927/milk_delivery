// Tirupati, the dairy's home city. Used when a pin starts from the town centre.
export const TIRUPATI = { latitude: 13.6288, longitude: 79.4192 };

export function parsePoint(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { latitude: round6(lat), longitude: round6(lng) };
}

export function hasCoords(record) {
  return !!parsePoint(record?.latitude, record?.longitude);
}

export function nudge(point, direction) {
  const base = parsePoint(point?.latitude, point?.longitude) || { ...TIRUPATI };
  const step = 0.0007;
  const lngStep = step / Math.cos((base.latitude * Math.PI) / 180);
  const delta = { n: [step, 0], s: [-step, 0], e: [0, lngStep], w: [0, -lngStep] }[direction];
  if (!delta) return base;
  return parsePoint(base.latitude + delta[0], base.longitude + delta[1]);
}

export function geocodeQuery(address, areaName) {
  const specific = [address, areaName].map((part) => String(part || '').trim()).filter(Boolean);
  if (String(address || '').trim().length < 3) return '';
  return [...specific, 'Andhra Pradesh', 'India'].join(', ');
}

export async function geocodeAddress(address, areaName) {
  const q = geocodeQuery(address, areaName);
  if (!q) throw new Error('Enter the house, street, or landmark, then find it on the map.');
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5&lat=${TIRUPATI.latitude}&lon=${TIRUPATI.longitude}&lang=en`;
  let response;
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch {
    throw new Error('Could not reach the map search. Check the network, or drop the pin yourself.');
  }
  if (!response.ok) throw new Error('Map search failed. Drop the pin yourself or try again.');
  const body = await response.json().catch(() => ({}));
  const features = Array.isArray(body?.features) ? body.features : [];
  for (const feature of features) {
    const [lng, lat] = feature?.geometry?.coordinates || [];
    const point = parsePoint(lat, lng);
    if (!point) continue;
    const props = feature.properties || {};
    const country = `${props.countrycode || ''} ${props.country || ''}`.toUpperCase();
    if (country && !country.includes('IN') && !country.includes('INDIA')) continue;
    return { ...point, label: placeLabel(props) };
  }
  throw new Error('No matching place. Drop the pin on the map or use your current location.');
}

export function directionsUrl({ latitude, longitude, address, areaName, name } = {}) {
  const point = parsePoint(latitude, longitude);
  if (point) return `https://www.google.com/maps/dir/?api=1&destination=${point.latitude},${point.longitude}&travelmode=driving`;
  const query = [address, areaName, name].map((part) => String(part || '').trim()).filter(Boolean).join(', ');
  if (!query) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}&travelmode=driving`;
}

export function appleDirectionsUrl(latitude, longitude) {
  const point = parsePoint(latitude, longitude);
  if (!point) return null;
  return `http://maps.apple.com/?daddr=${point.latitude},${point.longitude}&dirflg=d`;
}

function placeLabel(props) {
  return [props.name, props.street, props.locality, props.city, props.state]
    .map((part) => String(part || '').trim())
    .filter((part, index, list) => part && list.indexOf(part) === index)
    .join(', ');
}

function round6(value) {
  return Math.round(value * 1e6) / 1e6;
}
