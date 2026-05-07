export function canAdvanceToNextTriviaQuestion(params: {
  selectedAnswer: number | null;
  isSubmitting: boolean;
}): boolean {
  return params.selectedAnswer !== null && !params.isSubmitting;
}

