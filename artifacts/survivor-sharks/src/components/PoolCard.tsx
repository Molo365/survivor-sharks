import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Calendar } from "lucide-react";
import { Pool } from "@workspace/api-client-react";
import { Link } from "wouter";

interface PoolCardProps {
  pool: Pool;
}

export function PoolCard({ pool }: PoolCardProps) {
  return (
    <Link href={`/pools/${pool.id}`} className="block h-full group" data-testid={`card-pool-${pool.id}`}>
      <Card className="shark-card h-full flex flex-col hover:border-primary transition-all duration-300">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start gap-2">
            <CardTitle className="font-bebas text-2xl truncate">{pool.name}</CardTitle>
            <Badge variant={pool.isActive ? "default" : "secondary"} className={pool.isActive ? "bg-accent text-accent-foreground hover:bg-accent/80" : ""}>
              {pool.isActive ? 'Active' : 'Finished'}
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground font-medium uppercase tracking-wider">
            {pool.sport} • Season {pool.season}
          </div>
        </CardHeader>
        <CardContent className="pb-2 flex-grow">
          {pool.description && (
            <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{pool.description}</p>
          )}
          
          <div className="flex gap-4 mt-auto">
            <div className="flex items-center gap-1.5 text-sm">
              <Users className="w-4 h-4 text-primary" />
              <span>{pool.activeCount ?? 0} / {pool.memberCount} Alive</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <Calendar className="w-4 h-4 text-primary" />
              <span>Week {pool.currentWeek}</span>
            </div>
          </div>
        </CardContent>
        {pool.prizePot && pool.prizePot > 0 && (
          <CardFooter className="pt-0 pb-4">
            <div className="w-full p-2 bg-primary/10 rounded border border-primary/20 text-center">
              <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider mr-2">Prize Pot</span>
              <span className="font-bebas text-lg text-primary">${pool.prizePot}</span>
            </div>
          </CardFooter>
        )}
      </Card>
    </Link>
  );
}
