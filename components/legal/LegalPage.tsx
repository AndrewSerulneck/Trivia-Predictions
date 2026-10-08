import { PageShell } from "@/components/ui/PageShell";
import { LEGAL_LAST_UPDATED } from "@/lib/legalInfo";
import { marketingHref } from "@/lib/domainSplit";

// Shared frame for the legal/support pages: the player shell with the one Back
// button (to the /info home page), a "Last updated" line and readable prose.
// Server component — the pages are static text.

type LegalPageProps = {
  title: string;
  summary: string;
  children: React.ReactNode;
};

export function LegalPage({ title, summary, children }: LegalPageProps) {
  return (
    <PageShell
      title={title}
      description={summary}
      showUserStatus={false}
      showAlerts={false}
      showPageTitle={false}
      backTo={{ label: "Back", showLabel: true, href: marketingHref("/info") }}
    >
      <article className="space-y-6 pb-8">
        <header className="space-y-2">
          <h1 className="text-2xl font-black text-ht-fg-primary">{title}</h1>
          <p className="text-footnote text-ht-fg-muted">Last updated {LEGAL_LAST_UPDATED}</p>
          <p className="text-base leading-7 text-ht-fg-secondary">{summary}</p>
        </header>
        {children}
      </article>
    </PageShell>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-black text-ht-fg-primary">{heading}</h2>
      <div className="space-y-3 text-base leading-7 text-ht-fg-secondary">{children}</div>
    </section>
  );
}

export function LegalList({ items }: { items: readonly React.ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}
