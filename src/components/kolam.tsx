// Animated kolam drawing (server component, CSS-only animation).
// Dots appear from the centre outwards, then the line is drawn loop by loop
// at a constant "hand speed", then rangoli colours fill in. Respects
// prefers-reduced-motion (see globals.css).
import { generateKolam, type KolamOptions } from "@/lib/kolam";

/** Traditional rangoli powder colours: marigold, kumkum, leaf, turmeric, peacock, vermilion, violet. */
export const RANGOLI_COLORS = ["#F59E0B", "#E11D48", "#16A34A", "#FACC15", "#0E7490", "#EA580C", "#7C3AED"];

/** Each loop starts where the previous one finished, as if drawn by one hand. */
function drawTimings(durations: number[], start: number) {
  const timings: { delay: number; duration: number }[] = [];
  let cursor = start;
  for (const duration of durations) {
    timings.push({ delay: cursor, duration });
    cursor += duration;
  }
  return { timings, end: cursor };
}

type KolamProps = KolamOptions & {
  className?: string;
  style?: React.CSSProperties;
  /** Line ("rice flour") colour. */
  lineColor?: string;
  dotColor?: string;
  /** Line width in grid units (dots are 2 units apart). */
  strokeWidth?: number;
  /** Rangoli fill colours per loop, or false for a plain line kolam. */
  colors?: string[] | false;
  fillOpacity?: number;
  /** Seconds to draw all lines. */
  drawSeconds?: number;
  /** Seconds before the dots start appearing. */
  delay?: number;
  /** Seconds per full turn of a slow continuous rotation, or false. */
  spinSeconds?: number | false;
  /** Skip the entrance animation and show the finished drawing. */
  still?: boolean;
};

export function Kolam({
  className,
  style,
  lineColor = "currentColor",
  dotColor,
  strokeWidth = 0.16,
  colors = false,
  fillOpacity = 0.35,
  drawSeconds = 6,
  delay = 0,
  spinSeconds = false,
  still = false,
  ...options
}: KolamProps) {
  const kolam = generateKolam(options);
  const pad = 0.5;
  const dotsSeconds = Math.min(1.2, 0.04 * kolam.dots.length);
  const totalLength = kolam.loops.reduce((sum, l) => sum + l.length, 0) || 1;
  const cx = kolam.width / 2;
  const cy = kolam.height / 2;
  const maxDist = Math.hypot(cx, cy) || 1;

  const { timings, end: fillStart } = drawTimings(
    kolam.loops.map((l) => (drawSeconds * l.length) / totalLength),
    delay + dotsSeconds,
  );

  const anim = (s: React.CSSProperties): React.CSSProperties | undefined => (still ? { animation: "none" } : s);

  return (
    <svg
      viewBox={`${-pad} ${-pad} ${kolam.width + 2 * pad} ${kolam.height + 2 * pad}`}
      className={[spinSeconds && !still ? "kolam-spin" : "", className].filter(Boolean).join(" ")}
      style={{
        ...style,
        ...(spinSeconds ? ({ "--kolam-spin": `${spinSeconds}s` } as React.CSSProperties) : {}),
        ...({ "--kolam-fill-opacity": fillOpacity } as React.CSSProperties),
      }}
      aria-hidden="true"
      focusable="false"
    >
      {colors && (
        <g>
          {kolam.loops.map((l, i) => {
            const d = fillStart + i * 0.12;
            return (
              <path
                key={`f${i}`}
                d={l.d}
                fill={colors[i % colors.length]}
                fillRule="evenodd"
                fillOpacity={still ? fillOpacity : undefined}
                className="kolam-fill"
                style={anim({ animationDelay: `${d}s, ${d + 1.6}s` })}
              />
            );
          })}
        </g>
      )}
      <g fill="none" stroke={lineColor} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        {kolam.loops.map((l, i) => (
          <path
            key={`l${i}`}
            d={l.d}
            pathLength={1}
            className="kolam-line"
            style={anim({ animationDelay: `${timings[i].delay}s`, animationDuration: `${timings[i].duration}s` })}
          />
        ))}
      </g>
      <g fill={dotColor ?? lineColor}>
        {kolam.dots.map(([x, y], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={strokeWidth * 0.85}
            className="kolam-dot"
            style={anim({ animationDelay: `${delay + (Math.hypot(x - cx, y - cy) / maxDist) * dotsSeconds}s` })}
          />
        ))}
      </g>
    </svg>
  );
}

/**
 * Faint kolams fixed behind the storefront, drawn once on load and then
 * turning very slowly. Purely decorative.
 */
export function KolamBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden text-brand-700">
      <Kolam
        size={9}
        shape="diamond"
        seed={3}
        mirrorDensity={0.5}
        strokeWidth={0.13}
        drawSeconds={12}
        delay={0.6}
        spinSeconds={420}
        className="absolute -right-40 -top-32 size-[34rem] opacity-[0.09] sm:size-[44rem] lg:-right-24"
      />
      <Kolam
        size={7}
        shape="diamond"
        seed={9}
        mirrorDensity={0.45}
        strokeWidth={0.13}
        drawSeconds={10}
        delay={1.5}
        spinSeconds={360}
        className="absolute -bottom-28 -left-32 size-[26rem] opacity-[0.08] sm:size-[34rem]"
      />
      <Kolam
        size={5}
        shape="diamond"
        seed={4}
        mirrorDensity={0.5}
        strokeWidth={0.14}
        drawSeconds={6}
        delay={2.5}
        className="absolute left-[8%] top-[42%] hidden size-56 opacity-[0.07] lg:block"
      />
    </div>
  );
}
