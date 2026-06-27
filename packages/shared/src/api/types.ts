import { z } from "zod";
import {
  createSystemInputSchema,
  updateSystemInputSchema,
  createTrailInputSchema,
  updateTrailInputSchema,
  createFeatureInputSchema,
  createWikiPageInputSchema,
  updateWikiPageInputSchema,
  revertWikiPageInputSchema,
  createCitationInputSchema,
  wikiPageQuerySchema,
  searchQuerySchema,
  updateFeatureInputSchema,
  createMediaInputSchema,
  createSegmentInputSchema,
  updateSegmentInputSchema,
  reorderSegmentsInputSchema,
  splitSegmentInputSchema,
  mergeSegmentsInputSchema,
  registerRequestSchema,
  loginRequestSchema,
} from "../schemas/index.js";

export type CreateSystemInput = z.infer<typeof createSystemInputSchema>;
export type UpdateSystemInput = z.infer<typeof updateSystemInputSchema>;
export type CreateTrailInput = z.infer<typeof createTrailInputSchema>;
export type UpdateTrailInput = z.infer<typeof updateTrailInputSchema>;
export type CreateFeatureInput = z.infer<typeof createFeatureInputSchema>;
export type UpdateFeatureInput = z.infer<typeof updateFeatureInputSchema>;
export type CreateWikiPageInput = z.infer<typeof createWikiPageInputSchema>;
export type UpdateWikiPageInput = z.infer<typeof updateWikiPageInputSchema>;
export type RevertWikiPageInput = z.infer<typeof revertWikiPageInputSchema>;
export type CreateCitationInput = z.infer<typeof createCitationInputSchema>;
export type WikiPageQuery = z.infer<typeof wikiPageQuerySchema>;
export type SearchQuery = z.infer<typeof searchQuerySchema>;
export type CreateMediaInput = z.infer<typeof createMediaInputSchema>;
export type CreateSegmentInput = z.infer<typeof createSegmentInputSchema>;
export type UpdateSegmentInput = z.infer<typeof updateSegmentInputSchema>;
export type ReorderSegmentsInput = z.infer<typeof reorderSegmentsInputSchema>;
export type SplitSegmentInput = z.infer<typeof splitSegmentInputSchema>;
export type MergeSegmentsInput = z.infer<typeof mergeSegmentsInputSchema>;
export type RegisterInput = z.infer<typeof registerRequestSchema>;
export type LoginInput = z.infer<typeof loginRequestSchema>;

export type ApiRequest<TRoute extends keyof ApiRoutes> = ApiRoutes[TRoute]["request"];
export type ApiResponse<TRoute extends keyof ApiRoutes> = ApiRoutes[TRoute]["response"];

export interface ApiRoutes {
  health: {
    request: void;
    response: { status: "ok"; version: string; time: string };
  };
  listSystems: {
    request: { page?: number; pageSize?: number; q?: string };
    response: {
      items: import("../types/index.js").System[];
      total: number;
      page: number;
      pageSize: number;
    };
  };
  getSystem: {
    request: { id: string };
    response: import("../types/index.js").System;
  };
  listTrails: {
    request: {
      page?: number;
      pageSize?: number;
      systemId?: string;
      q?: string;
      difficulty?: string;
    };
    response: {
      items: import("../types/index.js").Trail[];
      total: number;
      page: number;
      pageSize: number;
    };
  };
  getTrail: {
    request: { id: string };
    response: import("../types/index.js").Trail;
  };
  search: {
    request: SearchQuery;
    response: {
      systems: import("../types/index.js").System[];
      trails: import("../types/index.js").Trail[];
      features: import("../types/index.js").Feature[];
    };
  };
  getWikiPage: {
    request: WikiPageQuery;
    response: import("../types/index.js").WikiPage;
  };
  createWikiPage: {
    request: { body: CreateWikiPageInput };
    response: import("../types/index.js").WikiPage;
  };
  updateWikiPage: {
    request: { id: string; body: UpdateWikiPageInput };
    response: import("../types/index.js").WikiPage;
  };
  listRevisions: {
    request: { id: string; page?: number; pageSize?: number };
    response: {
      items: import("../types/index.js").Revision[];
      total: number;
      page: number;
      pageSize: number;
    };
  };
  getRevision: {
    request: { wikiId: string; revId: string };
    response: import("../types/index.js").Revision;
  };
  revertWikiPage: {
    request: { id: string; body: RevertWikiPageInput };
    response: import("../types/index.js").WikiPage;
  };
  recentRevisions: {
    request: { page?: number; pageSize?: number };
    response: {
      items: import("../types/index.js").Revision[];
      total: number;
      page: number;
      pageSize: number;
    };
  };
  listCitations: {
    request: { wikiPageId: string };
    response: { items: import("../types/index.js").Citation[]; total: number };
  };
  createCitation: {
    request: { body: CreateCitationInput };
    response: import("../types/index.js").Citation;
  };
  deleteCitation: {
    request: { id: string };
    response: { ok: boolean };
  };
  createFeature: {
    request: { body: CreateFeatureInput };
    response: import("../types/index.js").Feature;
  };
  getFeature: {
    request: { id: string };
    response: import("../types/index.js").Feature;
  };
  updateFeature: {
    request: { id: string; body: UpdateFeatureInput };
    response: import("../types/index.js").Feature;
  };
  deleteFeature: {
    request: { id: string };
    response: { ok: boolean };
  };
  listMedia: {
    request: { feature_id?: string; trail_id?: string; system_id?: string };
    response: { items: import("../types/index.js").Media[]; total: number };
  };
  createMedia: {
    request: { body: CreateMediaInput };
    response: import("../types/index.js").Media;
  };
  deleteMedia: {
    request: { id: string };
    response: { ok: boolean };
  };
  createSegment: {
    request: { trail_id: string; body: CreateSegmentInput };
    response: import("../types/index.js").TrailSegment;
  };
  updateSegment: {
    request: { id: string; body: UpdateSegmentInput };
    response: import("../types/index.js").TrailSegment;
  };
  deleteSegment: {
    request: { id: string };
    response: { ok: boolean };
  };
  reorderSegments: {
    request: { trail_id: string; body: ReorderSegmentsInput };
    response: { items: import("../types/index.js").TrailSegment[]; total: number };
  };
  splitSegment: {
    request: { trail_id: string; body: SplitSegmentInput };
    response: { items: import("../types/index.js").TrailSegment[]; total: number };
  };
  mergeSegments: {
    request: { trail_id: string; body: MergeSegmentsInput };
    response: import("../types/index.js").TrailSegment;
  };
}
