import type { PastPool } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Trophy, Users, Calendar, Clock } from "lucide-react";

function formatEndedDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function PastPoolCard({ pool }: { pool: PastPool }) {
  return (
    <Link href={`/pools/${pool.id}`} className="block h-full group" data-testid={`card-past-pool-${pool.id}`}>
      <Card className="shark-card h-full flex flex-col hover:border-primary/50 transition-all duration-300 opacity-75 hover:opacity-90">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start gap-2">
            <CardTitle className="font-bebas text-2xl truncate text-foreground/80">{pool.name}</CardTitle>
            <Badge variant="secondary">Ended</Badge>
          </div>
          <div className="text-sm text-muted-foreground font-medium uppercase tracking-wider">
            {pool.sport} • Season {pool.season}
          </div>
        </CardHeader>
        <CardContent className="pb-4 flex-grow space-y-2">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Users className="w-4 h-4 text-primary/60" />
              <span>{pool.memberCount} members</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Calendar className="w-4 h-4 text-primary/60" />
              <span>Week {pool.currentWeek}</span>
            </div>
          </div>

          {pool.winnerName && (
            <div className="flex items-center gap-1.5 text-sm">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span className="text-muted-foreground">Winner:</span>
              <span className="font-medium text-amber-400">{pool.winnerName}</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
            <Clock className="w-3 h-3" />
            <span>Ended {formatEndedDate(pool.endedAt)}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}