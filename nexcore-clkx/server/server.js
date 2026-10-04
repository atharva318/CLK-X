const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
const envExamplePath = path.join(__dirname, '.env.example');

if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
    fs.copyFileSync(envExamplePath, envPath);
    console.warn('[nexcore] No .env file found; created one from .env.example. Fill in your real Supabase credentials before using the database.');
}

require('dotenv').config();
const express = require('express');

const syncRoute = require('./routes/sync');
const readingsRoute = require('./routes/readings');
const activitiesRoute = require('./routes/activities');
const buttonsRoute = require('./routes/buttons');
const settingsRoute = require('./routes/settings');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '5mb' })); // a full day of readings can be a decent-sized batch
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/sync', syncRoute);
app.use('/api/readings', readingsRoute);
app.use('/api/activities', activitiesRoute);
app.use('/api/buttons', buttonsRoute);
app.use('/api/settings', settingsRoute);

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
    console.log(`[nexcore] CLK-X dashboard listening on port ${PORT}`);
});
