import { ReactNode, useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function ScrollableTabsRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    const updateScrollState = () => {
      setCanScrollLeft(scrollElement.scrollLeft > 1);
      setCanScrollRight(
        scrollElement.scrollLeft + scrollElement.clientWidth <
          scrollElement.scrollWidth - 1,
      );
    };

    updateScrollState();
    scrollElement.addEventListener("scroll", updateScrollState, {
      passive: true,
    });
    window.addEventListener("resize", updateScrollState);

    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(scrollElement);
    const mutationObserver = new MutationObserver(updateScrollState);
    mutationObserver.observe(scrollElement, { childList: true, subtree: true });

    return () => {
      scrollElement.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, []);

  return (
    <div className={cn("relative min-w-0", className)}>
      <div
        ref={scrollRef}
        className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      {canScrollLeft && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 rounded-l-lg bg-gradient-to-r from-background via-background/75 to-transparent"
        />
      )}
      {canScrollRight && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 rounded-r-lg bg-gradient-to-l from-background via-background/75 to-transparent"
          />
          <ChevronRight
            aria-hidden="true"
            className="pointer-events-none absolute right-1 top-1/2 z-20 h-4 w-4 -translate-y-1/2 text-muted-foreground/75 animate-pulse"
          />
        </>
      )}
    </div>
  );
}