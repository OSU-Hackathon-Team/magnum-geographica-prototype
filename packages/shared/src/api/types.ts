import { z } from "zod";
import {
  createSystemInputSchema,
  createTrailInputSchema,
  createFeatureInputSchema,
  updateWikiPageInputSchema,
  searchQuerySchema,
} from "../schemas/index.js";

export type CreateSystemInput = z.infer<typeof createSystemInputSchema>;
export type CreateTrailInput = z.infer<typeof createTrailInputSchema>;
export type CreateFeatureInput = z.infer<typeof createFeatureInputSchema>;
export type UpdateWikiPageInput = z.infer<typeof updateWikiPageInputSchema>;
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export type ApiRequest<TRoute extends keyof ApiRoutes> = ApiRoutes[TRoute]["request"];
export type ApiResponse<TRoute extends keyof ApiRoutes> = ApiRoutes[TRoute]["response"];

export interface ApiRoutes {
  health: {
    request: void;
    response: { status: "ok"; version: string; time: string };
  };
  listSystems: {
    request: { page?: number; pageSize?: number; q?: string };
    response: { items: import("../types/index.js").System[]; total: number; page: number; pageSize: number };
  };
  getSystem: {
    request: { id: string };
    response: import("../types/index.js").System;
  };
  listTrails: {
    request: { page?: number; pageSize?: number; systemId?: string; q?: string; difficulty?: string };
    response: { items: import("../types/index.js").Trail[]; total: number; page: number; pageSize: number };
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
  updateWikiPage: {
    request: { id: string; body: UpdateWikiPageInput };
    response: import("../types/index.js").WikiPage;
  };
  createFeature: {
    request: { body: CreateFeatureInput };
    response: import("../types/index.js").Feature;
  };
  getFeature: {
    request: { id: string };
    response: import("../types/index.js").Feature;
  };
}
