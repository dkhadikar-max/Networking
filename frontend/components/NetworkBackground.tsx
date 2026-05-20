"use client";

import { useEffect, useRef } from "react";

interface NodeData {
  x: number;
  y: number;
  baseRadius: number;
  radius: number;
  vx: number;
  vy: number;
  color: string;
  pulsePhase: number;
  pulseSpeed: number;
  opacity: number;
}

// Reduced count + precomputed squared threshold avoids per-frame sqrt
const NODE_COUNT = 28;
const CONN_DIST = 160;
const CONN_DIST_SQ = CONN_DIST * CONN_DIST;
const MAX_CONNECTIONS = 3;
const NODE_COLORS = ["#14B8A6", "#F4A261", "#2DD4BF"];
const TARGET_FPS = 30;
const FRAME_MS = 1000 / TARGET_FPS;

export default function NetworkBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef<{ x: number | null; y: number | null }>({ x: null, y: null });
  const animationRef = useRef<number>(0);
  const nodesRef = useRef<NodeData[]>([]);
  const lastFrameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;

    const init = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      nodesRef.current = [];
      for (let i = 0; i < NODE_COUNT; i++) {
        nodesRef.current.push({
          x: Math.random() * width,
          y: Math.random() * height,
          baseRadius: Math.random() * 2.5 + 1.5,
          radius: Math.random() * 2.5 + 1.5,
          vx: (Math.random() - 0.5) * 0.35,
          vy: (Math.random() - 0.5) * 0.35,
          color: NODE_COLORS[Math.floor(Math.random() * NODE_COLORS.length)],
          pulsePhase: Math.random() * Math.PI * 2,
          pulseSpeed: 0.018 + Math.random() * 0.018,
          opacity: 0.35 + Math.random() * 0.45,
        });
      }
    };

    const drawConnections = () => {
      const nodes = nodesRef.current;
      for (let i = 0; i < nodes.length; i++) {
        let connections = 0;
        for (let j = i + 1; j < nodes.length; j++) {
          if (connections >= MAX_CONNECTIONS) break;
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const distSq = dx * dx + dy * dy;
          if (distSq < CONN_DIST_SQ) {
            const dist = Math.sqrt(distSq);
            const alpha = ((1 - dist / CONN_DIST) * 0.25).toFixed(2);
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            // Solid averaged color instead of per-frame gradient object
            ctx.strokeStyle = nodes[i].color + "40";
            ctx.globalAlpha = parseFloat(alpha);
            ctx.lineWidth = 0.8;
            ctx.stroke();
            ctx.globalAlpha = 1;
            connections++;
          }
        }
      }
    };

    const animate = (now: number) => {
      animationRef.current = requestAnimationFrame(animate);
      if (now - lastFrameRef.current < FRAME_MS) return;
      lastFrameRef.current = now;

      ctx.clearRect(0, 0, width, height);
      drawConnections();

      const mouse = mouseRef.current;
      nodesRef.current.forEach((node) => {
        node.x += node.vx;
        node.y += node.vy;
        if (node.x < -50) node.x = width + 50;
        if (node.x > width + 50) node.x = -50;
        if (node.y < -50) node.y = height + 50;
        if (node.y > height + 50) node.y = -50;

        node.pulsePhase += node.pulseSpeed;
        node.radius = node.baseRadius + Math.sin(node.pulsePhase) * 1.2;

        if (mouse.x !== null && mouse.y !== null) {
          const dx = mouse.x - node.x;
          const dy = mouse.y - node.y;
          const distSq = dx * dx + dy * dy;
          if (distSq < 62500) { // 250²
            const dist = Math.sqrt(distSq);
            const force = ((250 - dist) / 250) * 0.015;
            node.vx += dx * force * 0.01;
            node.vy += dy * force * 0.01;
          }
        }

        node.vx *= 0.999;
        node.vy *= 0.999;
        if (Math.abs(node.vx) < 0.05 && Math.abs(node.vy) < 0.05) {
          node.vx += (Math.random() - 0.5) * 0.04;
          node.vy += (Math.random() - 0.5) * 0.04;
        }

        // Simple soft glow: one semi-transparent larger circle + solid core — no createRadialGradient
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius * 3.5, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.globalAlpha = node.opacity * 0.12;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.globalAlpha = node.opacity;
        ctx.fill();

        ctx.globalAlpha = 1;
      });
    };

    const handleMouseMove = (e: MouseEvent) => { mouseRef.current = { x: e.clientX, y: e.clientY }; };
    const handleMouseLeave = () => { mouseRef.current = { x: null, y: null }; };
    const handleResize = () => { init(); };

    init();
    animationRef.current = requestAnimationFrame(animate);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationRef.current);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed top-0 left-0 w-full h-full z-0"
      style={{ background: "var(--teal-dark)" }}
    />
  );
}
