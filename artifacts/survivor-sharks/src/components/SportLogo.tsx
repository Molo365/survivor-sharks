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
    <span className={`${className} inline-flex items-center justify-center rounded-md bg-primary p-0.5`}>
      <img
        src={src}
        alt={`${SPORT_LABELS[sport] ?? sport} logo`}
        className={`h-full w-full object-contain ${sport === "championsleague" ? "brightness-0 invert" : ""}`}
      />
    </span>
  );
}