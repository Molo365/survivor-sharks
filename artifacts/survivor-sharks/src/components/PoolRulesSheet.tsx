import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { PoolRules } from "@/lib/poolRules";

interface PoolRulesSheetProps {
  rules: PoolRules;
}

export function PoolRulesSheet({ rules }: PoolRulesSheetProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 gap-1.5 border-primary/30 bg-primary/5 px-2.5 text-xs hover:bg-primary/10"
        >
          <BookOpen className="h-3.5 w-3.5" />
          Rules
        </Button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="max-h-[88vh] overflow-y-auto rounded-t-2xl border-primary/20 sm:inset-y-0 sm:bottom-auto sm:left-auto sm:right-0 sm:h-full sm:w-full sm:max-w-md sm:rounded-none sm:border-l sm:border-t-0"
      >
        <SheetHeader className="pr-8 text-left">
          <SheetTitle className="font-bebas text-3xl tracking-wide text-primary">
            {rules.title}
          </SheetTitle>
          <SheetDescription>
            A quick guide to how this pool works.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-6">
          {rules.sections.map((section) => (
            <section key={section.heading} className="space-y-2">
              <h2 className="font-bebas text-xl tracking-wide text-foreground">
                {section.heading}
              </h2>
              <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
                {section.items.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}