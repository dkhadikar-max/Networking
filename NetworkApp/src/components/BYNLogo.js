/**
 * BYNLogo — symbol-only mark (no text), light + dark variants.
 * Pure React Native (no react-native-svg dependency).
 * Usage:
 *   <BYNLogo size={32} />           // default light-bg variant
 *   <BYNLogo size={32} dark />      // dark-surface variant (white mark)
 *   <BYNLogo size={96} splash />    // splash variant (larger node dots)
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';

const PRIMARY   = '#0F766E';
const PRIMARY_S = '#14B8A6';
const WHITE     = '#FFFFFF';

export default function BYNLogo({ size = 32, dark = false, splash = false }) {
  const S = size;

  // Triangle geometry — equilateral, pointing up
  // Top node: center-top
  // Bottom-left: lower-left
  // Bottom-right: lower-right
  const nodeR   = splash ? S * 0.13 : S * 0.115;
  const lineW   = Math.max(1, S * 0.04);
  const dotColor = dark ? WHITE      : PRIMARY;
  const lineColor = dark ? 'rgba(255,255,255,0.55)' : PRIMARY_S;

  // Node centers (relative to container S×S)
  const top  = { x: S * 0.5,  y: S * 0.10 };
  const botL = { x: S * 0.10, y: S * 0.88 };
  const botR = { x: S * 0.90, y: S * 0.88 };

  return (
    <View style={{ width: S, height: S }} accessibilityLabel="Build Your Network logo" accessibilityRole="image">
      {/* ── Lines ── */}
      <Line from={top} to={botL} color={lineColor} lineW={lineW} containerSize={S} />
      <Line from={top} to={botR} color={lineColor} lineW={lineW} containerSize={S} />
      <Line from={botL} to={botR} color={lineColor} lineW={lineW} containerSize={S} />

      {/* ── Nodes ── */}
      <Node cx={top.x}  cy={top.y}  r={nodeR} color={dotColor} />
      <Node cx={botL.x} cy={botL.y} r={nodeR} color={dotColor} />
      <Node cx={botR.x} cy={botR.y} r={nodeR} color={dotColor} />
    </View>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function Node({ cx, cy, r, color }) {
  return (
    <View
      style={{
        position:        'absolute',
        width:           r * 2,
        height:          r * 2,
        borderRadius:    r,
        backgroundColor: color,
        left:            cx - r,
        top:             cy - r,
      }}
    />
  );
}

function Line({ from, to, color, lineW, containerSize: _S }) {
  const dx   = to.x - from.x;
  const dy   = to.y - from.y;
  const len  = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;

  return (
    <View
      style={{
        position:        'absolute',
        width:           len,
        height:          lineW,
        backgroundColor: color,
        borderRadius:    lineW / 2,
        left:            midX - len / 2,
        top:             midY - lineW / 2,
        transform:       [{ rotate: `${angle}deg` }],
      }}
    />
  );
}
