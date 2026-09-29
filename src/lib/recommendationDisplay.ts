export const CISCO_GUIDANCE_LABEL = "Cisco guidance";

/** Public Cisco / Webex pages — never /c/dam PDF dumps. */
export const CISCO_GUIDANCE_URL =
  "https://www.cisco.com/c/en/us/products/collaboration-endpoints/index.html";

const MARKDOWN_LINK = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi;
const RAW_URL = /https?:\/\/[^\s)\]>'"]+/gi;

const ALLOWED_HOSTS = new Set([
  "www.cisco.com",
  "cisco.com",
  "webex.com",
  "www.webex.com",
  "help.webex.com",
  "designer.webex.com",
]);

export type RecommendationLine = {
  text: string;
  href?: string;
};

export function sanitizeGuidanceUrl(raw: string): string | null {
  const trimmed = raw.replace(/[.,;:]+$/g, "").trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) return null;
  if (/\/c\/dam\//i.test(parsed.pathname)) return CISCO_GUIDANCE_URL;
  return parsed.href;
}

function tightenRecText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\(\s*(see|see also)?\s*\)/gi, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/[(\s]+see[.]\s*/gi, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s—–-]+|[\s—–-]+$/g, "")
    .trim();
}

export function joinRecommendationItems(
  items: readonly string[] | undefined,
): string {
  return (items ?? [])
    .map((s) => String(s ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");
}

export function parseRecommendationItems(
  items: readonly string[] | undefined,
): RecommendationLine {
  return parseRecommendationLine(joinRecommendationItems(items));
}

export function splitRecommendation(
  items: readonly string[] | undefined,
): RecommendationLine & { lead: string; rest: string } {
  const line = parseRecommendationItems(items);
  const lead = firstRecommendationSentence(line.text);
  const rest = line.text.slice(lead.length).trim();
  return { ...line, lead, rest };
}

function firstRecommendationSentence(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "";
  const m = t.match(/^(.+?[.!?])(?:\s|$)/);
  return (m ? m[1] : t).trim();
}

export function parseRecommendationLine(raw: string): RecommendationLine {
  let href: string | undefined;
  let text = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!text) return { text: "" };

  text = text.replace(MARKDOWN_LINK, (_all, _label: string, url: string) => {
    const clean = sanitizeGuidanceUrl(url);
    if (clean && !href) href = clean;
    return "";
  });

  text = text.replace(RAW_URL, (url) => {
    const clean = sanitizeGuidanceUrl(url);
    if (clean && !href) href = clean;
    return "";
  });

  return {
    text: tightenRecText(text),
    ...(href ? { href } : {}),
  };
}
