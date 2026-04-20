export interface GitHubRelease {
  tagName: string;
  htmlUrl: string;
  body: string;
  publishedAt: string;
}

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
}

const VERSION_RE = /^v?(\d+)\.(\d+)(?:\.(\d+))?$/;

export function parseVersion(raw: string): ParsedVersion | null {
  const match = VERSION_RE.exec(raw.trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: match[3] !== undefined ? Number(match[3]) : 0,
  };
}

export function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function isString(x: unknown): x is string {
  return typeof x === 'string';
}

export function parseReleaseResponse(raw: unknown): GitHubRelease | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isString(r.tag_name) || !isString(r.html_url) || !isString(r.body) || !isString(r.published_at)) {
    return null;
  }
  return {
    tagName: r.tag_name,
    htmlUrl: r.html_url,
    body: r.body,
    publishedAt: r.published_at,
  };
}
