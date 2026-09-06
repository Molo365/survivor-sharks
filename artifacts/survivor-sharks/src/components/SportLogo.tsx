import { getSportLogo, SPORT_LABELS } from "@/lib/sport-branding";

export function SportLogo({
  sport,
  className = "h-5 w-5",
}: {
  sport: string;
  className?: string;
}) {
  const src = getSportLogo(sport);
  if (!src) return null;

  return (
    <img
      src={src}
      alt={`${SPORT_LABELS[sport] ?? sport} logo`}
      className={`${className} object-contain ${sport === "championsleague" ? "brightness-0 invert" : ""}`}
    />
  );
}