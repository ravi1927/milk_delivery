// Expo's iOS template sets NSAllowsLocalNetworking next to NSAllowsArbitraryLoads.
// On iOS 10 and later, the presence of that key makes NSAllowsArbitraryLoads
// ignored, so cleartext HTTP to a public IP never leaves the phone.
// IP addresses cannot be ATS exception domains, so the working allowance is
// NSAllowsArbitraryLoads with those narrower keys removed.
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod, withInfoPlist } = require('@expo/config-plugins');

function readApiUrl() {
  try {
    const src = fs.readFileSync(path.join(__dirname, '..', 'constants', 'business.js'), 'utf8');
    const match = src.match(/API_BASE_URL\s*=\s*'([^']*)'/);
    return match ? match[1].trim() : '';
  } catch {
    return '';
  }
}

function httpApiHost() {
  const raw = readApiUrl();
  if (!raw || !/^http:\/\//i.test(raw)) return '';
  try {
    return new URL(raw).hostname;
  } catch {
    return '';
  }
}

function withIosCleartext(config) {
  return withInfoPlist(config, (config) => {
    const ats = { ...(config.modResults.NSAppTransportSecurity || {}) };
    ats.NSAllowsArbitraryLoads = true;
    // These keys, even when false, cancel NSAllowsArbitraryLoads on iOS 10+.
    delete ats.NSAllowsLocalNetworking;
    delete ats.NSAllowsArbitraryLoadsForMedia;
    delete ats.NSAllowsArbitraryLoadsInWebContent;
    config.modResults.NSAppTransportSecurity = ats;
    return config;
  });
}

function withAndroidCleartext(config, host) {
  config = withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest?.application?.[0];
    if (!application) return config;
    application.$ = application.$ || {};
    application.$['android:usesCleartextTraffic'] = 'true';
    application.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    return config;
  });

  return withDangerousMod(config, [
    'android',
    async (config) => {
      const xmlDir = path.join(config.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      fs.mkdirSync(xmlDir, { recursive: true });
      const hostNote = host ? ` API host ${host} is plain HTTP.` : '';
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <!--${hostNote} IP addresses are not valid domain-config entries, so cleartext is allowed for the whole app. -->
  <base-config cleartextTrafficPermitted="true" />
</network-security-config>
`;
      fs.writeFileSync(path.join(xmlDir, 'network_security_config.xml'), xml);
      return config;
    },
  ]);
}

function withCleartextApi(config) {
  const host = httpApiHost();
  if (!host) return config;
  config = withIosCleartext(config);
  config = withAndroidCleartext(config, host);
  return config;
}

module.exports = withCleartextApi;
