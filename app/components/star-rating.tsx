import { useState } from "react";
import { cn } from "~/lib/utils";

const STARS = [1, 2, 3, 4, 5] as const;

/**
 * A single SVG star whose fill is a 0–1 fraction. Renders an outlined empty
 * star with a clipped, filled star layered on top so it can show partial fills
 * (e.g. a 4.3 average) as well as fully on/off states for the input.
 */
function Star({
  fill,
  size = 24,
  className,
}: {
  fill: number;
  size?: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(1, fill));
  const pathD =
    "M12 2.25l2.95 5.98 6.6.96-4.77 4.65 1.13 6.57L12 17.3l-5.91 3.11 1.13-6.57L2.45 9.19l6.6-.96L12 2.25z";

  return (
    <span
      className={cn("relative inline-block shrink-0", className)}
      style={{ width: size, height: size }}
    >
      {/* Empty / outline layer */}
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        className="absolute inset-0 text-muted-foreground/40"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={pathD} />
      </svg>
      {/* Filled layer, clipped to the fill fraction */}
      <span
        className="absolute inset-0 overflow-hidden"
        style={{ width: `${clamped * 100}%` }}
      >
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          className="text-yellow-400"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d={pathD} />
        </svg>
      </span>
    </span>
  );
}

/**
 * Interactive 1–5 star input. Stars start empty and fill on hover/focus up to
 * the pointed star; clicking commits that value via onRate. Re-selecting the
 * current value still calls onRate — callers decide whether to skip the request.
 */
export function StarRatingInput({
  value,
  onRate,
  disabled = false,
  size = 32,
}: {
  value: number;
  onRate: (rating: number) => void;
  disabled?: boolean;
  size?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const display = hover ?? value;

  return (
    <div
      role="radiogroup"
      aria-label="Course rating"
      className="flex items-center gap-1"
      onMouseLeave={() => setHover(null)}
    >
      {STARS.map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} star${star > 1 ? "s" : ""}`}
          disabled={disabled}
          className={cn(
            "rounded-sm transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            !disabled && "cursor-pointer hover:scale-110",
            disabled && "cursor-not-allowed opacity-70"
          )}
          onMouseEnter={() => !disabled && setHover(star)}
          onFocus={() => !disabled && setHover(star)}
          onBlur={() => setHover(null)}
          onClick={() => !disabled && onRate(star)}
        >
          <Star fill={star <= display ? 1 : 0} size={size} />
        </button>
      ))}
    </div>
  );
}

/**
 * Read-only display of an average rating, supporting fractional fills.
 */
export function StarRatingDisplay({
  value,
  size = 16,
  className,
}: {
  value: number;
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("flex items-center gap-0.5", className)}
      role="img"
      aria-label={`Rated ${value.toFixed(1)} out of 5`}
    >
      {STARS.map((star) => (
        <Star key={star} fill={value - (star - 1)} size={size} />
      ))}
    </div>
  );
}
