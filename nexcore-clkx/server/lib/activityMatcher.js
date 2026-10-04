/**
 * Groups a batch of readings into short time windows, computes simple
 * motion/HR stats per window, and matches each window against the saved
 * activity signatures (see db/schema.sql: table `activities`).
 *
 * This is intentionally simple — a normalized-distance nearest-neighbour
 * match on (accel magnitude mean, heart rate mean) — not a trained model.
 * It's meant to get you "this spike looks like what I labeled running
 * last time" without needing an ML pipeline.
 */

const WINDOW_MS = 10_000; // bucket readings into 10s windows before matching

function mean(nums) {
    if (!nums.length) return null;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function std(nums, m) {
    if (nums.length < 2) return 0;
    const variance = nums.reduce((a, b) => a + (b - m) ** 2, 0) / (nums.length - 1);
    return Math.sqrt(variance);
}

/** Buckets readings (already sorted by ts) into WINDOW_MS windows. */
function bucketReadings(readings) {
    const buckets = [];
    let current = null;

    for (const r of readings) {
        const t = new Date(r.ts).getTime();
        if (!current || t - current.startMs >= WINDOW_MS) {
            current = { startMs: t, readings: [] };
            buckets.push(current);
        }
        current.readings.push(r);
    }
    return buckets;
}

function statsForBucket(bucket) {
    const accelMags = bucket.readings.map((r) => r.accel_mag).filter((v) => v != null);
    const hrs = bucket.readings.map((r) => r.heart_rate).filter((v) => v != null);

    const accelMean = mean(accelMags);
    const hrMean = mean(hrs);

    return {
        ids: bucket.readings.map((r) => r.id),
        accelMean,
        accelStd: accelMean != null ? std(accelMags, accelMean) : null,
        hrMean,
    };
}

/** Normalized distance between a window's stats and a stored activity signature. */
function distance(stats, activity, tolerance) {
    if (stats.accelMean == null) return Infinity;

    const accelDiff = Math.abs(stats.accelMean - activity.accel_mag_mean) /
        Math.max(activity.accel_mag_std || 1, 0.5);

    let hrDiff = 0;
    if (stats.hrMean != null && activity.hr_mean != null) {
        hrDiff = Math.abs(stats.hrMean - activity.hr_mean) / Math.max(activity.hr_std || 10, 5);
    }

    const d = accelDiff + 0.5 * hrDiff;
    return d <= tolerance ? d : Infinity;
}

/**
 * @param readings  array of reading rows (must include id, ts, accel_mag, heart_rate)
 * @param activities array of saved activity signatures
 * @param tolerance  max normalized distance to count as a match (from settings.activity_match_tolerance)
 * @returns Map<readingId, activityName>
 */
function matchActivities(readings, activities, tolerance = 1.5) {
    const sorted = [...readings].sort((a, b) => new Date(a.ts) - new Date(b.ts));
    const buckets = bucketReadings(sorted);
    const labelById = new Map();

    for (const bucket of buckets) {
        const stats = statsForBucket(bucket);
        if (stats.accelMean == null || !activities.length) continue;

        let best = null;
        let bestDist = Infinity;
        for (const activity of activities) {
            const d = distance(stats, activity, tolerance);
            if (d < bestDist) {
                bestDist = d;
                best = activity;
            }
        }

        if (best) {
            for (const id of stats.ids) labelById.set(id, best.name);
        }
    }

    return labelById;
}

/** Computes the signature to save when the user labels a time range from the dashboard. */
function computeSignature(readings) {
    const accelMags = readings.map((r) => r.accel_mag).filter((v) => v != null);
    const hrs = readings.map((r) => r.heart_rate).filter((v) => v != null);
    const accelMean = mean(accelMags);
    const hrMean = mean(hrs);

    return {
        accel_mag_mean: accelMean ?? 0,
        accel_mag_std: accelMean != null ? std(accelMags, accelMean) : 0,
        hr_mean: hrMean,
        hr_std: hrMean != null ? std(hrs, hrMean) : 0,
    };
}

module.exports = { matchActivities, computeSignature, WINDOW_MS };
