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
  User,
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
  RegisterInput,
  LoginInput,
} from "./types.js";

export function createMagnumClient(
  baseUrl: string,
  opts?: {
    fetch?: typeof fetch;
    getAdminSecret?: () => string | undefined;
    getContributorName?: () => string | undefined;
    getAuthToken?: () => string | undefined;
  },
) {
  const client = new ApiClient({
    baseUrl,
    fetch: opts?.fetch,
    getAdminSecret: opts?.getAdminSecret,
    getContributorName: opts?.getContributorName,
    getAuthToken: opts?.getAuthToken,
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

    register: (body: RegisterInput) =>
      client.post<{ access_token: string; refresh_token: string; expires_in: number; user: User }>(
        "/api/auth/register",
        body,
      ),
    login: (body: LoginInput) =>
      client.post<{ access_token: string; refresh_token: string; expires_in: number; user: User }>(
        "/api/auth/login",
        body,
      ),
    refreshToken: (refreshToken: string) =>
      client.post<{ access_token: string; expires_in: number }>("/api/auth/refresh", {
        refresh_token: refreshToken,
      }),
    getMe: () => client.get<User>("/api/auth/me"),
    getUser: (id: string) => client.get<User>(`/api/users/${id}`),
    getUserContributions: (id: string, params?: { page?: number; pageSize?: number }) =>
      client.get<PaginatedResponse<Revision>>(`/api/users/${id}/contributions`, params),
    updateUser: (id: string, body: { display_name?: string; username?: string }) =>
      client.put<User>(`/api/users/${id}`, body),

    adminListRevisions: (params?: {
      page?: number;
      pageSize?: number;
      userId?: string;
      targetType?: string;
    }) => client.get<PaginatedResponse<Revision>>("/api/admin/revisions", params),
    adminRevertRevision: (revisionId: string) =>
      client.post<{ ok: boolean }>(`/api/admin/revisions/${revisionId}/revert`),
    adminDeleteWikiPage: (id: string) =>
      client.delete<{ ok: boolean }>(`/api/admin/wiki-pages/${id}`),
    adminDeleteFeature: (id: string) =>
      client.delete<{ ok: boolean }>(`/api/admin/features/${id}`),
    adminListUsers: (params?: { page?: number; pageSize?: number; q?: string }) =>
      client.get<PaginatedResponse<User>>("/api/admin/users", params),
    adminBanUser: (id: string) =>
      client.post<{ ok: boolean }>(`/api/admin/users/${id}/ban`),
    adminUnbanUser: (id: string) =>
      client.post<{ ok: boolean }>(`/api/admin/users/${id}/unban`),

    // §21.7 / §21.8 — karma, votes, protection, generalized revisions, patrol.
    castVote: (body: { target_type: string; target_id: string; value: 1 | -1 }) =>
      client.post<{
        upvotes: number;
        downvotes: number;
        net: number;
        hidden: boolean;
        my_vote: -1 | 1;
        karma_awarded: number;
      }>("/api/votes", body),
    retractVote: (targetType: string, targetId: string) =>
      client.delete<{
        upvotes: number;
        downvotes: number;
        net: number;
        hidden: boolean;
        my_vote: 0;
        karma_awarded: number;
      }>(`/api/votes/${targetType}/${targetId}`),
    getVoteScore: (targetType: string, targetId: string) =>
      client.get<{
        target_type: string;
        target_id: string;
        upvotes: number;
        downvotes: number;
        net: number;
        hidden: boolean;
        my_vote?: -1 | 0 | 1;
      }>(`/api/votes/${targetType}/${targetId}`),
    getUserKarma: (id: string) =>
      client.get<{
        user_id: string;
        karma: number;
        tier: string;
        tier_label: string;
        upvotes_received: number;
        downvotes_received: number;
        trace_count: number;
        feature_count: number;
        revision_count: number;
      }>(`/api/votes/users/${id}/karma`),

    listRevisionsForTarget: (targetType: string, targetId: string, params?: { page?: number; pageSize?: number }) =>
      client.get<{ items: Revision[]; total: number; page: number; pageSize: number }>(
        `/api/revisions/target/${targetType}/${targetId}`,
        params,
      ),
    queryRevisions: (params?: { target_type?: string; target_id?: string; author_id?: string; page?: number; pageSize?: number }) =>
      client.get<{ items: Revision[]; total: number; page: number; pageSize: number }>("/api/revisions", params),
    revertRevision: (id: string, body?: { contributor_name?: string; edit_summary?: string }) =>
      client.post<{ ok: boolean; revision_id: string }>(`/api/revisions/${id}/revert`, body ?? {}),

    adminListPatrol: (params?: { reason?: string; user_id?: string; resolved?: boolean; page?: number; pageSize?: number }) =>
      client.get<{ items: Array<Record<string, unknown>>; total: number; page: number; pageSize: number }>(
        "/api/admin/patrol",
        params,
      ),
    adminPatrolAct: (body: {
      flag_id?: string;
      revision_id?: string;
      action: "resolve" | "revert" | "rollback";
      actor_id?: string;
      target_type?: string;
      target_id?: string;
    }) => client.post<{ ok: boolean }>("/api/admin/patrol/act", body),

    // §21.4 — presets
    listPresets: (params?: { category?: string; upstreamable?: boolean }) =>
      client.get<{ items: Array<Record<string, unknown>>; total: number }>("/api/presets", params),
    getPreset: (id: string) =>
      client.get<Record<string, unknown>>(`/api/presets/${id}`),
    getPresetByKey: (key: string) =>
      client.get<Record<string, unknown>>(`/api/presets/by-key/${key}`),
    createPreset: (body: Record<string, unknown>) =>
      client.post<Record<string, unknown>>("/api/presets", body),
    updatePreset: (id: string, body: Record<string, unknown>) =>
      client.put<Record<string, unknown>>(`/api/presets/${id}`, body),
    deletePreset: (id: string) =>
      client.delete<{ ok: boolean }>(`/api/presets/${id}`),

    // §21.5 — hierarchy
    listSuperSystems: () =>
      client.get<{ items: Array<Record<string, unknown>>; total: number }>("/api/super-systems"),
    getSuperSystem: (id: string) =>
      client.get<Record<string, unknown>>(`/api/super-systems/${id}`),
    createSuperSystem: (body: Record<string, unknown>) =>
      client.post<Record<string, unknown>>("/api/super-systems", body),
    updateSuperSystem: (id: string, body: Record<string, unknown>) =>
      client.put<Record<string, unknown>>(`/api/super-systems/${id}`, body),
    deleteSuperSystem: (id: string) =>
      client.delete<{ ok: boolean }>(`/api/super-systems/${id}`),

    listSubSystems: (params?: { system_id?: string }) =>
      client.get<{ items: Array<Record<string, unknown>>; total: number }>(
        "/api/sub-systems",
        params,
      ),
    getSubSystem: (id: string) =>
      client.get<Record<string, unknown>>(`/api/sub-systems/${id}`),
    createSubSystem: (body: Record<string, unknown>) =>
      client.post<Record<string, unknown>>("/api/sub-systems", body),
    updateSubSystem: (id: string, body: Record<string, unknown>) =>
      client.put<Record<string, unknown>>(`/api/sub-systems/${id}`, body),
    deleteSubSystem: (id: string) =>
      client.delete<{ ok: boolean }>(`/api/sub-systems/${id}`),

    moveSystem: (
      systemId: string,
      body: {
        action: string;
        target_super_id?: string;
        target_system_id?: string;
        sub_system_id?: string;
        trail_ids?: string[];
      },
    ) => client.post<{ ok: boolean; action: string; affected: number }>(
      `/api/systems/${systemId}/move`,
      body,
    ),

    getHierarchyTree: () =>
      client.get<{ nodes: Array<Record<string, unknown>>; total: number }>("/api/systems/tree"),

    getSystemsContaining: (params: { lon: number; lat: number }) =>
      client.get<{ systems: Array<{ id: string; name: string; slug: string; distance_m?: number }>; fallback: "point_in_polygon" | "nearest" }>(
        "/api/systems/contains",
        params,
      ),

    // §21.6 — GPS traces
    listTraces: (params?: {
      system_id?: string;
      user_id?: string;
      status?: string;
      page?: number;
      pageSize?: number;
    }) =>
      client.get<{ items: Array<Record<string, unknown>>; total: number; page: number; pageSize: number }>(
        "/api/traces",
        params,
      ),
    getTrace: (id: string) =>
      client.get<Record<string, unknown>>(`/api/traces/${id}`),
    createTrace: (body: {
      geometry: { type: "LineString"; coordinates: Array<[number, number]> };
      source: "import" | "recorded";
      recorded_at?: string;
      contributor_name?: string;
    }) =>
      client.post<{ trace: Record<string, unknown>; tagged_system_ids: string[] }>(
        "/api/traces",
        body,
      ),
    importTrace: (body: {
      format: "gpx" | "geojson";
      payload: string | Record<string, unknown>;
      recorded_at?: string;
      contributor_name?: string;
    }) =>
      client.post<{ trace: Record<string, unknown>; tagged_system_ids: string[]; points: number; length_meters: number }>(
        "/api/traces/import",
        body,
      ),
    deleteTrace: (id: string) =>
      client.delete<{ ok: boolean }>(`/api/traces/${id}`),
    removeTrace: (id: string) =>
      client.post<{ ok: boolean }>(`/api/traces/${id}/remove`),
    cutTraceSegments: (id: string) =>
      client.post<{ ok: boolean; segments: number }>(`/api/traces/${id}/segments`),
    listTraceSegments: (id: string) =>
      client.get<{ items: Array<Record<string, unknown>>; total: number }>(
        `/api/traces/${id}/segments`,
      ),
    voteOnTrace: (id: string, value: 1 | -1) =>
      client.post<{ upvotes: number; downvotes: number; net: number; hidden: boolean; my_vote: -1 | 0 | 1; karma_awarded: number }>(
        `/api/traces/${id}/vote`,
        { value },
      ),
    retractTraceVote: (id: string) =>
      client.delete<{ upvotes: number; downvotes: number; net: number; hidden: boolean; my_vote: 0; karma_awarded: number }>(
        `/api/traces/${id}/vote`,
      ),
    voteOnTraceSegment: (
      segmentId: string,
      body: { trail_id?: string | null; contributor_name?: string },
    ) =>
      client.post<{ ok: boolean }>(`/api/trace-segments/${segmentId}/vote`, body),
  };
}

export type MagnumClient = ReturnType<typeof createMagnumClient>;
