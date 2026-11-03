import React from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StatusBar, StyleSheet, View, useWindowDimensions } from 'react-native';
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
// Keeps a bottom-docked footer just above the keypad. Measures after each layout
// change, so an Android window resize is not added on top of the lift.
function useDockedAboveKeyboard(enabled) {
  const anchorRef = React.useRef(null);
  const keyboardTop = React.useRef(0);
  const liftRef = React.useRef(0);
  const pending = React.useRef(false);
  const [lift, setLift] = React.useState(0);

  const sync = React.useCallback(() => {
    if (!enabled || pending.current || !anchorRef.current) return;
    anchorRef.current.measureInWindow((x, y, width, height) => {
      if (!keyboardTop.current || !height) return;
      const delta = Math.round(y + height + 8 - keyboardTop.current);
      if (Math.abs(delta) < 12) return;
      const next = Math.max(0, liftRef.current + delta);
      if (next === liftRef.current) return;
      pending.current = true;
      liftRef.current = next;
      setLift(next);
    });
  }, [enabled]);

  React.useEffect(() => {
    if (!enabled) return undefined;
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => {
      keyboardTop.current = e.endCoordinates.screenY;
      sync();
    });
    const hide = Keyboard.addListener(hideEvent, () => {
      keyboardTop.current = 0;
      pending.current = false;
      liftRef.current = 0;
      setLift(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [enabled, sync]);

  const onLayout = React.useCallback(() => {
    pending.current = false;
    if (keyboardTop.current) sync();
  }, [sync]);

  return { anchorRef, lift, onLayout };
}

export function ResponsiveContainer({ children, scroll = true, contentStyle, scrollRef, avoidKeyboard = false, footer = null }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const top = useTopInset();
  const [headerHeight, setHeaderHeight] = React.useState(0);
  const sidePad = 12;
  const maxWidth = Math.min(MAX_WIDTH, Math.max(0, width - sidePad * 2 - insets.left - insets.right));
  const dockKeyboard = avoidKeyboard && !!footer;
  const liftScroll = avoidKeyboard && !footer;
  const dock = useDockedAboveKeyboard(dockKeyboard);

  const kids = React.Children.toArray(children);
  const headerEl = kids.find((k) => React.isValidElement(k) && k.type === Header);
  const body = kids.filter((k) => k !== headerEl);
  const scroller = scroll ? (
    <ScrollView
      ref={scrollRef}
      style={[styles.flex, footer ? styles.shrink : null]}
      contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + (liftScroll ? 120 : footer ? 16 : 40), paddingHorizontal: sidePad }]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets={liftScroll}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.inner, { width: maxWidth }, contentStyle]}>{body}</View>
    </ScrollView>
  ) : (
    <View style={[styles.flex, styles.noScroll, { paddingBottom: insets.bottom }]}>
      <View style={[styles.inner, { width: maxWidth }, contentStyle]}>{body}</View>
    </View>
  );

  const column = footer ? (
    <View style={styles.flex}>
      {scroller}
      <View
        onLayout={dock.onLayout}
        style={[styles.footerWrap, { paddingBottom: dock.lift > 0 ? dock.lift : Math.max(insets.bottom, 8), paddingHorizontal: sidePad }]}
      >
        <View ref={dock.anchorRef} style={{ width: maxWidth }}>{footer}</View>
      </View>
    </View>
  ) : scroller;

  return (
    <View style={[styles.root, { paddingTop: top, paddingLeft: insets.left, paddingRight: insets.right }]}>
      <StatusBar barStyle="dark-content" />
      {headerEl && (
        <View style={styles.headerBar} onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
          <View style={{ width: maxWidth }}>{headerEl}</View>
        </View>
      )}
      {liftScroll ? (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={top + headerHeight}
        >
          {column}
        </KeyboardAvoidingView>
      ) : column}
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
  shrink: { minHeight: 0 },
  headerBar: { alignItems: 'center', backgroundColor: colors.background, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingHorizontal: 12 },
  scroll: { alignItems: 'center', paddingTop: 12 },
  noScroll: { alignItems: 'center', paddingTop: 12 },
  inner: { paddingBottom: 10 },
  footerWrap: { alignItems: 'center', backgroundColor: colors.background, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 8 },
});
