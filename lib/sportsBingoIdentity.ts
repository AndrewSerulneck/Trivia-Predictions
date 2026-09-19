/** Runtime/provider keys and historical database aliases are separate boundaries. */
export const normalizeBingoSportKey = (key: string): string => {
  if (key === "nba") return "basketball_nba";
  if (key === "nfl") return "americanfootball_nfl";
  return key;
};

export const bingoSportKeyAliases = (key: string): string[] => {
  const normalized = normalizeBingoSportKey(key);
  if (normalized === "basketball_nba") return [normalized, "nba"];
  if (normalized === "americanfootball_nfl") return [normalized, "nfl"];
  return [normalized];
};
