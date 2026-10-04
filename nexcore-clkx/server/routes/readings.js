const express = require('express');
const { supabase } = require('../lib/supabase');
const { computeSignature } = require('../lib/activityMatcher');

const router = express.Router();

// GET /api/readings?device_id=&from=&to=&limit=
router.get('/', async (req, res) => {
    const { device_id, from, to, limit = 2000 } = req.query;

    let query = supabase.from('readings').select('*').order('ts', { ascending: true }).limit(Number(limit));
    if (device_id) query = query.eq('device_id', device_id);
    if (from) query = query.gte('ts', from);
    if (to) query = query.lte('ts', to);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ readings: data });
});

// GET /api/readings/stats?device_id=&from=&to=
// Quick preview stats for a selected range, used by the "label this range"
// panel before the user commits to saving it as an activity.
router.get('/stats', async (req, res) => {
    const { device_id, from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to are required' });

    let query = supabase.from('readings').select('*').gte('ts', from).lte('ts', to);
    if (device_id) query = query.eq('device_id', device_id);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    if (!data.length) return res.json({ count: 0 });

    res.json({ count: data.length, signature: computeSignature(data) });
});

module.exports = router;
