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
} from "../schemas/index.js";

export type Difficulty = "easy" | "moderate" | "hard" | "expert";
export type SurfaceType =
  | "natural"
  | "gravel"
  | "paved"
  | "boardwalk"
  | "road_connector";
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
export type WikiTargetType =
  | "super_system"
  | "system"
  | "sub_system"
  | "trail"
  | "feature";
export type SyncAction = "create" | "update" | "delete";
export type SyncStatus = "pending" | "syncing" | "conflict" | "synced";

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

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
