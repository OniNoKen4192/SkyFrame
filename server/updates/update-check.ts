import type { Alert } from '../../shared/types';
import packageJson from '../../package.json' with { type: 'json' };
import {
  type GitHubRelease,
  compareVersions,
  parseReleaseResponse,
  parseVersion,
} from './github-release';

const OWNER = 'OniNoKen4192';
const REPO = 'SkyFrame';
const API_URL = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;

const currentVersion: string = packageJson.version;

export interface AvailableUpdate {
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  releaseBody: string;
  checkedAt: string;
}

// Module-level state (reset per server run)
let cachedAvailableUpdate: AvailableUpdate | null = null;
let scheduledTimerId: ReturnType<typeof setTimeout> | null = null;

export function getCachedUpdate(): AvailableUpdate | null {
  return cachedAvailableUpdate;
}

export function clearCachedUpdate(): void {
  cachedAvailableUpdate = null;
}

export function msUntilNextLocalMidnight(from: Date): number {
  const next = new Date(from);
  next.setDate(next.getDate() + 1);
  next.setHours(0, 0, 0, 0);
  return next.getTime() - from.getTime();
}

async function fetchLatestRelease(): Promise<GitHubRelease | null> {
  try {
    const res = await fetch(API_URL, {
      headers: {
        'User-Agent': `SkyFrame-Update-Check/${currentVersion}`,
        'Accept': 'application/vnd.github+json',
      },
    });
    if (!res.ok) return null;
    return parseReleaseResponse(await res.json());
  } catch {
    return null;
  }
}

export async function performUpdateCheck(now: Date): Promise<void> {
  const release = await fetchLatestRelease();
  if (!release) return;

  const latestParsed = parseVersion(release.tagName);
  const currentParsed = parseVersion(currentVersion);
  if (!latestParsed || !currentParsed) return;

  if (compareVersions(latestParsed, currentParsed) <= 0) {
    // Release is same or older — nothing to surface.
    cachedAvailableUpdate = null;
    return;
  }

  cachedAvailableUpdate = {
    currentVersion,
    latestVersion: release.tagName,
    releaseUrl: release.htmlUrl,
    releaseBody: release.body,
    checkedAt: now.toISOString(),
  };
}

export function startUpdateScheduler(): void {
  // Kick off an immediate check (fire-and-forget), then schedule the next
  // midnight firing. Each midnight firing re-schedules itself.
  void performUpdateCheck(new Date());

  const scheduleNext = () => {
    const ms = msUntilNextLocalMidnight(new Date());
    scheduledTimerId = setTimeout(async () => {
      await performUpdateCheck(new Date());
      scheduleNext();
    }, ms);
  };
  scheduleNext();
}

export function stopUpdateScheduler(): void {
  if (scheduledTimerId !== null) {
    clearTimeout(scheduledTimerId);
    scheduledTimerId = null;
  }
}

// Build the synthetic Alert injected into the alert pipeline when an update
// is available. Called from server/nws/normalizer.ts.
export function buildUpdateAlert(update: AvailableUpdate): Alert {
  const expires = new Date('2099-01-01T00:00:00Z').toISOString();
  return {
    id: `update-${update.latestVersion}`,
    event: 'Update Available',
    tier: 'advisory',
    severity: 'Minor',
    headline: `SkyFrame ${update.latestVersion} is available`,
    description: `SkyFrame ${update.latestVersion} is available (you are on ${update.currentVersion}).\n\n${update.releaseBody}\n\n${update.releaseUrl}`,
    issuedAt: update.checkedAt,
    effective: update.checkedAt,
    expires,
    areaDesc: 'Update',
  };
}
