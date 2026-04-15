const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by",
  "from", "up", "about", "into", "through", "during", "before", "after", "above", "below",
  "between", "out", "off", "over", "under", "then", "once", "when", "where", "why", "how",
  "all", "both", "each", "some", "such", "too", "can", "will", "just", "should", "now",
  "only", "own", "same", "so", "are", "was", "is", "as", "it", "be", "has", "had", "do",
  "does", "did", "this", "that", "these", "those", "have", "not", "also", "its", "we",
  "they", "you", "he", "she", "i", "me", "my", "him", "his", "her", "us", "them", "what",
  "which", "who", "whom", "if", "else", "while", "must", "would", "could", "might", "may",
  "shall", "being", "been", "well", "across", "within", "without", "around", "along",
  "including", "based", "using", "used", "our", "your", "their", "any", "more", "most",
  "other", "new", "high", "work", "very", "than", "etc", "per",
]);

export function extractKeywords(text: string, limit = 28): string[] {
  const words = text.toLowerCase().match(/\b[a-z][a-z0-9]{2,}\b/g) ?? [];
  const freq = new Map<string, number>();
  for (const w of words) {
    if (!STOP_WORDS.has(w)) {
      freq.set(w, (freq.get(w) ?? 0) + 1);
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([w]) => w);
}
