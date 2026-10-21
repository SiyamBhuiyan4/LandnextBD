import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Times are UTC. 20:00 UTC = 02:00 Dhaka, 02:00 UTC = 08:00 Dhaka.
crons.daily("expire old listings", { hourUTC: 20, minuteUTC: 0 }, internal.listings.expireOld, {});
crons.daily("saved search alerts", { hourUTC: 2, minuteUTC: 0 }, internal.savedSearches.runAlerts, {});
crons.hourly("clean up abandoned uploads", { minuteUTC: 15 }, internal.media.cleanupAbandoned, {});
crons.hourly("fail stuck video jobs", { minuteUTC: 45 }, internal.videos.failStuck, {});

export default crons;
