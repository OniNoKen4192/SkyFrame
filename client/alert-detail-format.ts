export type AlertDescriptionParagraph = {
  prefix: 'HAZARD' | 'SOURCE' | 'IMPACT' | null;
  text: string;
};

const PREFIX_RE = /^(HAZARD|SOURCE|IMPACT)\.\.\.\s*/;

export function parseDescription(raw: string): AlertDescriptionParagraph[] {
  if (raw === '') return [];

  const normalized = raw.replace(/\r\n/g, '\n');
  const chunks = normalized.split(/\n{2,}/);

  const paragraphs: AlertDescriptionParagraph[] = [];
  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (trimmed === '') continue;

    const match = PREFIX_RE.exec(trimmed);
    if (match) {
      const prefix = match[1] as 'HAZARD' | 'SOURCE' | 'IMPACT';
      paragraphs.push({ prefix, text: trimmed.slice(match[0].length) });
    } else {
      paragraphs.push({ prefix: null, text: trimmed });
    }
  }

  return paragraphs;
}
