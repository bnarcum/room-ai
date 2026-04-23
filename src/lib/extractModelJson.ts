/**
 * Pull a single JSON object out of Claude output that may include markdown fences or prose.
 */
export function extractBalancedJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)```/im.exec(trimmed);
  if (fenced?.[1]) {
    const inner = fenced[1].trim();
    try {
      return JSON.parse(inner);
    } catch {
      try {
        return extractFromFirstBrace(inner);
      } catch {
        /* fall through */
      }
    }
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return extractFromFirstBrace(trimmed);
  }
}

/** Brace matching with string/escape awareness (handles nested objects). */
function extractFromFirstBrace(s: string): unknown {
  const start = s.indexOf("{");
  if (start === -1) {
    throw new Error("No JSON object found in model response.");
  }
  let depth = 0;
  let i = start;
  let inString = false;
  while (i < s.length) {
    const ch = s[i];
    if (!inString) {
      if (ch === '"') {
        inString = true;
      } else if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0) {
          return JSON.parse(s.slice(start, i + 1));
        }
      }
      i++;
      continue;
    }
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === '"') {
      inString = false;
    }
    i++;
  }
  throw new Error("Incomplete JSON object in model response.");
}
