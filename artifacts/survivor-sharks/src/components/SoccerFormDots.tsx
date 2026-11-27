import { cn } from "@/lib/utils";

export type SoccerFormResult = "W" | "D" | "L";

export function SoccerFormDots({
  form,
  side,
  size = "md",
}: {
  form: SoccerFormResult[];
  side?: "away" | "home";
  size?: "sm" | "md";
}) {
  if (!form.length) return null;
  const dot = size === "sm" ? "w-2 h-2" : "w-2.5 h-2.5";
  return (
    <div
      className={cn(
        "flex gap-1",
        side === "home" ? "justify-end" : side === "away" ? "justify-start" : "justify-center",
      )}
    >
      {form.map((result, i) => (
        <span
          key={`${result}-${i}`}
          title={result === "W" ? "Win" : result === "L" ? "Loss" : "Draw"}
          className={cn(
            dot,
            "rounded-sm border font-bold text-[8px] leading-none flex items-center justify-center",
            result === "W"
              ? "bg-green-500/85 border-green-400/60 text-green-950"
              : result === "L"
                ? "bg-red-500/70 border-red-400/50 text-red-950"
                : "bg-blue-500/80 border-blue-400/55 text-blue-950",
          )}
        >
          {size === "md" ? result : ""}
        </span>
      ))}
    </div>
  );
}