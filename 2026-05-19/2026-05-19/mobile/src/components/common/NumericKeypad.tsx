import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, Dimensions, Platform, Pressable,
} from 'react-native';

const { width: SW } = Dimensions.get('window');
const sc = (size: number) => (SW / 375) * size;

interface Props {
  visible: boolean;
  value: number;
  title?: string;
  subtitle?: string;
  quickValues?: number[];
  onConfirm: (value: number) => void;
  onClose: () => void;
  // Next/Prev receive the current display value so the parent can save
  // it without us calling onConfirm (which would close the keypad).
  onNext?: (value: number) => void;
  onPrev?: (value: number) => void;
  onChangeText?: (value: string) => void;
}

const DEFAULT_QUICK = [3, 5, 10, 12, 15, 20, 24, 25, 30, 48, 50];
const DEFAULT_KEY_ROWS: string[][] = [['1','2','3','⌫'], ['4','5','6','C'], ['7','8','9','✓'], ['0','','','']];

function NumericKeypadImpl({
  visible, value, title = 'Enter Quantity', subtitle, quickValues, onConfirm, onClose, onNext, onPrev, onChangeText,
}: Props) {
  const [display, setDisplay] = useState(value > 0 ? String(value) : '');
  const [minimized, setMinimized] = useState(false);
  const quicks = quickValues ?? DEFAULT_QUICK;

  useEffect(() => {
    if (visible) {
      setDisplay(value > 0 ? String(value) : '');
      setMinimized(false);
    }
  }, [visible, value]);

  // Helper: every place that changes the display also notifies the parent
  // via onChangeText so the parent can live-update its visible qty box.
  const updateDisplay = useCallback((next: string) => {
    setDisplay(next);
    if (onChangeText) onChangeText(next);
  }, [onChangeText]);

  const handleDigit = useCallback((d: string) => {
    setDisplay(prev => {
      if (prev === '0') return d;
      if (prev.length >= 6) return prev;
      const newDisplay = prev + d;
      if (onChangeText) onChangeText(newDisplay);
      return newDisplay;
    });
  }, [onChangeText]);

  const handleClear = useCallback(() => updateDisplay(''), [updateDisplay]);
  const handleBackspace = useCallback(() => {
    setDisplay(prev => {
      const next = prev.slice(0, -1);
      if (onChangeText) onChangeText(next);
      return next;
    });
  }, [onChangeText]);
  const handleQuick = useCallback((n: number) => updateDisplay(String(n)), [updateDisplay]);
  const handleConfirm = useCallback(() => onConfirm(parseInt(display, 10) || 0), [display, onConfirm]);
  const handleNext = useCallback(() => {
    // Pass the current typed value to the parent's onNext handler so it
    // can save the value AND advance to the next row WITHOUT closing the
    // keypad. Previously this called onConfirm which dismissed the
    // keypad — Next ended up acting like ✓ instead of advancing.
    const v = parseInt(display, 10) || 0;
    if (onNext) {
      onNext(v);
      // Reset display for the next row. The parent will repopulate via
      // the `value` prop on re-render.
      setDisplay('');
    }
  }, [display, onNext]);
  const handlePrev = useCallback(() => {
    const v = parseInt(display, 10) || 0;
    if (onPrev) {
      onPrev(v);
      setDisplay('');
    }
  }, [display, onPrev]);
  const toggleMin = useCallback(() => setMinimized(m => !m), []);

  const numericValue = parseInt(display, 10) || 0;
  const KEY_H = sc(36);

  // Bottom row: ◀ Prev | 0 | ✓ confirm | Next ▶ — all blue-themed to
  // match the app palette. Prev only renders when the parent provided
  // onPrev (older screens without prev still get the single Next).
  const keyRows = useMemo(() => {
    const bottom = onPrev ? ['◀','0','✓','▶'] : ['0','','✓','▶'];
    return [['1','2','3','⌫'], ['4','5','6','C'], ['7','8','9',''], bottom];
  }, [onPrev]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      hardwareAccelerated
      onRequestClose={onClose}
    >
      {visible ? (
      // Tap on the dimmed backdrop closes the keypad. Previously only
      // the small ✕ chip dismissed it, which field users frequently
      // missed — they'd tap "outside" and nothing happened.
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
          {/* Header with minimize/maximize toggle */}
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{title}</Text>
              {subtitle && !minimized ? <Text style={s.subtitle}>{subtitle}</Text> : null}
            </View>
            <TouchableOpacity onPress={toggleMin} style={s.toggleBtn}>
              <Text style={s.toggleBtnText}>{minimized ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <Text style={s.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Display — always visible */}
          <View style={s.displayBox}>
            <Text style={[s.displayText, !display && s.displayPlaceholder]}>
              {display || '0'}
            </Text>
          </View>

          {/* Minimized — just show Done button */}
          {minimized ? (
            <TouchableOpacity style={s.miniDoneBtn} onPress={handleConfirm} activeOpacity={0.8}>
              <Text style={s.miniDoneBtnText}>Done</Text>
            </TouchableOpacity>
          ) : (
            <>
              {/* Quick Values */}
              <View style={s.quickRow}>
                {quicks.map(n => (
                  <TouchableOpacity
                    key={n}
                    style={[s.quickBtn, numericValue === n && s.quickBtnActive]}
                    onPress={() => handleQuick(n)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.quickText, numericValue === n && s.quickTextActive]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Compact Keypad */}
              <View style={s.keypad}>
                {keyRows.map((row: string[], ri: number) => (
                  <View key={ri} style={s.keyRow}>
                    {row.map((k: string, ci: number) => {
                      if (!k) return <View key={ci} style={[s.key, { height: KEY_H, backgroundColor: 'transparent', borderColor: 'transparent' }]} />;
                      const isBackspace = k === '⌫';
                      const isClear = k === 'C';
                      const isCheck = k === '✓';
                      const isNext = k === '▶';
                      const isPrev = k === '◀';

                      return (
                        <TouchableOpacity
                          key={ci}
                          style={[
                            s.key, { height: KEY_H },
                            isBackspace && s.keyAction,
                            isClear && s.keyClear,
                            isCheck && s.keyConfirm,
                            isNext && s.keyNav,
                            isPrev && s.keyNav,
                          ]}
                          onPress={() => {
                            if (isBackspace) handleBackspace();
                            else if (isClear) handleClear();
                            else if (isCheck) handleConfirm();
                            else if (isNext) handleNext();
                            else if (isPrev) handlePrev();
                            else handleDigit(k);
                          }}
                          activeOpacity={0.6}
                        >
                          <Text style={[
                            s.keyText,
                            isBackspace && s.keyActionText,
                            isClear && s.keyClearText,
                            isCheck && s.keyConfirmText,
                            (isNext || isPrev) && s.keyNavText,
                          ]}>
                            {k}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
      ) : null}
    </Modal>
  );
}

export default memo(NumericKeypadImpl);

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: sc(16),
    borderTopRightRadius: sc(16),
    paddingBottom: Platform.OS === 'ios' ? 28 : sc(8),
    paddingTop: sc(10),
    paddingHorizontal: sc(10),
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: sc(6) },
  title: { fontSize: sc(13), fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: sc(10), color: '#6B7280', marginTop: 1 },
  toggleBtn: {
    width: sc(28), height: sc(28), borderRadius: sc(14),
    backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginRight: 6,
  },
  toggleBtnText: { fontSize: sc(12), color: '#1a3178' },
  closeBtn: {
    width: sc(28), height: sc(28), borderRadius: sc(14),
    backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { fontSize: sc(13), color: '#6B7280' },

  displayBox: {
    backgroundColor: '#F9FAFB', borderRadius: sc(8), borderWidth: 2, borderColor: '#1a56db',
    paddingVertical: sc(6), paddingHorizontal: sc(12), marginBottom: sc(6), alignItems: 'flex-end',
  },
  displayText: { fontSize: sc(22), fontWeight: '800', color: '#111827', fontVariant: ['tabular-nums'] },
  displayPlaceholder: { color: '#D1D5DB' },

  // Minimized done button
  miniDoneBtn: {
    backgroundColor: '#1a56db', borderRadius: sc(8), height: sc(38),
    alignItems: 'center', justifyContent: 'center', marginTop: sc(4),
  },
  miniDoneBtnText: { fontSize: sc(14), fontWeight: '700', color: '#FFFFFF' },

  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: sc(4), marginBottom: sc(6), justifyContent: 'center' },
  quickBtn: {
    paddingHorizontal: sc(8), paddingVertical: sc(4), borderRadius: sc(12),
    backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB',
  },
  quickBtnActive: { backgroundColor: '#1a56db', borderColor: '#1a56db' },
  quickText: { fontSize: sc(11), fontWeight: '600', color: '#374151' },
  quickTextActive: { color: '#FFFFFF' },

  keypad: { gap: sc(4) },
  keyRow: { flexDirection: 'row', gap: sc(4) },
  key: {
    flex: 1, borderRadius: sc(8), backgroundColor: '#F9FAFB',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  keyText: { fontSize: sc(16), fontWeight: '600', color: '#111827' },
  keyAction: { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
  keyActionText: { fontSize: sc(14), color: '#B45309' },
  keyClear: { backgroundColor: '#FEE2E2', borderColor: '#FECACA' },
  keyClearText: { fontSize: sc(13), fontWeight: '700', color: '#DC2626' },
  keyConfirm: { backgroundColor: '#1a56db', borderColor: '#1a56db' },
  keyConfirmText: { fontSize: sc(18), fontWeight: '700', color: '#FFFFFF' },
  // Prev (◀) + Next (▶) — both use the app's primary blue so the row
  // reads as a single navigation pair.
  keyNav: { backgroundColor: '#1a3178', borderColor: '#1a3178' },
  keyNavText: { fontSize: sc(18), fontWeight: '700', color: '#FFFFFF' },
});
