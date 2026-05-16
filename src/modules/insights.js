const STOPWORDS = new Set([
  "the", "and", "that", "this", "with", "from", "into", "your", "have", "will",
  "there", "their", "about", "which", "when", "where", "what", "were", "been",
  "are", "for", "you", "our", "not", "was", "can", "all", "but", "has", "its"
]);

export function summarizeText(text) {
  const words = text.toLowerCase().match(/[a-z\u0600-\u06ff]{4,}/g) || [];
  const counts = new Map();

  words.forEach((word) => {
    if (!STOPWORDS.has(word)) {
      counts.set(word, (counts.get(word) || 0) + 1);
    }
  });

  const keywords = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word, count]) => ({ word, count }));

  return {
    wordCount: words.length,
    readingMinutes: Math.max(1, Math.ceil(words.length / 220)),
    keywords
  };
}

export function detectHeadings(pageTexts) {
  return pageTexts
    .map((entry) => {
      const lines = entry.text
        .split(/\s{2,}|\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      const candidate = lines.find((line) =>
        line.length >= 8 &&
        line.length <= 80 &&
        /^[A-Z0-9\u0600-\u06ff][^.!?]{4,}$/.test(line)
      );

      return candidate ? {
        pageNumber: entry.pageNumber,
        title: candidate
      } : null;
    })
    .filter(Boolean)
    .slice(0, 16);
}
