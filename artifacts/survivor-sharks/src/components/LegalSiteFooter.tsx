import { Link } from "wouter";
import { SUPPORT_EMAIL } from "@/lib/siteLegal";
import { cn } from "@/lib/utils";

export function LegalSiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("py-4 px-4 text-center text-[11px] text-muted-foreground/70", className)}>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <Link href="/terms" className="hover:text-primary hover:underline">
          Terms
        </Link>
        <span className="text-muted-foreground/30">·</span>
        <Link href="/privacy" className="hover:text-primary hover:underline">
          Privacy
        </Link>
        <span className="text-muted-foreground/30">·</span>
        <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-primary hover:underline">
          {SUPPORT_EMAIL}
        </a>
      </div>
      <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground/40">
        © {new Date().getFullYear()} Survivor Sharks
      </p>
    </footer>
  );
}
