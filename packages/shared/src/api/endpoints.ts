import { ApiClient } from "./client.js";
import type {
  System,
  Trail,
  Feature,
  WikiPage,
  Citation,
  Revision,
  Media,
  TrailSegment,
  PaginatedResponse,
} from "../types/index.js";
import type {
  CreateSystemInput,
  CreateTrailInput,
  CreateFeatureInput,
  UpdateFeatureInput,
  CreateWikiPageInput,
  UpdateWikiPageInput,
  RevertWikiPageInput,
  CreateCitationInput,
  SearchQuery,
  CreateMediaInput,
  CreateSegmentInput,
  UpdateSegmentInput,
  ReorderSegmentsInput,
  SplitSegmentInput,
  MergeSegmentsInput,
} from "./types.js";

export function createMagnumClient(
  baseUrl: string,
  opts?: {
    fetch?: typeof fetch;
    getAdminSecret?: () => string | undefined;
    getContributorName?: () => string | undefined;
  },
) {
  const client = new ApiClient({
    baseUrl,
    fetch: opts?.fetch,
    getAdminSecret: opts?.getAdminSecret,
    getContributorName: opts?.getContributorName,
  });

  return {
    raw: client,
    health: () =>
      client.get<{ status: "ok"; version: string; time: string; database: string }>("/api/health"),

    listSystems: (params?: { page?: number; pageSize?: number; q?: string }) =>
      client.get<PaginatedResponse<System>>("/api/systems", params),
    getSystem: (id: string) => client.get<System>(`/api/systems/${id}`),
    getSystemBySlug: (slug: string) => client.get<System>(`/api/systems/by-slug/${slug}`),
    listSystemTrails: (id: string) =>
      client.get<{ items: Trail[]; total: number }>(`/api/systems/${id}/trails`),
    listSystemFeatures: (id: string) =>
      client.get<{ items: Feature[]; total: number }>(`/api/systems/${id}/features`),
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
    createWikiPage: (body: CreateWikiPageInput) => client.post<WikiPage>("/api/wiki-pages", body),
    updateWikiPage: (id: string, body: UpdateWikiPageInput) =>
      client.put<WikiPage>(`/api/wiki-pages/${id}`, body),
    listWikiPageRevisions: (wikiPageId: string, params?: { page?: number; pageSize?: number }) =>
      client.get<PaginatedResponse<Revision>>(`/api/wiki-pages/${wikiPageId}/revisions`, params),
    getWikiPageRevision: (wikiPageId: string, revisionId: string) =>
      client.get<Revision>(`/api/wiki-pages/${wikiPageId}/revisions/${revisionId}`),
    revertWikiPage: (wikiPageId: string, body: RevertWikiPageInput) =>
      client.post<WikiPage>(`/api/wiki-pages/${wikiPageId}/revert`, body),

    listWikiPageCitations: (wikiPageId: string) =>
      client.get<{ items: Citation[]; total: number }>(`/api/wiki-pages/${wikiPageId}/citations`),
    createCitation: (body: CreateCitationInput) => client.post<Citation>("/api/citations", body),
    deleteCitation: (id: string) => client.delete<{ ok: boolean }>(`/api/citations/${id}`),

    recentRevisions: (params?: { page?: number; pageSize?: number }) =>
      client.get<PaginatedResponse<Revision>>("/api/revisions/recent", params),

    createFeature: (body: CreateFeatureInput) => client.post<Feature>("/api/features", body),
    getFeature: (id: string) => client.get<Feature>(`/api/features/${id}`),
    updateFeature: (id: string, body: UpdateFeatureInput) =>
      client.put<Feature>(`/api/features/${id}`, body),
    deleteFeature: (id: string) => client.delete<{ ok: boolean }>(`/api/features/${id}`),

    listMedia: (params: { feature_id?: string; trail_id?: string; system_id?: string }) =>
      client.get<{ items: Media[]; total: number }>("/api/media", params),
    createMedia: (body: CreateMediaInput) => client.post<Media>("/api/media", body),
    deleteMedia: (id: string) => client.delete<{ ok: boolean }>(`/api/media/${id}`),

    createSegment: (trailId: string, body: CreateSegmentInput) =>
      client.post<TrailSegment>(`/api/trails/${trailId}/segments`, body),
    updateSegment: (id: string, body: UpdateSegmentInput) =>
      client.put<TrailSegment>(`/api/segments/${id}`, body),
    deleteSegment: (id: string) => client.delete<{ ok: boolean }>(`/api/segments/${id}`),
    reorderSegments: (trailId: string, body: ReorderSegmentsInput) =>
      client.post<{ items: TrailSegment[]; total: number }>(
        `/api/trails/${trailId}/segments/reorder`,
        body,
      ),
    splitSegment: (trailId: string, body: SplitSegmentInput) =>
      client.post<{ items: TrailSegment[]; total: number }>(
        `/api/trails/${trailId}/segments/split`,
        body,
      ),
    mergeSegments: (trailId: string, body: MergeSegmentsInput) =>
      client.post<TrailSegment>(`/api/trails/${trailId}/segments/merge`, body),
  };
}

export type MagnumClient = ReturnType<typeof createMagnumClient>;
