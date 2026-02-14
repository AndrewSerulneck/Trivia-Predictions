import type { Prediction } from "@/types";

const MOCK_PREDICTIONS: Prediction[] = [
  {
    id: "mock-1",
    question: "Will AI represent over 30% of global software spend by 2030?",
    source: "mock",
    closesAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
    outcomes: [
      { id: "yes", title: "Yes", probability: 62.5 },
      { id: "no", title: "No", probability: 37.5 },
    ],
  },
  {
    id: "mock-2",
    question: "Will the next major smartphone launch include on-device multimodal AI?",
    source: "mock",
    closesAt: new Date(Date.now() + 1000 * 60 * 60 * 18).toISOString(),
    outcomes: [
      { id: "yes", title: "Yes", probability: 71.2 },
      { id: "no", title: "No", probability: 28.8 },
    ],
  },
];

export async function getPredictionMarkets(): Promise<Prediction[]> {
  // Mocked for initial scaffold. Replace with Polymarket API integration in Phase 6.
  return MOCK_PREDICTIONS;
}
