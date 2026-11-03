import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../constants/theme';

export function Field({ label, value, onChangeText, placeholder, keyboardType, secureTextEntry, multiline, autoComplete, textContentType, importantForAutofill, onFocus, onBlur }) {
  return <View style={styles.wrap}>
    <Text style={styles.label}>{label}</Text>
    <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#9AA8B3" keyboardType={keyboardType} secureTextEntry={secureTextEntry} multiline={multiline} autoComplete={autoComplete} textContentType={textContentType} importantForAutofill={importantForAutofill} onFocus={onFocus} onBlur={onBlur} autoCapitalize={keyboardType === 'email-address' || secureTextEntry ? 'none' : undefined} autoCorrect={secureTextEntry || keyboardType === 'email-address' ? false : undefined} style={[styles.input, multiline && styles.multi]} />
  </View>;
}

export function SelectField({ label, valueLabel, placeholder = 'Select', onPress }) {
  return <View style={styles.wrap}>
    <Text style={styles.label}>{label}</Text>
    <Pressable style={styles.select} onPress={onPress}>
      <Text style={[styles.selectText, !valueLabel && styles.placeholder]} numberOfLines={1}>{valueLabel || placeholder}</Text>
      <Text style={styles.chevron}>⌄</Text>
    </Pressable>
  </View>;
}

export function PrimaryButton({ title, onPress, disabled, secondary, danger }) {
  return <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.button, secondary && styles.secondary, danger && styles.danger, disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
    <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{title}</Text>
  </Pressable>;
}

export function SectionTitle({ title, subtitle }) { return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{subtitle && <Text style={styles.sectionSub}>{subtitle}</Text>}</View>; }

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 }, label: { fontSize: 13, fontWeight: '800', color: colors.text, marginBottom: 6 }, input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 13, color: colors.text, fontSize: 15 }, multi: { minHeight: 84, textAlignVertical: 'top' }, select: { minHeight: 48, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 13, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, selectText: { color: colors.text, fontSize: 15, flex: 1 }, placeholder: { color: '#9AA8B3' }, chevron: { color: colors.primary, fontSize: 22, marginLeft: 10 }, button: { minHeight: 50, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, marginTop: 4, shadowColor: colors.shadow, shadowOpacity: .14, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2 }, buttonText: { color: '#fff', fontWeight: '900', fontSize: 15 }, secondary: { backgroundColor: colors.infoBg, borderWidth: 1, borderColor: '#BBDDF4', shadowOpacity: 0, elevation: 0 }, secondaryText: { color: colors.primaryDark }, danger: { backgroundColor: colors.danger }, disabled: { opacity: .45 }, pressed: { opacity: .85 }, section: { marginTop: 8, marginBottom: 12 }, sectionTitle: { fontSize: 20, fontWeight: '900', color: colors.text }, sectionSub: { color: colors.muted, marginTop: 3, lineHeight: 18 } });
