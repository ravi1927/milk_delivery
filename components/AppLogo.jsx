import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

export default function AppLogo({ size = 82, radius }) {
  const r = radius ?? size * 0.22;
  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: r }]}>
      <Image source={require('../assets/logo.png')} style={{ width: size, height: size }} resizeMode="cover" />
    </View>
  );
}
const styles = StyleSheet.create({ wrap: { overflow: 'hidden', backgroundColor: '#fff' } });
