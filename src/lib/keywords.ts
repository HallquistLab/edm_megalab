export function keywordTone(keyword: string) {
  const hash = [...keyword.toLowerCase()].reduce(
    (value, character) => (value * 31 + character.charCodeAt(0)) >>> 0,
    0,
  );
  return `keyword-tone-${(hash % 7) + 1}`;
}
