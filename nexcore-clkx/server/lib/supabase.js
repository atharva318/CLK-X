const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
    console.warn(
        '[supabase] SUPABASE_URL / SUPABASE_SERVICE_KEY are not set — the server ' +
        'will start but every DB call will fail until you set them in .env (or Render env vars).'
    );
}

const supabase = createClient(url || 'http://localhost', key || 'placeholder', {
    auth: { persistSession: false },
});

module.exports = { supabase };
