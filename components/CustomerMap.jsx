import React, { useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors } from '../constants/theme';
import { mapDocument } from './mapHtml';
import { useMapBridge } from './useMapBridge';

export default function CustomerMap({ points = [], height = 210, onPick, interactive = false }) {
  const mapId = useRef(`m${Math.random().toString(36).slice(2, 10)}`).current;
  const html = useMemo(() => mapDocument({ mapId, interactive }), [mapId, interactive]);
  const webRef = useRef(null);
  const { sendPoints, handleRaw } = useMapBridge({
    mapId,
    points,
    onPick,
    post: (message) => webRef.current?.postMessage(message),
  });

  return (
    <View style={[styles.frame, { height }]}>
      <WebView
        ref={webRef}
        source={{ html, baseUrl: 'https://unpkg.com/' }}
        originWhitelist={['*']}
        onMessage={(event) => handleRaw(event.nativeEvent.data)}
        onLoadEnd={sendPoints}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        nestedScrollEnabled
        setSupportMultipleWindows={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        style={styles.web}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: '#E7F1F8' },
  web: { flex: 1, backgroundColor: 'transparent' },
});
