/** Aggregate visible model output; Claude 4.x may split reasoning vs answer. */
export function combinedAssistantText(result: {
  text?: string;
  reasoningText?: string;
  steps?: Array<{ text?: string }>;
}): string {
  const primary = (result.text ?? "").trim();
  if (primary.length > 0) return primary;

  const reasoning = (result.reasoningText ?? "").trim();
  if (reasoning.length > 0 && looksLikeJsonPayload(reasoning)) return reasoning;

  const steps = result.steps;
  if (Array.isArray(steps)) {
    const joined = steps
      .map((s) => (s.text ?? "").trim())
      .filter(Boolean)
      .join("\n\n");
    if (joined.length > 0) return joined;
  }

  if (reasoning.length > 0) return reasoning;

  return "";
}

function looksLikeJsonPayload(s: string): boolean {
  const t = s.trim();
  return t.startsWith("{") || t.includes("{");
}
