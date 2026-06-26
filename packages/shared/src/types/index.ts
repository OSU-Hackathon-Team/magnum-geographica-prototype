import type { z } from "zod";
import {
  systemSchema,
  trailSchema,
  featureSchema,
  wikiPageSchema,
  citationSchema,
  revisionSchema,
  trailSegmentSchema,
  subSystemSchema,
  superSystemSchema,
  mediaSchema,
  offlinePackInfoSchema,
  pendingContributionSchema,
  bboxDownloadRequestSchema,
  bboxInfoResponseSchema,
  offlineRegionSchema,
  userSchema,
  loginRequestSchema,
  registerRequestSchema,
  trustTierSchema,
  userKarmaSchema,
  voteTargetTypeSchema,
  castVoteInputSchema,
  voteRecordSchema,
  entityScoreSchema,
  protectionLevelSchema,
  entityProtectionSchema,
  revisionTargetTypeSchema,
  revisionActionSchema,
  revisionGeneralizedSchema,
  revisionQuerySchema,
  revertRevisionInputSchema,
  patrolFlagReasonSchema,
  patrolFlagSchema,
  patrolQuerySchema,
  patrolActionSchema,
  trailTierSchema,
  presetSchema,
  createPresetInputSchema,
  updatePresetInputSchema,
  presetQuerySchema,
  createSuperSystemInputSchema,
  updateSuperSystemInputSchema,
  createSubSystemInputSchema,
  updateSubSystemInputSchema,
  updateSystemInputSchema,
  moveSystemInputSchema,
  assignTrailsInputSchema,
  pointInPolygonQuerySchema,
  hierarchyTreeNodeSchema,
  hierarchyTreeSchema,
  containsResponseSchema,
  gpsTraceSchema,
  createTraceInputSchema,
  importTraceInputSchema,
  traceQuerySchema,
  traceSegmentSchema,
  traceSegmentVoteInputSchema,
} from "../schemas/index.js";

export type Difficulty = "easy" | "moderate" | "hard" | "expert";
export type SurfaceType = "natural" | "gravel" | "paved" | "boardwalk" | "road_connector";
export type FeatureType =
  | "trailhead"
  | "shelter"
  | "water_source"
  | "scenic_point"
  | "restroom"
  | "parking"
  | "campground"
  | "bridge"
  | "tunnel"
  | "sign"
  | "intersection"
  | "other";
export type WikiTargetType = "super_system" | "system" | "sub_system" | "trail" | "feature";
export type UserRole = "contributor" | "moderator" | "admin" | "banned";
export type SyncAction = "create" | "update" | "delete";
export type SyncStatus = "pending" | "syncing" | "conflict" | "synced";

// §21.7 / §21.8 type unions are re-exported from constants.ts. We
// deliberately re-import them here as named exports so callers that import
// only from `@magnum/shared/types` get the same names as constants.ts.

export type SuperSystem = z.infer<typeof superSystemSchema>;
export type System = z.infer<typeof systemSchema>;
export type SubSystem = z.infer<typeof subSystemSchema>;
export type Trail = z.infer<typeof trailSchema>;
export type TrailSegment = z.infer<typeof trailSegmentSchema>;
export type Feature = z.infer<typeof featureSchema>;
export type WikiPage = z.infer<typeof wikiPageSchema>;
export type Citation = z.infer<typeof citationSchema>;
export type Revision = z.infer<typeof revisionSchema>;
export type Media = z.infer<typeof mediaSchema>;
export type OfflinePackInfo = z.infer<typeof offlinePackInfoSchema>;
export type PendingContribution = z.infer<typeof pendingContributionSchema>;
export type BboxDownloadRequest = z.infer<typeof bboxDownloadRequestSchema>;
export type BboxInfoResponse = z.infer<typeof bboxInfoResponseSchema>;
export type OfflineRegion = z.infer<typeof offlineRegionSchema>;
export type User = z.infer<typeof userSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

// §21.7 / §21.8 — Type unions (TrustTier, ProtectionLevel, RevisionTargetType,
// RevisionAction, VoteTargetType, PatrolFlagReason, TrailTier) are defined
// in constants.ts and re-exported from there. The complex object types below
// are derived from their zod schemas.
export type UserKarma = z.infer<typeof userKarmaSchema>;
export type CastVoteInput = z.infer<typeof castVoteInputSchema>;
export type VoteRecord = z.infer<typeof voteRecordSchema>;
export type EntityScore = z.infer<typeof entityScoreSchema>;
export type EntityProtection = z.infer<typeof entityProtectionSchema>;
export type RevisionGeneralized = z.infer<typeof revisionGeneralizedSchema>;
export type RevisionQuery = z.infer<typeof revisionQuerySchema>;
export type RevertRevisionInput = z.infer<typeof revertRevisionInputSchema>;
export type PatrolFlag = z.infer<typeof patrolFlagSchema>;
export type PatrolQuery = z.infer<typeof patrolQuerySchema>;
export type PatrolActionInput = z.infer<typeof patrolActionSchema>;

// §21.4 — preset system
export type Preset = z.infer<typeof presetSchema>;
export type CreatePresetInput = z.infer<typeof createPresetInputSchema>;
export type UpdatePresetInput = z.infer<typeof updatePresetInputSchema>;
export type PresetQuery = z.infer<typeof presetQuerySchema>;
export type { PresetCategory, PresetQuestionType } from "../constants.js";

// §21.5 — hierarchy
export type CreateSuperSystemInput = z.infer<typeof createSuperSystemInputSchema>;
export type UpdateSuperSystemInput = z.infer<typeof updateSuperSystemInputSchema>;
export type CreateSubSystemInput = z.infer<typeof createSubSystemInputSchema>;
export type UpdateSubSystemInput = z.infer<typeof updateSubSystemInputSchema>;
export type UpdateSystemInput = z.infer<typeof updateSystemInputSchema>;
export type MoveSystemInput = z.infer<typeof moveSystemInputSchema>;
export type AssignTrailsInput = z.infer<typeof assignTrailsInputSchema>;
export type PointInPolygonQuery = z.infer<typeof pointInPolygonQuerySchema>;

// §21.5 — Shape: the in-memory representation of a system boundary
// while the user is editing it. See shapeSchema / shapeToGeoJSON in
// schemas/index.ts.
export type ShapeRing = {
  vertices: Array<[number, number]>;
  closed: boolean;
};
export type Shape = {
  rings: ShapeRing[];
};

export type HierarchyTreeNode = {
  id: string;
  name: string;
  slug: string;
  tier: "super" | "system" | "sub";
  children: HierarchyTreeNode[];
};
export type HierarchyTree = z.infer<typeof hierarchyTreeSchema>;
export type ContainsResponse = z.infer<typeof containsResponseSchema>;
export type { HierarchyAction, ProvenanceSource } from "../constants.js";

// §21.6 — GPS traces
export type GpsTrace = z.infer<typeof gpsTraceSchema>;
export type CreateTraceInput = z.infer<typeof createTraceInputSchema>;
export type ImportTraceInput = z.infer<typeof importTraceInputSchema>;
export type TraceQuery = z.infer<typeof traceQuerySchema>;
export type TraceSegment = z.infer<typeof traceSegmentSchema>;
export type TraceSegmentVoteInput = z.infer<typeof traceSegmentVoteInputSchema>;
export type { TraceSource, TraceStatus } from "../constants.js";

export interface GeoJSONPolygon {
  type: "Polygon";
  coordinates: number[][][];
}
export interface GeoJSONMultiPolygon {
  type: "MultiPolygon";
  coordinates: number[][][][];
}
export interface GeoJSONLineString {
  type: "LineString";
  coordinates: number[][];
}
export interface GeoJSONMultiLineString {
  type: "MultiLineString";
  coordinates: number[][][];
}
export interface GeoJSONPoint {
  type: "Point";
  coordinates: [number, number];
}

export type GeoJSONGeometry =
  | GeoJSONPoint
  | GeoJSONLineString
  | GeoJSONMultiLineString
  | GeoJSONPolygon
  | GeoJSONMultiPolygon;

export interface MapCenter {
  lat: number;
  lon: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
