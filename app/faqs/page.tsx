import { BackButton } from "@/components/navigation/BackButton";
import { PageShell } from "@/components/ui/PageShell";

type FaqItem = {
  question: string;
  answer: string;
};

// FAQ CONTENT EDIT POINT:
// Add, remove, or edit Q&A entries in this array.
const FAQ_ITEMS: FaqItem[] = [
  {
    question: "What is Hightop Challenge?",
    answer: "Hightop Challenge is a platform for trivia that also gives sports bars a way to offer promotions using the games they're showing on TV."
  },
  {
    question: "What games are available and how do I play?",
    answer: ""
  },
  {
    question: "How do I win prizes?",
    answer:
      "Each venue decides what challenges are available and what prizes can be won.",
  },
];

export default function FaqsPage() {
  return (
    <PageShell title="FAQs" description="Quick answers for players." showPageTitle={false}>
      <div className="space-y-3">
        <BackButton label="Back" venueHomeFallback />
        <section className="space-y-3">
          {FAQ_ITEMS.map((item) => (
            <article key={item.question} className="rounded-ht-2xl border border-ht-border-hairline bg-ht-elevated p-4">
              <h2 className="text-base font-semibold text-ht-fg-primary">{item.question}</h2>
              <p className="mt-2 text-sm leading-6 text-ht-fg-secondary">{item.answer}</p>
            </article>
          ))}
        </section>
      </div>
    </PageShell>
  );
}
