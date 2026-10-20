// Gráfico de barras por día en SVG puro (sin librerías). Presentacional y determinista.
import type { DailyMetric } from "@/lib/admin/types";
import { formatClp } from "@/lib/format";
import { compactClp, shortDay } from "./format";
import ui from "./admin.module.css";

const W = 720;
const H = 260;
const PAD = { left: 64, right: 12, top: 12, bottom: 32 };

/** Redondea el máximo a un valor "bonito" para el eje (1, 2, 5 × 10^n). */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(value)));
  const f = value / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * exp;
}

export function DailyChart({ days }: { days: readonly DailyMetric[] }) {
  const max = niceMax(Math.max(...days.map((d) => d.revenue), 0));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / days.length;
  const barW = Math.max(2, slot * 0.7);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const labelEvery = Math.ceil(days.length / 8);
  const total = days.reduce((s, d) => s + d.revenue, 0);

  return (
    <figure style={{ margin: 0 }}>
      <svg
        className={ui.chart}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Gráfico de barras de ventas netas por día. ${days.length} días, total ${formatClp(total)}. Hay una tabla con los mismos datos debajo.`}
      >
        {ticks.map((t) => {
          const y = PAD.top + innerH * (1 - t);
          return (
            <g key={t}>
              <line className={ui.chartGrid} x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} />
              <text className={ui.chartText} x={PAD.left - 6} y={y + 4} textAnchor="end">
                {compactClp(max * t)}
              </text>
            </g>
          );
        })}
        {days.map((d, i) => {
          const h = Math.max(0, (Math.max(d.revenue, 0) / max) * innerH);
          const x = PAD.left + i * slot + (slot - barW) / 2;
          return (
            <g key={d.date}>
              <rect className={ui.chartBar} x={x} y={PAD.top + innerH - h} width={barW} height={h} rx={1.5}>
                <title>{`${shortDay(d.date)}: ${formatClp(d.revenue)} (${d.ordersCount} pedidos)`}</title>
              </rect>
              {i % labelEvery === 0 ? (
                <text className={ui.chartText} x={x + barW / 2} y={H - 10} textAnchor="middle">
                  {shortDay(d.date)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <figcaption className={ui.help}>Ventas netas por día (día de pago, hora de Chile).</figcaption>
    </figure>
  );
}
