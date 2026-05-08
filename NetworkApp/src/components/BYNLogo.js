/**
 * BYNLogo — matches the actual app icon exactly.
 *
 * Logo geometry (from 100×100 viewBox in upgrade.html SVG):
 *   Top-left node  at (37, 35): teal, small   — r_outer=13, r_inner=8
 *   Bottom-left    at (37, 64): orange, medium — r_outer=11, r_inner=6.5
 *   Right          at (65, 52): teal, large    — r_outer=17, r_inner=11
 *   Lines: thick white strokes connecting all three nodes
 *
 * All coordinates and radii scale linearly with `size`.
 *
 * Usage:
 *   <BYNLogo size={32} />        // symbol on light bg (lines in teal)
 *   <BYNLogo size={32} dark />   // symbol on dark bg (lines in white)
 *   <BYNLogo size={32} onTeal /> // symbol on teal bg (lines + nodes white)
 */
import React from 'react';
import { View } from 'react-native';

const TEAL   = '#0F766E';
const ORANGE = '#F97316';
const WHITE  = '#FFFFFF';

// Geometry constants in 100-unit space — mirrors the SVG in upgrade.html exactly
const GEO = {
  topL:  { x: 37, y: 35, rO: 13,  rI: 8,   fill: TEAL   },
  botL:  { x: 37, y: 64, rO: 11,  rI: 6.5, fill: ORANGE },
  right: { x: 65, y: 52, rO: 17,  rI: 11,  fill: TEAL   },
  lineW: 6.5,
};

function sc(val, size) { return (val / 100) * size; }

function ScaledLine({ from, to, lineW, color, size }) {
  const x1 = sc(from.x, size);
  const y1 = sc(from.y, size);
  const x2 = sc(to.x,   size);
  const y2 = sc(to.y,   size);

  const dx    = x2 - x1;
  const dy    = y2 - y1;
  const len   = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  const midX  = (x1 + x2) / 2;
  const midY  = (y1 + y2) / 2;
  const lw    = sc(lineW, size);

  return (
    <View
      style={{
        position:        'absolute',
        width:           len,
        height:          lw,
        backgroundColor: color,
        borderRadius:    lw / 2,
        left:            midX - len / 2,
        top:             midY - lw / 2,
        transform:       [{ rotate: `${angle}deg` }],
      }}
    />
  );
}

function ScaledNode({ node, size, onTeal }) {
  const cx     = sc(node.x,  size);
  const cy     = sc(node.y,  size);
  const rOuter = sc(node.rO, size);
  const rInner = sc(node.rI, size);
  // On teal backgrounds every node renders as white
  const dotColor = onTeal ? WHITE : node.fill;

  return (
    <>
      {/* White halo ring */}
      <View
        style={{
          position:        'absolute',
          width:           rOuter * 2,
          height:          rOuter * 2,
          borderRadius:    rOuter,
          backgroundColor: WHITE,
          left:            cx - rOuter,
          top:             cy - rOuter,
        }}
      />
      {/* Colored fill dot */}
      <View
        style={{
          position:        'absolute',
          width:           rInner * 2,
          height:          rInner * 2,
          borderRadius:    rInner,
          backgroundColor: dotColor,
          left:            cx - rInner,
          top:             cy - rInner,
        }}
      />
    </>
  );
}

export default function BYNLogo({ size = 32, dark = false, onTeal = false }) {
  // Lines: white on teal/dark backgrounds, teal-medium on light backgrounds
  const lineColor = (dark || onTeal) ? WHITE : '#14B8A6';

  const nodes = [GEO.topL, GEO.botL, GEO.right];
  const edges = [
    { from: GEO.topL, to: GEO.right },
    { from: GEO.topL, to: GEO.botL  },
    { from: GEO.botL, to: GEO.right },
  ];

  return (
    <View
      style={{ width: size, height: size }}
      accessibilityLabel="Build Your Network"
      accessibilityRole="image"
    >
      {/* Lines rendered behind nodes */}
      {edges.map((e, i) => (
        <ScaledLine
          key={i}
          from={e.from}
          to={e.to}
          lineW={GEO.lineW}
          color={lineColor}
          size={size}
        />
      ))}

      {/* Nodes rendered on top of lines */}
      {nodes.map((n, i) => (
        <ScaledNode key={i} node={n} size={size} onTeal={onTeal} />
      ))}
    </View>
  );
}
