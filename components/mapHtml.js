// Map document shared by the native WebView and the web iframe.
// OpenFreeMap (MapLibre) needs no API key. Pins are pushed in after load.
export function mapDocument({ mapId, interactive }) {
  const id = JSON.stringify(String(mapId || 'map'));
  const pick = interactive ? 'true' : 'false';
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" />
<script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
<style>
  html, body, #map { height: 100%; margin: 0; background: #e7f1f8; }
  .maplibregl-ctrl-attrib { font-size: 10px; }
  .err { font-family: sans-serif; color: #6B7C8C; padding: 16px; font-size: 14px; }
</style>
</head>
<body>
<div id="map"></div>
<script>
(function () {
  var MAP_ID = ${id};
  var INTERACTIVE = ${pick};
  function send(obj) {
    obj.mapId = MAP_ID;
    var raw = JSON.stringify(obj);
    try {
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(raw);
      else if (window.parent && window.parent !== window) window.parent.postMessage(raw, '*');
    } catch (e) {}
  }
  if (typeof maplibregl === 'undefined') {
    document.getElementById('map').innerHTML = '<p class="err">Map could not load. Check the network, then reopen this screen.</p>';
    return;
  }
  var map = new maplibregl.Map({
    container: 'map',
    style: 'https://tiles.openfreemap.org/styles/liberty',
    center: [79.4192, 13.6288],
    zoom: 12,
    scrollZoom: INTERACTIVE,
    attributionControl: true
  });
  var markers = [];
  var gotPoints = false;
  var loaded = false;
  var queued = null;
  function apply(list) {
    markers.forEach(function (marker) { marker.remove(); });
    markers = [];
    var bounds = new maplibregl.LngLatBounds();
    var count = 0;
    (list || []).forEach(function (p) {
      if (typeof p.latitude !== 'number' || typeof p.longitude !== 'number') return;
      var marker = new maplibregl.Marker({ color: '#1578C8', draggable: INTERACTIVE && list.length === 1 })
        .setLngLat([p.longitude, p.latitude]);
      if (p.title) marker.setPopup(new maplibregl.Popup({ offset: 24 }).setText(String(p.title)));
      if (INTERACTIVE) {
        marker.on('dragend', function () {
          gotPoints = true;
          var ll = marker.getLngLat();
          send({ type: 'dhaara-map', latitude: ll.lat, longitude: ll.lng });
        });
      }
      marker.addTo(map);
      markers.push(marker);
      bounds.extend([p.longitude, p.latitude]);
      count += 1;
    });
    if (!count) return;
    if (count === 1) map.easeTo({ center: bounds.getCenter(), zoom: Math.max(map.getZoom(), 15) });
    else map.fitBounds(bounds, { padding: 36, maxZoom: 15, duration: 0 });
  }
  var announced = false;
  function onIncoming(event) {
    var data = event.data;
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { return; } }
    if (!data || data.mapId !== MAP_ID || data.type !== 'dhaara-set') return;
    gotPoints = true;
    queued = data.points || [];
    if (loaded) apply(queued);
  }
  document.addEventListener('message', onIncoming);
  window.addEventListener('message', onIncoming);
  function markReady() {
    loaded = true;
    if (queued) apply(queued);
    if (announced) return;
    announced = true;
    send({ type: 'dhaara-ready' });
    map.resize();
  }
  map.on('style.load', markReady);
  setTimeout(markReady, 1200);
  if (INTERACTIVE) {
    map.on('click', function (e) {
      gotPoints = true;
      send({ type: 'dhaara-map', latitude: e.lngLat.lat, longitude: e.lngLat.lng });
      apply([{ latitude: e.lngLat.lat, longitude: e.lngLat.lng, title: 'Selected location' }]);
    });
  }
  var tries = 0;
  var timer = setInterval(function () {
    if (gotPoints || tries++ > 20) { clearInterval(timer); return; }
    if (loaded) send({ type: 'dhaara-ready' });
  }, 300);
  setTimeout(function () { map.resize(); }, 300);
})();
</script>
</body>
</html>`;
}
