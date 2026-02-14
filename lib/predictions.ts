export function formatProbability(probability: number): string {
  return `${probability.toFixed(1)}%`;
}

export function calculatePoints(probability: number): number {
  return Math.max(0, Math.round(100 - probability));
}
