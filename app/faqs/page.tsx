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
    question: "How do I win prizes?",
    answer:
      "Play venue games consistently, finish near the top of the leaderboard, and claim any rewards you unlock from game wins or active challenges.",
  },
];

export default function FaqsPage() {
  return (
    <PageShell title="FAQs" description="Quick answers for players." showPageTitle={false}>
      <div className="space-y-3">
        <BackButton label="Back" venueHomeFallback />
        <section className="space-y-3">
          {FAQ_ITEMS.map((item) => (
            <article key={item.question} className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">{item.question}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-700">{item.answer}</p>
            </article>
          ))}
        </section>
      </div>
    </PageShell>
  );
}
