import readings from "../data/readings.json";

const normalizeUrl = (value: string) => {
  const url = new URL(value);
  return `${url.hostname.replace(/^www\./, "")}${url.pathname}`
    .replace(/\/$/, "")
    .toLowerCase();
};

const presentedReadings = readings.filter((reading) => reading.presented);
const presentedUrls = new Set(
  presentedReadings.map((reading) => normalizeUrl(reading.doi)),
);
const presentedTitles = new Set(
  presentedReadings.map((reading) => reading.title.trim().toLowerCase()),
);

export const isPresentedArticle = (article: { url: string; title: string }) => {
  if (presentedTitles.has(article.title.trim().toLowerCase())) return true;
  try {
    return presentedUrls.has(normalizeUrl(article.url));
  } catch {
    return false;
  }
};
