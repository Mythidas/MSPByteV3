const levenshtein = (a: string, b: string): number => {
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0]![j]! = j;
  }

  // Fill matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1, // deletion
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j - 1] + 1, // substitution
        );
      }
    }
  }

  return matrix[b.length]![a.length]!;
};

const levenshteinSimilarity = (a: string, b: string): number => {
  const distance = levenshtein(a, b);
  return 1 - distance / Math.max(a.length, b.length);
};

export const stringCompare = (first: string, second: string): number => {
  // 1. Normalize: lowercase, trim, remove special chars
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "") // remove punctuation
      .replace(/\s+/g, " ") // collapse whitespace
      .trim();

  const a = normalize(first);
  const b = normalize(second);

  if (a === b) return 1.0; // exact match

  // 2. Simple token-based partial match (handles extra words)
  const aTokens = a.split(" ");
  const bTokens = b.split(" ");
  const commonTokens = aTokens.filter((t) => bTokens.includes(t));

  const tokenScore =
    commonTokens.length / Math.max(aTokens.length, bTokens.length);

  // 3. Fallback: Levenshtein ratio
  const levenshteinRatio = levenshteinSimilarity(a, b);

  // 4. Combine token score and levenshtein similarity
  return Math.max(tokenScore, levenshteinRatio);
};
