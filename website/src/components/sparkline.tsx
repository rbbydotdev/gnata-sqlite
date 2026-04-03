'use client';

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  color?: string | ((value: number, index: number) => string);
  className?: string;
}

export function Sparkline({
  values,
  width = 36,
  height = 16,
  color = '#7aa2f7',
  className,
}: SparklineProps) {
  if (values.length === 0) return null;

  const max = Math.max(...values);
  if (max === 0) return null;

  const gap = 1;
  const barWidth = Math.max(1, (width - gap * (values.length - 1)) / values.length);
  const minBarHeight = 2;

  const getColor = typeof color === 'function' ? color : () => color;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden
    >
      {values.map((v, i) => {
        const barHeight = Math.max(minBarHeight, (v / max) * height);
        const x = i * (barWidth + gap);
        const y = height - barHeight;

        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            rx={barWidth > 2 ? 0.5 : 0}
            fill={getColor(v, i)}
          />
        );
      })}
    </svg>
  );
}
