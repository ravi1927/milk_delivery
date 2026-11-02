import React, { createElement, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../constants/theme';
import { mapDocument } from './mapHtml';
import { useMapBridge } from './useMapBridge';

export default function CustomerMap({ points = [], height = 210, onPick, interactive = false }) {
  const mapId = useRef(`m${Math.random().toString(36).slice(2, 10)}`).current;
  const html = useMemo(() => mapDocument({ mapId, interactive }), [mapId, interactive]);
  const frameRef = useRef(null);
  const { sendPoints, handleRaw } = useMapBridge({
    mapId,
    points,
    onPick,
    post: (message) => frameRef.current?.contentWindow?.postMessage(message, '*'),
  });

  React.useEffect(() => {
    const onMessage = (event) => handleRaw(event.data);
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [handleRaw]);

  return (
    <View style={[styles.frame, { height }]}>
      {createElement('iframe', {
        ref: frameRef,
        title: 'Customer location',
        srcDoc: html,
        onLoad: sendPoints,
        style: { border: 0, width: '100%', height: '100%', background: '#E7F1F8' },
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: '#E7F1F8' },
});
