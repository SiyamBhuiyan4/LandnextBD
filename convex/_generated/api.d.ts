/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as areas from "../areas.js";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as helpers from "../helpers.js";
import type * as http from "../http.js";
import type * as inquiries from "../inquiries.js";
import type * as listings from "../listings.js";
import type * as media from "../media.js";
import type * as meta from "../meta.js";
import type * as notify from "../notify.js";
import type * as reports from "../reports.js";
import type * as sampleVideos from "../sampleVideos.js";
import type * as savedSearches from "../savedSearches.js";
import type * as saves from "../saves.js";
import type * as seed from "../seed.js";
import type * as telegram from "../telegram.js";
import type * as users from "../users.js";
import type * as validators from "../validators.js";
import type * as videos from "../videos.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  areas: typeof areas;
  auth: typeof auth;
  crons: typeof crons;
  dashboard: typeof dashboard;
  helpers: typeof helpers;
  http: typeof http;
  inquiries: typeof inquiries;
  listings: typeof listings;
  media: typeof media;
  meta: typeof meta;
  notify: typeof notify;
  reports: typeof reports;
  sampleVideos: typeof sampleVideos;
  savedSearches: typeof savedSearches;
  saves: typeof saves;
  seed: typeof seed;
  telegram: typeof telegram;
  users: typeof users;
  validators: typeof validators;
  videos: typeof videos;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
