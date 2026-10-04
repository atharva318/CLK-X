const express = require('express');
const { supabase } = require('../lib/supabase');
const { computeSignature } = require('../lib/activityMatcher');

const router = express.Router();

// GET /api/activities
router.get('/', async (req, res) => {
    const { data, error } = await supabase.from('activities').select('*').order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ activities: data });
});

// POST /api/activities
// body: { name, color?, device_id?, from, to }   <- labels a time range you picked on the dashboard
// or:   { name, color?, accel_mag_mean, accel_mag_std, hr_mean, hr_std }  <- manual signature
router.post('/', async (req, res) => {
    const { name, color, device_id, from, to } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });

    let signature = {
        accel_mag_mean: req.body.accel_mag_mean,
        accel_mag_std: req.body.accel_mag_std ?? 0,
        hr_mean: req.body.hr_mean,
        hr_std: req.body.hr_std ?? 0,
    };

    if (from && to) {
        let query = supabase.from('readings').select('*').gte('ts', from).lte('ts', to);
        if (device_id) query = query.eq('device_id', device_id);
        const { data, error } = await query;
        if (error) return res.status(500).json({ error: error.message });
        if (!data.length) return res.status(400).json({ error: 'no readings found in that time range' });
        signature = computeSignature(data);
    }

    if (signature.accel_mag_mean == null) {
        return res.status(400).json({ error: 'provide either a from/to range or an explicit accel_mag_mean' });
    }

    const { data, error } = await supabase
        .from('activities')
        .insert({ name, color: color || '#38bdf8', ...signature })
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ activity: data });
});

// PUT /api/activities/:id
router.put('/:id', async (req, res) => {
    const { name, color, accel_mag_mean, accel_mag_std, hr_mean, hr_std } = req.body || {};
    const { data, error } = await supabase
        .from('activities')
        .update({
            ...(name !== undefined && { name }),
            ...(color !== undefined && { color }),
            ...(accel_mag_mean !== undefined && { accel_mag_mean }),
            ...(accel_mag_std !== undefined && { accel_mag_std }),
            ...(hr_mean !== undefined && { hr_mean }),
            ...(hr_std !== undefined && { hr_std }),
            updated_at: new Date().toISOString(),
        })
        .eq('id', req.params.id)
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ activity: data });
});

// DELETE /api/activities/:id
router.delete('/:id', async (req, res) => {
    const { error } = await supabase.from('activities').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
});

module.exports = router;
