const express = require('express');
const { supabase } = require('../lib/supabase');

const router = express.Router();

// GET /api/buttons  — the watch calls this (or reads it back from /api/sync) to
// pick up whatever functions were assigned from the dashboard.
router.get('/', async (req, res) => {
    const { data, error } = await supabase.from('button_config').select('*').order('button_index');
    if (error) return res.status(500).json({ error: error.message });
    res.json({ buttons: data });
});

// PUT /api/buttons/:index   body: { label, function_name, payload }
router.put('/:index', async (req, res) => {
    const index = Number(req.params.index);
    if (![1, 2, 3].includes(index)) return res.status(400).json({ error: 'button index must be 1, 2, or 3' });

    const { label, function_name, payload } = req.body || {};
    const { data, error } = await supabase
        .from('button_config')
        .update({
            ...(label !== undefined && { label }),
            ...(function_name !== undefined && { function_name }),
            ...(payload !== undefined && { payload }),
            updated_at: new Date().toISOString(),
        })
        .eq('button_index', index)
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ button: data });
});

module.exports = router;
