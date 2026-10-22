import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Times are UTC. 20:00 UTC = 02:00 Dhaka, 02:00 UTC = 08:00 Dhaka.
crons.daily("expire old listings", { hourUTC: 20, minuteUTC: 0 }, internal.listings.expireOld, {});
crons.daily("saved search alerts", { hourUTC: 2, minuteUTC: 0 }, internal.savedSearches.runAlerts, {});
crons.hourly("clean up abandoned uploads", { minuteUTC: 15 }, internal.media.cleanupAbandoned, {});
crons.hourly("sweep orphan storage and restart stalled pushes", { minuteUTC: 30 }, internal.media.cleanupOrphanStorage, {});
crons.hourly("fail stuck video jobs", { minuteUTC: 45 }, internal.videos.failStuck, {});
// Keeps the home counters fresh without counting on every visit.
crons.interval("recompute site stats", { minutes: 30 }, internal.listings.recomputeStats, {});
// rateLimits and dailyStats grow forever unless closed rows are dropped.
crons.daily("purge expired rows", { hourUTC: 21, minuteUTC: 30 }, internal.listings.purgeExpired, {});

export default crons;
