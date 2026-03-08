"use client";

import { useState, useRef, Fragment } from "react";
import {
  formatNumberES,
  parseEURInput,
  getMonthExpected,
  getMonthBase,
  getFinanceChipClass,
  FIN_COLORS,
  type ForecastLineFull,
} from "@/src/lib/finance/financeData";
import { updateForecastMonthPrev } from "@/src/lib/finance/financeApi";

// ==================== TYPES ====================

interface ForecastEditorModalProps {
  open: boolean;
  onClose: () => void;
  forecastLines: ForecastLineFull[];
  onForecastLinesChange: React.Dispatch<React.SetStateAction<ForecastLineFull[]>>;
}

// ==================== FORECAST PREV CELL ====================

function ForecastPrevCell({
  lineId,
  monthId,
  type,
  value,
  onSave,
}: {
  lineId: string;
  monthId: string;
  type: "INGRESO" | "GASTO";
  value: number;
  onSave: (newVal: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setDraft(String(value));
    setEditing(true);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  };

  const handleSave = async () => {
    const parsed = parseEURInput(draft);
    if (parsed !== null && parsed !== value) {
      await onSave(parsed);
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="w-full h-8 px-2 text-sm tabular-nums text-right text-slate-800 bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-slate-400"
      />
    );
  }

  return (
    <button
      onClick={startEdit}
      className="w-full h-8 px-2 text-sm tabular-nums font-medium text-right text-slate-800 hover:bg-slate-100 rounded transition-colors"
    >
      {formatNumberES(value)}
    </button>
  );
}

// ==================== MAIN COMPONENT ====================

const MONTH_ABBR = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export function ForecastEditorModal({
  open,
  onClose,
  forecastLines,
  onForecastLinesChange,
}: ForecastEditorModalProps) {
  const [forecastEditorYear, setForecastEditorYear] = useState(() => new Date().getFullYear());
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedLeafIds, setSelectedLeafIds] = useState<string[]>([]);
  const [showIncome, setShowIncome] = useState(true);
  const [showExpense, setShowExpense] = useState(true);
  const [showTotal, setShowTotal] = useState(true);
  const [showRowReal, setShowRowReal] = useState(true);
  const [showRowPrev, setShowRowPrev] = useState(true);
  const [showRowDiff, setShowRowDiff] = useState(true);

  // Escape key
  // (handled at parent level or here — keeping it here for self-containment)
  // Parent already had an effect for this; we replicate for isolation
  // Actually, since modal is rendered conditionally with open prop, we rely on backdrop click + close button

  if (!open) return null;

  const forecastEditorMonthIds = Array.from({ length: 12 }, (_, i) =>
    `${forecastEditorYear}-${String(i + 1).padStart(2, "0")}`
  );

  const forecastGroups = forecastLines.filter((fl) => {
    const isParent = fl.parentId === null || fl.parentId === undefined;
    const hasChildren = forecastLines.some((other) => other.parentId === fl.id);
    return isParent && hasChildren;
  });

  const singletonLines = forecastLines.filter((fl) => {
    const isParent = fl.parentId === null || fl.parentId === undefined;
    const hasChildren = forecastLines.some((other) => other.parentId === fl.id);
    return isParent && !hasChildren;
  });

  const allChips = [...forecastGroups, ...singletonLines];
  const effectiveSelectedIds = selectedGroupIds.length > 0 ? selectedGroupIds : allChips.map((c) => c.id);

  const getGroupChildren = (groupId: string): ForecastLineFull[] => {
    const children = forecastLines.filter((fl) => fl.parentId === groupId);
    if (children.length > 0) return children;
    const singleton = forecastLines.find((fl) => fl.id === groupId);
    return singleton ? [singleton] : [];
  };

  const sourceBlocks = effectiveSelectedIds.map((groupId) => {
    const group = allChips.find((c) => c.id === groupId);
    const items = getGroupChildren(groupId);
    return { id: groupId, title: group?.name || groupId, items };
  });

  const allLeafIds = sourceBlocks.flatMap((sb) => sb.items.map((item) => item.id));
  const effectiveLeafIds = selectedLeafIds.length > 0
    ? selectedLeafIds.filter((id) => allLeafIds.includes(id))
    : allLeafIds;

  const getLineById = (id: string): ForecastLineFull | undefined =>
    forecastLines.find((fl) => fl.id === id);

  const computeReal = (lineId: string, monthId: string, type: "INGRESO" | "GASTO"): number => {
    const line = forecastLines.find((fl) => fl.id === lineId);
    if (!line) return 0;
    return getMonthBase(line, monthId, type);
  };

  const getPrev = (line: ForecastLineFull, monthId: string, type: "INGRESO" | "GASTO"): number => {
    return getMonthExpected(line, monthId, type);
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-2"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-[95vw] max-h-[95vh] rounded-xl border border-slate-200 shadow-lg flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 flex-shrink-0">
          {/* Row 1: Year selector + close */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setForecastEditorYear((y) => y - 1)}
                className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm"
              >
                ‹
              </button>
              <span className="text-base font-semibold text-slate-800 min-w-[50px] text-center">
                {forecastEditorYear}
              </span>
              <button
                onClick={() => setForecastEditorYear((y) => y + 1)}
                className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm"
              >
                ›
              </button>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 text-lg leading-none"
            >
              ×
            </button>
          </div>

          {/* Row 2: Source blocks */}
          {sourceBlocks.length > 0 && (
            <div className="overflow-x-auto mb-3">
              <div className="inline-flex items-center gap-4 whitespace-nowrap pb-1">
                {sourceBlocks.map((block) => (
                  <div key={block.id} className="inline-flex items-center gap-1.5">
                    <span className="text-sm font-bold text-slate-900">{block.title}:</span>
                    {block.items.map((item) => {
                      const isActive = effectiveLeafIds.includes(item.id);
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            setSelectedLeafIds((prev) => {
                              if (prev.length === 0) {
                                return allLeafIds.filter((id) => id !== item.id);
                              }
                              return prev.includes(item.id)
                                ? prev.filter((id) => id !== item.id)
                                : [...prev, item.id];
                            });
                          }}
                          className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                            isActive ? FIN_COLORS.sourceChipActive : FIN_COLORS.sourceChipInactive
                          }`}
                        >
                          {item.name}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Row 3: Filters */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium text-slate-500">Columnas:</span>
              <button onClick={() => setShowExpense((v) => !v)} className={getFinanceChipClass({ variant: "GASTO", selected: showExpense })}>Gasto</button>
              <button onClick={() => setShowIncome((v) => !v)} className={getFinanceChipClass({ variant: "INGRESO", selected: showIncome })}>Ingreso</button>
              <button onClick={() => setShowTotal((v) => !v)} className={getFinanceChipClass({ variant: "TOTAL", selected: showTotal })}>Total</button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium text-slate-500">Filas:</span>
              <button onClick={() => setShowRowReal((v) => !v)} className={getFinanceChipClass({ variant: "REAL", selected: showRowReal })}>Real</button>
              <button onClick={() => setShowRowPrev((v) => !v)} className={getFinanceChipClass({ variant: "PREV", selected: showRowPrev })}>Previsión</button>
              <button onClick={() => setShowRowDiff((v) => !v)} className={getFinanceChipClass({ variant: "DIF", selected: showRowDiff })}>Diferencia</button>
            </div>
          </div>
        </div>

        {/* Excel Table Content */}
        <div className="flex-1 overflow-auto">
          {effectiveLeafIds.length === 0 ? (
            <div className="flex-1 h-full flex items-center justify-center text-slate-400 text-sm">
              Selecciona al menos una fuente
            </div>
          ) : (
            <div className="inline-block min-w-full">
            <table className="border-collapse">
              <thead className="sticky top-0 z-40">
                <tr className="bg-slate-50 h-10">
                  <th className="sticky left-0 z-50 bg-slate-50 w-[72px] min-w-[72px] border-b border-r border-slate-200 whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]" />
                  <th className="sticky left-[72px] z-50 bg-slate-50 w-[60px] min-w-[60px] border-b border-r border-slate-200/60 whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]" />
                  {effectiveLeafIds.map((leafId) => {
                    const line = getLineById(leafId);
                    const colCount = (showExpense ? 1 : 0) + (showIncome ? 1 : 0) + (showTotal ? 1 : 0);
                    return (
                      <th key={leafId} colSpan={colCount} className="bg-slate-50 border-b border-r border-slate-300/70 text-sm font-bold text-slate-900 px-2 whitespace-nowrap">
                        {line?.name || leafId}
                      </th>
                    );
                  })}
                  <th colSpan={(showExpense ? 1 : 0) + (showIncome ? 1 : 0) + (showTotal ? 1 : 0)} className="bg-slate-100 border-b border-l-2 border-l-slate-300 border-slate-200 text-sm font-bold text-slate-800 px-2 whitespace-nowrap">
                    TOTAL
                  </th>
                </tr>
                <tr className="bg-slate-50 h-7">
                  <th className="sticky left-0 z-50 bg-slate-50 w-[72px] min-w-[72px] border-b border-r border-slate-200 text-xs font-medium text-slate-500 text-left px-2 whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">Mes</th>
                  <th className="sticky left-[72px] z-50 bg-slate-50 w-[60px] min-w-[60px] border-b border-r border-slate-200/60 text-xs font-medium text-slate-500 text-left px-2 whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">Tipo</th>
                  {effectiveLeafIds.map((leafId) => (
                    <Fragment key={leafId}>
                      {showExpense && <th className={`bg-slate-50 min-w-[72px] border-b border-r border-slate-200/40 text-xs font-semibold px-2 whitespace-nowrap ${FIN_COLORS.gasto.label}`}>gast</th>}
                      {showIncome && <th className={`bg-slate-50 min-w-[72px] border-b border-r border-slate-200/40 text-xs font-semibold px-2 whitespace-nowrap ${FIN_COLORS.ingreso.label}`}>ing</th>}
                      {showTotal && <th className={`bg-slate-50 min-w-[72px] border-b border-r border-slate-300/60 text-xs font-semibold px-2 whitespace-nowrap ${FIN_COLORS.total.label}`}>total</th>}
                    </Fragment>
                  ))}
                  {showExpense && <th className={`bg-slate-100 min-w-[72px] border-b border-l-2 border-l-slate-300 border-r border-slate-200/40 text-xs font-semibold px-2 whitespace-nowrap ${FIN_COLORS.gasto.label}`}>gast</th>}
                  {showIncome && <th className={`bg-slate-100 min-w-[72px] border-b border-r border-slate-200/40 text-xs font-semibold px-2 whitespace-nowrap ${FIN_COLORS.ingreso.label}`}>ing</th>}
                  {showTotal && <th className={`bg-slate-100 min-w-[72px] border-b border-slate-200 text-xs font-semibold px-2 whitespace-nowrap ${FIN_COLORS.total.label}`}>total</th>}
                </tr>
              </thead>
              <tbody>
                {forecastEditorMonthIds.map((monthId, mIdx) => {
                  let totalRealGas = 0, totalRealIng = 0, totalPrevGas = 0, totalPrevIng = 0;
                  effectiveLeafIds.forEach((leafId) => {
                    const line = getLineById(leafId);
                    if (line) {
                      totalRealGas += computeReal(leafId, monthId, "GASTO");
                      totalRealIng += computeReal(leafId, monthId, "INGRESO");
                      totalPrevGas += getPrev(line, monthId, "GASTO");
                      totalPrevIng += getPrev(line, monthId, "INGRESO");
                    }
                  });
                  const totalRealTotal = totalRealIng - totalRealGas;
                  const totalPrevTotal = totalPrevIng - totalPrevGas;
                  const totalDifGas = totalRealGas - totalPrevGas;
                  const totalDifIng = totalRealIng - totalPrevIng;
                  const totalDifTotal = totalRealTotal - totalPrevTotal;
                  const monthBg = mIdx % 2 === 0 ? "" : "bg-slate-50/40";
                  const monthBgColor = mIdx % 2 === 0 ? "#fff" : "#f8fafc";
                  const visibleRowCount = (showRowReal ? 1 : 0) + (showRowPrev ? 1 : 0) + (showRowDiff ? 1 : 0);
                  let monthCellRendered = false;

                  return (
                    <Fragment key={monthId}>
                      {showRowReal && (
                        <tr className={`h-8 ${monthBg} border-t-2 border-slate-200`}>
                          {!monthCellRendered && (() => { monthCellRendered = true; return (
                            <td rowSpan={visibleRowCount} className="sticky left-0 z-30 w-[72px] min-w-[72px] border-r border-slate-200 text-sm font-semibold text-slate-700 text-center align-middle whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]" style={{ backgroundColor: monthBgColor }}>
                              {MONTH_ABBR[mIdx]}
                            </td>
                          ); })()}
                          <td className="sticky left-[72px] z-30 w-[60px] min-w-[60px] border-r border-slate-200/60 text-xs font-semibold px-2 whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] text-slate-900" style={{ backgroundColor: monthBgColor }}>real</td>
                          {effectiveLeafIds.map((leafId) => {
                            const line = getLineById(leafId);
                            const realGas = line ? computeReal(leafId, monthId, "GASTO") : 0;
                            const realIng = line ? computeReal(leafId, monthId, "INGRESO") : 0;
                            const realTotal = realIng - realGas;
                            return (
                              <Fragment key={leafId}>
                                {showExpense && <td className="min-w-[72px] px-2 text-sm tabular-nums text-slate-800 text-right border-r border-slate-200/40 whitespace-nowrap">{formatNumberES(realGas)}</td>}
                                {showIncome && <td className="min-w-[72px] px-2 text-sm tabular-nums text-slate-800 text-right border-r border-slate-200/40 whitespace-nowrap">{formatNumberES(realIng)}</td>}
                                {showTotal && <td className="min-w-[72px] px-2 text-sm tabular-nums text-slate-800 text-right border-r border-slate-300/60 whitespace-nowrap">{formatNumberES(realTotal)}</td>}
                              </Fragment>
                            );
                          })}
                          {showExpense && <td className="min-w-[72px] px-2 text-sm tabular-nums font-semibold text-slate-800 text-right bg-slate-50 border-l-2 border-l-slate-300 border-r border-slate-200/40 whitespace-nowrap">{formatNumberES(totalRealGas)}</td>}
                          {showIncome && <td className="min-w-[72px] px-2 text-sm tabular-nums font-semibold text-slate-800 text-right bg-slate-50 border-r border-slate-200/40 whitespace-nowrap">{formatNumberES(totalRealIng)}</td>}
                          {showTotal && <td className="min-w-[72px] px-2 text-sm tabular-nums font-semibold text-slate-800 text-right bg-slate-50 whitespace-nowrap">{formatNumberES(totalRealTotal)}</td>}
                        </tr>
                      )}

                      {showRowPrev && (
                        <tr className={`h-8 ${monthBg}`}>
                          {!monthCellRendered && (() => { monthCellRendered = true; return (
                            <td rowSpan={visibleRowCount} className="sticky left-0 z-30 w-[72px] min-w-[72px] border-r border-slate-200 text-sm font-semibold text-slate-700 text-center align-middle whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]" style={{ backgroundColor: monthBgColor }}>
                              {MONTH_ABBR[mIdx]}
                            </td>
                          ); })()}
                          <td className="sticky left-[72px] z-30 w-[60px] min-w-[60px] border-r border-slate-200/60 text-xs font-semibold px-2 whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] text-slate-900" style={{ backgroundColor: monthBgColor }}>prev</td>
                          {effectiveLeafIds.map((leafId) => {
                            const line = getLineById(leafId);
                            const prevGas = line ? getPrev(line, monthId, "GASTO") : 0;
                            const prevIng = line ? getPrev(line, monthId, "INGRESO") : 0;
                            const prevTotal = prevIng - prevGas;
                            return (
                              <Fragment key={leafId}>
                                {showExpense && (
                                  <td className="min-w-[72px] px-0 border-r border-slate-200/40">
                                    <ForecastPrevCell lineId={leafId} monthId={monthId} type="GASTO" value={prevGas} onSave={async (newVal) => {
                                      const result = await updateForecastMonthPrev(leafId, monthId, "GASTO", newVal);
                                      if (!result.error) {
                                        onForecastLinesChange((prev) => prev.map((fl) =>
                                          fl.id === leafId ? { ...fl, months: { ...(fl.months || {}), [monthId]: { ...(fl.months?.[monthId] || {}), GASTO: { ...(fl.months?.[monthId]?.GASTO || {}), expected: newVal } } } } : fl
                                        ));
                                      }
                                    }} />
                                  </td>
                                )}
                                {showIncome && (
                                  <td className="min-w-[72px] px-0 border-r border-slate-200/40">
                                    <ForecastPrevCell lineId={leafId} monthId={monthId} type="INGRESO" value={prevIng} onSave={async (newVal) => {
                                      const result = await updateForecastMonthPrev(leafId, monthId, "INGRESO", newVal);
                                      if (!result.error) {
                                        onForecastLinesChange((prev) => prev.map((fl) =>
                                          fl.id === leafId ? { ...fl, months: { ...(fl.months || {}), [monthId]: { ...(fl.months?.[monthId] || {}), INGRESO: { ...(fl.months?.[monthId]?.INGRESO || {}), expected: newVal } } } } : fl
                                        ));
                                      }
                                    }} />
                                  </td>
                                )}
                                {showTotal && <td className="min-w-[72px] px-2 text-sm tabular-nums text-slate-800 text-right border-r border-slate-300/60 whitespace-nowrap">{formatNumberES(prevTotal)}</td>}
                              </Fragment>
                            );
                          })}
                          {showExpense && <td className="min-w-[72px] px-2 text-sm tabular-nums font-semibold text-slate-800 text-right bg-slate-50 border-l-2 border-l-slate-300 border-r border-slate-200/40 whitespace-nowrap">{formatNumberES(totalPrevGas)}</td>}
                          {showIncome && <td className="min-w-[72px] px-2 text-sm tabular-nums font-semibold text-slate-800 text-right bg-slate-50 border-r border-slate-200/40 whitespace-nowrap">{formatNumberES(totalPrevIng)}</td>}
                          {showTotal && <td className="min-w-[72px] px-2 text-sm tabular-nums font-semibold text-slate-800 text-right bg-slate-50 whitespace-nowrap">{formatNumberES(totalPrevTotal)}</td>}
                        </tr>
                      )}

                      {showRowDiff && (
                        <tr className={`h-8 ${monthBg} border-b border-slate-300`}>
                          {!monthCellRendered && (() => { monthCellRendered = true; return (
                            <td rowSpan={visibleRowCount} className="sticky left-0 z-30 w-[72px] min-w-[72px] border-r border-slate-200 text-sm font-semibold text-slate-700 text-center align-middle whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]" style={{ backgroundColor: monthBgColor }}>
                              {MONTH_ABBR[mIdx]}
                            </td>
                          ); })()}
                          <td className="sticky left-[72px] z-30 w-[60px] min-w-[60px] border-r border-slate-200/60 text-xs font-semibold px-2 whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] text-slate-900" style={{ backgroundColor: monthBgColor }}>dif</td>
                          {effectiveLeafIds.map((leafId) => {
                            const line = getLineById(leafId);
                            const realGas = line ? computeReal(leafId, monthId, "GASTO") : 0;
                            const realIng = line ? computeReal(leafId, monthId, "INGRESO") : 0;
                            const prevGas = line ? getPrev(line, monthId, "GASTO") : 0;
                            const prevIng = line ? getPrev(line, monthId, "INGRESO") : 0;
                            const difGas = realGas - prevGas;
                            const difIng = realIng - prevIng;
                            const difTotal = (realIng - realGas) - (prevIng - prevGas);
                            return (
                              <Fragment key={leafId}>
                                {showExpense && <td className="min-w-[72px] px-2 text-sm tabular-nums font-semibold text-right text-slate-800 border-r border-slate-200/40 whitespace-nowrap">{formatNumberES(difGas)}</td>}
                                {showIncome && <td className="min-w-[72px] px-2 text-sm tabular-nums font-semibold text-right text-slate-800 border-r border-slate-200/40 whitespace-nowrap">{formatNumberES(difIng)}</td>}
                                {showTotal && <td className="min-w-[72px] px-2 text-sm tabular-nums font-semibold text-right text-slate-800 border-r border-slate-300/60 whitespace-nowrap">{formatNumberES(difTotal)}</td>}
                              </Fragment>
                            );
                          })}
                          {showExpense && <td className="min-w-[72px] px-2 text-sm tabular-nums font-semibold text-right text-slate-800 bg-slate-50 border-l-2 border-l-slate-300 border-r border-slate-200/40 whitespace-nowrap">{formatNumberES(totalDifGas)}</td>}
                          {showIncome && <td className="min-w-[72px] px-2 text-sm tabular-nums font-semibold text-right text-slate-800 bg-slate-50 border-r border-slate-200/40 whitespace-nowrap">{formatNumberES(totalDifIng)}</td>}
                          {showTotal && <td className="min-w-[72px] px-2 text-sm tabular-nums font-semibold text-right text-slate-800 bg-slate-50 whitespace-nowrap">{formatNumberES(totalDifTotal)}</td>}
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-slate-200 flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
