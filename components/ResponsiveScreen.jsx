import React, { useState } from 'react';
import { Platform, RefreshControl, ScrollView, StatusBar, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Header from './Header';
import { colors } from '../constants/theme';

const MAX_WIDTH = 760;

// Top inset that works on iPhone notch / Dynamic Island AND on Android edge-to-edge,
// where the safe-area value can be 0 and the status bar height must be used instead.
export function useTopInset() {
  const insets = useSafeAreaInsets();
  const androidBar = Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0;
  return Math.max(insets.top, androidBar);
}

/**
 * Screen wrapper. The <Header/> child is pulled out and pinned at the top (below the
 * status bar / notch); everything else scrolls underneath it.
 */
export function ResponsiveContainer({ children, scroll = true, contentStyle, onRefresh }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const top = useTopInset();
  const sidePad = 12;
  const maxWidth = Math.min(MAX_WIDTH, Math.max(0, width - sidePad * 2 - insets.left - insets.right));
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  };

  const kids = React.Children.toArray(children);
  const headerEl = kids.find((k) => React.isValidElement(k) && k.type === Header);
  const body = kids.filter((k) => k !== headerEl);
  const header = headerEl && onRefresh && !headerEl.props.onRefresh
    ? React.cloneElement(headerEl, { onRefresh: refresh })
    : headerEl;

  return (
    <View style={[styles.root, { paddingTop: top, paddingLeft: insets.left, paddingRight: insets.right }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      {header && (
        <View style={styles.headerBar}>
          <View style={{ width: maxWidth }}>{header}</View>
        </View>
      )}
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40, paddingHorizontal: sidePad }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} /> : undefined}
        >
          <View style={[styles.inner, { width: maxWidth }, contentStyle]}>{body}</View>
        </ScrollView>
      ) : (
        <View style={[styles.flex, styles.noScroll, { paddingBottom: insets.bottom }]}>
          <View style={[styles.inner, { width: maxWidth }, contentStyle]}>{body}</View>
        </View>
      )}
    </View>
  );
}

export function useResponsiveColumns(minCardWidth = 300) {
  const { width } = useWindowDimensions();
  const available = Math.min(MAX_WIDTH, Math.max(0, width - 24));
  return Math.max(1, Math.floor((available + 10) / (minCardWidth + 10)));
}

// Width style for grid cards ('100%' | '48%' | '31%') given the column count.
export const colWidth = (cols) => (cols === 1 ? '100%' : cols === 2 ? '48%' : '31%');

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  headerBar: { alignItems: 'center', backgroundColor: colors.background, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingHorizontal: 12 },
  scroll: { alignItems: 'center', paddingTop: 12 },
  noScroll: { alignItems: 'center', paddingTop: 12 },
  inner: { paddingBottom: 10 },
});
