export interface PeriodResultPlayer {
  userId: number;
  username: string;
}

export interface PeriodResultGroup {
  position: number;
  prize: number;
  players: PeriodResultPlayer[];
}

export interface CrazyEightsPeriodResult {
  week: number;
  resolvedAt: string;
  reason: string;
  groups: PeriodResultGroup[];
}

export interface BannerPlace {
  position: number;
  names: string[];
  prize: number;
}

export interface PeriodResultsBannerModel {
  label: string;
  noPicks: boolean;
  places: BannerPlace[];
}

export function getBannerModel(
  results: CrazyEightsPeriodResult[],
): PeriodResultsBannerModel | null {
  const newest = results[0];
  if (!newest) return null;

  return {
    label: `Weekend ${newest.week}`,
    noPicks: newest.groups.length === 0 || newest.reason === "no picks",
    places: [...newest.groups]
      .sort((a, b) => a.position - b.position)
      .map((group) => ({
        position: group.position,
        names: group.players.map((player) => player.username),
        prize: group.prize,
      })),
  };
}

function ordinal(position: number): string {
  const lastTwo = position % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${position}th`;

  switch (position % 10) {
    case 1:
      return `${position}st`;
    case 2:
      return `${position}nd`;
    case 3:
      return `${position}rd`;
    default:
      return `${position}th`;
  }
}

function formatPrize(prize: number): string {
  const amount = Number(prize);
  if (!Number.isFinite(amount)) return "$0";

  const wholeDollar = Number.isInteger(amount);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: wholeDollar ? 0 : 2,
    maximumFractionDigits: wholeDollar ? 0 : 2,
  }).format(amount);
}

export function formatPlaceLine(place: BannerPlace): string {
  const names = place.names.join(" & ") || "No winner";
  const sharedPrize = place.names.length > 1 ? " each" : "";
  return `${ordinal(place.position)}: ${names} · ${formatPrize(place.prize)}${sharedPrize}`;
}