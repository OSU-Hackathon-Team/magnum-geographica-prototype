import { createMagnumClient } from "@magnum/shared";
import { useOfflineStore } from "../stores/offlineStore";
import {
  getPendingContributions,
  markContributionSynced,
  markContributionConflict,
  getPendingCount,
} from "./offlineDataService";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export async function syncContributions(contributorName: string): Promise<{ synced: number; conflicts: number }> {
  const client = createMagnumClient(API_URL, { getContributorName: () => contributorName });
  const pending = await getPendingContributions();

  if (pending.length === 0) return { synced: 0, conflicts: 0 };

  let synced = 0;
  let conflicts = 0;

  const payload = pending.map((p) => ({
    entity_type: p.entity_type,
    entity_id: p.entity_id,
    action: p.action,
    payload: p.payload,
    contributor_name: p.contributor_name,
  }));

  try {
    const response = await client.raw.request<{
      results: Array<{ local_id: number; status: string; server_id?: string; conflict_revision_id?: string }>;
    }>("POST", "/api/sync/contributions", { body: { contributions: payload } });

    for (const result of response.results) {
      const local = pending.find((p) => p.id === result.local_id);
      if (!local) continue;

      if (result.status === "synced" && result.server_id) {
        await markContributionSynced(local.id, result.server_id);
        synced++;
      } else if (result.status === "conflict" && result.conflict_revision_id) {
        await markContributionConflict(local.id, result.conflict_revision_id);
        conflicts++;
      }
    }
  } catch (e) {
    console.error("Sync failed:", e);
  }

  const remaining = await getPendingCount();
  useOfflineStore.getState().setPendingCount(remaining);

  return { synced, conflicts };
}

export async function fetchUpdates(since: string): Promise<number> {
  const client = createMagnumClient(API_URL);

  try {
    const response = await client.raw.request<{ updates: unknown[] }>(
      "GET",
      "/api/sync/updates",
      { query: { since } },
    );
    return (response.updates ?? []).length;
  } catch (e) {
    console.error("Failed to fetch updates:", e);
    return 0;
  }
}
