"use client";

/**
 * "+1 alliteration" marker on a scored answer, shared by the live grading
 * reveal (GradingCascade) and the static results card (CategoryBlitzGame's
 * ResultsScreen). `bonus` comes from alliterationBonus() in
 * lib/categoryBlitzAlliteration.ts; renders nothing when it is 0.
 */
const AlliterationBonusChip = ({ bonus }: { bonus: number }) => {
  if (bonus <= 0) return null;
  return (
    <span className="mt-1 inline-flex items-center rounded-md border border-amber-300/50 bg-amber-400/15 px-1.5 py-0.5 text-caption font-bold text-amber-200">
      +{bonus} alliteration
    </span>
  );
};

export default AlliterationBonusChip;
