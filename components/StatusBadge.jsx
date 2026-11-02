import React from 'react';
import { Text } from 'react-native';
import { colors } from '../constants/theme';
export default function StatusBadge({ status }) { const delivered = status === 'delivered'; return <Text style={{ fontSize: 11, fontWeight: '900', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 12, overflow: 'hidden', backgroundColor: delivered ? colors.successBg : colors.warningBg, color: delivered ? colors.success : colors.warning }}>{delivered ? 'DELIVERED' : 'PENDING'}</Text>; }
