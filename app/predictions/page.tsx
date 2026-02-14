import { PageShell } from "@/components/ui/PageShell";
import { calculatePoints, formatProbability } from "@/lib/predictions";
import { getPredictionMarkets } from "@/lib/polymarket";

export default async function PredictionsPage() {
  const markets = await getPredictionMarkets();

  return (
    <PageShell
      title="Predictions"
      description="Prediction markets are mocked for now; Polymarket integration comes next."
    >
      <div className="space-y-4">
        {markets.map((market) => (
          <article
            key={market.id}
            className="rounded-lg border border-slate-200 p-3"
          >
            <h2 className="font-medium">{market.question}</h2>
            <p className="mt-1 text-xs text-slate-500">
              Closes: {new Date(market.closesAt).toLocaleString()}
            </p>
            <ul className="mt-3 space-y-2">
              {market.outcomes.map((outcome) => (
                <li
                  key={outcome.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span>{outcome.title}</span>
                  <span className="font-medium">
                    {formatProbability(outcome.probability)} ·{" "}
                    {calculatePoints(outcome.probability)} pts
                  </span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </PageShell>
  );
}
