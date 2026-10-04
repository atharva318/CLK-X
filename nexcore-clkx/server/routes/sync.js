const express = require('express');
const { supabase } = require('../lib/supabase');
const { matchActivities } = require('../lib/activityMatcher');

const router = express.Router();

function accelMagnitude(r) {
    if (r.ax == null || r.ay == null || r.az == null) return null;
    return Math.sqrt(r.ax ** 2 + r.ay ** 2 + r.az ** 2);
}

// POST /api/sync
// body: { device_id, readings: [{ ts, ax,ay,az,gx,gy,gz, heart_rate, spo2,
//                                  temperature, pressure, altitude, wear_state }, ...] }
//
// Called by the watch once it's back in contact with the laptop. Returns
// the current button config + thresholds so the watch can refresh those in
// the same round trip, and a count so it knows the upload succeeded (-> the
// watch turns its green LED on after getting a 200 back).
router.post('/', async (req, res) => {
    const { device_id, readings } = req.body || {};

    if (!device_id || !Array.isArray(readings) || readings.length === 0) {
        return res.status(400).json({ error: 'device_id and a non-empty readings array are required' });
    }

    const rows = readings.map((r) => ({
        device_id,
        ts: r.ts,
        ax: r.ax, ay: r.ay, az: r.az,
        gx: r.gx, gy: r.gy, gz: r.gz,
        accel_mag: accelMagnitude(r),
        heart_rate: r.heart_rate,
        spo2: r.spo2,
        temperature: r.temperature,
        pressure: r.pressure,
        altitude: r.altitude,
        wear_state: r.wear_state,
    }));

    try {
        await supabase.from('devices').upsert({ device_id, last_seen: new Date().toISOString() });

        // upsert on (device_id, ts) so a retried/partial sync doesn't duplicate rows
        const { data: inserted, error: insertErr } = await supabase
            .from('readings')
            .upsert(rows, { onConflict: 'device_id,ts' })
            .select('id, ts, accel_mag, heart_rate');

        if (insertErr) throw insertErr;

        await supabase.from('sync_log').insert({
            device_id,
            reading_count: rows.length,
        });

        // best-effort auto-labeling against saved activity signatures
        const [{ data: activities }, { data: settingsRows }] = await Promise.all([
            supabase.from('activities').select('*'),
            supabase.from('settings').select('*').eq('key', 'activity_match_tolerance'),
        ]);
        const tolerance = settingsRows?.[0]?.value ?? 1.5;

        if (activities?.length && inserted?.length) {
            const labels = matchActivities(inserted, activities, tolerance);
            const updates = [...labels.entries()].map(([id, activity_label]) =>
                supabase.from('readings').update({ activity_label }).eq('id', id)
            );
            await Promise.all(updates);
        }

        const [{ data: buttons }, { data: settings }] = await Promise.all([
            supabase.from('button_config').select('*').order('button_index'),
            supabase.from('settings').select('*'),
        ]);

        res.json({
            ok: true,
            inserted: rows.length,
            buttons,
            settings: Object.fromEntries((settings || []).map((s) => [s.key, s.value])),
        });
    } catch (err) {
        console.error('[sync] failed:', err.message);
        res.status(500).json({ error: 'sync failed', detail: err.message });
    }
});

module.exports = router;
