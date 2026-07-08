"use client";

// src/components/realEstate/charts/BarViz.tsx
// Primitivas de visualización reutilizables (comparativa + detalle de inversión).
// Sin librerías externas: barras horizontales con ancho proporcional (flex/CSS).
// NO calculan métricas: reciben valores ya calculados por calcResults().

import React from "react";
import { fmtEUR } from "@/src/lib/realEstateCalc";

export type Segment = {
  label: string;
  value: number;
  color: string;
};

// Paleta categórica sobria (alineada al theme financiero). Orden estable.
export const COMPOSITION_COLORS: Record<string, string> = {
  compra: "#1E4FA3",      // brand
  obra: "#3D6FC4",        // brand light
  estructura: "#6B8FD4",  // azul medio
  impuestos: "#B7791F",   // ámbar
  honorarios: "#B68D40",  // oro apagado
  mobiliario: "#97A2B3",  // slate
};

const clampPct = (n: number): number => Math.max(0, Math.min(100, n));

/**
 * Barra apilada horizontal de composición. Cada segmento >0 ocupa un ancho
 * proporcional a su valor sobre el total de segmentos visibles.
 */
export function StackedBar({ segments, height = 14 }: { segments: Segment[]; height?: number }) {
  const visible = segments.filter((s) => Number.isFinite(s.value) && s.value > 0);
  const total = visible.reduce((s, seg) => s + seg.value, 0);
  if (total <= 0) {
    return (
      <div
        className="w-full rounded-full bg-[var(--surface-alt)] border border-line"
        style={{ height }}
        aria-hidden
      />
    );
  }
  return (
    <div
      className="w-full flex rounded-full overflow-hidden border border-line"
      style={{ height }}
      role="img"
      aria-label={visible.map((s) => `${s.label}: ${fmtEUR(s.value)}`).join(", ")}
    >
      {visible.map((s, i) => (
        <div
          key={`${s.label}-${i}`}
          style={{ width: `${clampPct((s.value / total) * 100)}%`, background: s.color }}
          title={`${s.label} · ${fmtEUR(s.value)}`}
        />
      ))}
    </div>
  );
}

/** Leyenda de segmentos con importe y % del total. */
export function SegmentLegend({ segments }: { segments: Segment[] }) {
  const visible = segments.filter((s) => Number.isFinite(s.value) && s.value > 0);
  const total = visible.reduce((s, seg) => s + seg.value, 0);
  if (total <= 0) return null;
  return (
    <ul className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 mt-3">
      {visible.map((s, i) => (
        <li key={`${s.label}-${i}`} className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: s.color }} aria-hidden />
          <span className="text-[11px] text-ink-subtle truncate">{s.label}</span>
          <span className="text-[11px] font-semibold text-ink tabular-nums ml-auto whitespace-nowrap">
            {fmtEUR(s.value)}
            <span className="text-ink-subtle font-normal"> · {Math.round((s.value / total) * 100)}%</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export type CompareItem = {
  id: string;
  name: string;
  value: number;
  isBest?: boolean;
  isDraft?: boolean;
};

/**
 * Grupo de barras horizontales para comparar una métrica entre inversiones.
 * Escala por el máximo valor absoluto; soporta negativos (rojo). El "mejor"
 * se resalta. `format` recibe el valor crudo y devuelve el texto mostrado.
 */
export function CompareBars({
  items,
  format,
  onOpen,
}: {
  items: CompareItem[];
  format: (v: number) => string;
  onOpen?: (id: string) => void;
}) {
  const scale = Math.max(1, ...items.map((it) => Math.abs(it.value)).filter((v) => Number.isFinite(v)));
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((it) => {
        const w = clampPct((Math.abs(it.value) / scale) * 100);
        const neg = it.value < 0;
        const bg = it.isBest ? "var(--positive)" : neg ? "var(--negative)" : "var(--brand)";
        return (
          <div key={it.id} className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpen ? () => onOpen(it.id) : undefined}
              disabled={!onOpen}
              className={`w-24 sm:w-28 shrink-0 text-left text-[11px] font-medium truncate ${
                onOpen ? "text-ink hover:text-brand cursor-pointer" : "text-ink"
              }`}
              title={it.name}
            >
              {it.name}
              {it.isDraft ? <span className="text-amber-600"> ·</span> : null}
            </button>
            <div className="flex-1 min-w-0 h-5 rounded-md bg-[var(--surface-alt)] border border-line overflow-hidden relative">
              <div
                className="h-full rounded-md bar-anim"
                style={{ width: `${Math.max(w, it.value === 0 ? 0 : 3)}%`, background: bg }}
              />
            </div>
            <span
              className="w-20 sm:w-24 shrink-0 text-right text-[11px] font-bold tabular-nums"
              style={{ color: it.isBest ? "var(--positive)" : neg ? "var(--negative)" : "var(--ink)" }}
            >
              {format(it.value)}
              {it.isBest ? <span className="text-[9px] text-emerald-600"> ★</span> : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Tarjeta KPI de "ganador" para una métrica concreta. */
export function WinnerCard({
  label,
  opName,
  value,
  tone = "brand",
}: {
  label: string;
  opName: string;
  value: string;
  tone?: "positive" | "brand" | "info";
}) {
  const color =
    tone === "positive" ? "var(--positive)" : tone === "info" ? "var(--brand)" : "var(--ink)";
  return (
    <div className="re-card p-3 min-w-0">
      <p className="text-[10px] uppercase tracking-wide font-bold text-ink-subtle truncate">{label}</p>
      <p className="text-lg font-extrabold tabular-nums leading-tight mt-0.5" style={{ color }}>
        {value}
      </p>
      <p className="text-[11px] text-ink-muted truncate mt-0.5" title={opName}>
        {opName}
      </p>
    </div>
  );
}
