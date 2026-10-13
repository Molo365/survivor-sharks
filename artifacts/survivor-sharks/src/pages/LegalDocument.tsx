import { Link } from "wouter";
import { privacyPolicy, termsOfService, type LegalDocument } from "@/content/legalDocuments";
import { LegalSiteFooter } from "@/components/LegalSiteFooter";

const DOCS: Record<string, LegalDocument> = {
  terms: termsOfService,
  privacy: privacyPolicy,
};

export default function LegalDocument({ docId }: { docId: "terms" | "privacy" }) {
  const doc = DOCS[docId];

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <div className="fixed inset-0 -z-10 bg-[#060810]" />
      <div className="fixed inset-0 -z-10 opacity-40" style={{ backgroundImage: "url('/ocean_shark_bg.jpg')", backgroundSize: "cover", backgroundPosition: "center" }} />

      <header
        className="border-b border-white/10 bg-black/40 backdrop-blur-sm sticky z-40"
        style={{ top: "var(--beta-banner-offset, 0px)" }}
      >
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <Link href="/" className="text-sm font-medium text-primary hover:underline">
            ← Survivor Sharks
          </Link>
          <nav className="flex gap-4 text-xs uppercase tracking-wider text-muted-foreground">
            <Link href="/terms" className={docId === "terms" ? "text-foreground" : "hover:text-foreground"}>
              Terms
            </Link>
            <Link href="/privacy" className={docId === "privacy" ? "text-foreground" : "hover:text-foreground"}>
              Privacy
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto px-4 py-8 pb-16 w-full">
        <h1 className="font-bebas text-4xl tracking-wide text-primary mb-1">{doc.title}</h1>
        <p className="text-xs text-muted-foreground mb-6">Last updated: {doc.lastUpdated}</p>
        {doc.intro && <p className="text-sm text-foreground/90 leading-relaxed mb-8">{doc.intro}</p>}
        <div className="space-y-8">
          {doc.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="font-semibold text-lg text-foreground mb-2">{section.heading}</h2>
              <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
                {section.body.map((paragraph) => (
                  <p key={paragraph.slice(0, 48)}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>

      <LegalSiteFooter className="border-t border-white/10 bg-black/30" />
    </div>
  );
}
