import { ApiClient } from "./client.js";
import type {
  System,
  Trail,
  Feature,
  WikiPage,
  PaginatedResponse,
} from "../types/index.js";
import type {
  CreateSystemInput,
  CreateTrailInput,
  CreateFeatureInput,
  UpdateWikiPageInput,
  SearchQuery,
} from "./types.js";

export function createMagnumClient(baseUrl: string, opts?: {
  fetch?: typeof fetch;
  getAdminSecret?: () => string | undefined;
  getContributorName?: () => string | undefined;
}) {
  const client = new ApiClient({
    baseUrl,
    fetch: opts?.fetch,
    getAdminSecret: opts?.getAdminSecret,
    getContributorName: opts?.getContributorName,
  });

  return {
    raw: client,
    health: () => client.get<{ status: "ok"; version: string; time: string; database: string }>("/api/health"),

    listSystems: (params?: { page?: number; pageSize?: number; q?: string }) =>
      client.get<PaginatedResponse<System>>("/api/systems", params),
    getSystem: (id: string) => client.get<System>(`/api/systems/${id}`),
    getSystemBySlug: (slug: string) => client.get<System>(`/api/systems/by-slug/${slug}`),
    listSystemTrails: (id: string) =>
      client.get<{ items: Trail[]; total: number }>(`/api/systems/${id}/trails`),
    createSystem: (body: CreateSystemInput) => client.post<System>("/api/systems", body),

    listTrails: (params?: {
      page?: number;
      pageSize?: number;
      systemId?: string;
      q?: string;
      difficulty?: string;
    }) => client.get<PaginatedResponse<Trail>>("/api/trails", params),
    getTrail: (id: string) => client.get<Trail>(`/api/trails/${id}`),
    getTrailBySlug: (slug: string) => client.get<Trail>(`/api/trails/by-slug/${slug}`),
    listTrailSegments: (id: string) =>
      client.get<{ items: import("../types/index.js").TrailSegment[]; total: number }>(
        `/api/trails/${id}/segments`,
      ),
    listTrailFeatures: (id: string) =>
      client.get<{ items: Feature[]; total: number }>(`/api/trails/${id}/features`),
    createTrail: (body: CreateTrailInput) => client.post<Trail>("/api/trails", body),

    search: (q: SearchQuery) =>
      client.get<{
        systems: System[];
        trails: Trail[];
        features: Feature[];
      }>("/api/search", q as unknown as Record<string, string | number>),

    getWikiPage: (targetType: string, targetId: string) =>
      client.get<WikiPage>("/api/wiki-pages", { target_type: targetType, target_id: targetId }),
    updateWikiPage: (id: string, body: UpdateWikiPageInput) =>
      client.put<WikiPage>(`/api/wiki-pages/${id}`, body),

    createFeature: (body: CreateFeatureInput) => client.post<Feature>("/api/features", body),
  };
}

export type MagnumClient = ReturnType<typeof createMagnumClient>;
