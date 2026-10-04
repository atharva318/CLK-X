const express = require('express');
const { supabase } = require('../lib/supabase');

const router = express.Router();

// GET /api/settings
router.get('/', async (req, res) => {
    const { data, error } = await supabase.from('settings').select('*');
    if (error) return res.status(500).json({ error: error.message });
    res.json({ settings: Object.fromEntries(data.map((s) => [s.key, s.value])) });
});

// PUT /api/settings/:key   body: { value }
router.put('/:key', async (req, res) => {
    const { value } = req.body || {};
    if (value === undefined) return res.status(400).json({ error: 'value is required' });

    const { data, error } = await supabase
        .from('settings')
        .upsert({ key: req.params.key, value, updated_at: new Date().toISOString() })
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ setting: data });
});

module.exports = router;
