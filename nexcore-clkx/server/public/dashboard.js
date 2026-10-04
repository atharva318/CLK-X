const $ = (id) => document.getElementById(id);
const statusEl = $('status');

let charts = {};

function toISO(localValue) {
  return localValue ? new Date(localValue).toISOString() : null;
}

function setDefaultRange() {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  $('toInput').value = toLocalInputValue(now);
  $('fromInput').value = toLocalInputValue(yesterday);
}

function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `request to ${path} failed (${res.status})`);
  }
  return res.json();
}

function activityColorFor(label, activities) {
  const a = activities.find((x) => x.name === label);
  return a ? a.color : 'rgba(255,255,255,0.15)';
}

function buildChart(canvasId, datasets, yLabel) {
  if (charts[canvasId]) charts[canvasId].destroy();
  const ctx = $(canvasId).getContext('2d');
  charts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: { datasets },
    options: {
      parsing: false,
      animation: false,
      scales: {
        x: { type: 'time', time: { unit: 'minute' }, ticks: { color: '#8aa0c2' }, grid: { color: '#223049' } },
        y: { title: { display: !!yLabel, text: yLabel, color: '#8aa0c2' }, ticks: { color: '#8aa0c2' }, grid: { color: '#223049' } },
      },
      plugins: { legend: { labels: { color: '#e6edf7' } } },
      elements: { point: { radius: 0 }, line: { borderWidth: 1.5 } },
    },
  });
}

function toPoints(readings, field) {
  return readings.filter((r) => r[field] != null).map((r) => ({ x: new Date(r.ts), y: r[field] }));
}

async function loadReadings() {
  const device_id = $('deviceId').value.trim();
  const from = toISO($('fromInput').value);
  const to = toISO($('toInput').value);

  const params = new URLSearchParams();
  if (device_id) params.set('device_id', device_id);
  if (from) params.set('from', from);
  if (to) params.set('to', to);

  statusEl.textContent = 'loading...';
  const { readings } = await api(`/api/readings?${params.toString()}`);
  statusEl.textContent = readings.length
    ? `${readings.length} readings · ${new Date(readings[0].ts).toLocaleString()} → ${new Date(readings[readings.length - 1].ts).toLocaleString()}`
    : 'no readings in that range';

  const { activities } = await api('/api/activities');

  buildChart('motionChart', [
    { label: 'accel magnitude', data: toPoints(readings, 'accel_mag'), borderColor: '#38bdf8', pointBackgroundColor: readings.map((r) => activityColorFor(r.activity_label, activities)) },
  ], 'g');

  buildChart('hrChart', [
    { label: 'heart rate (bpm)', data: toPoints(readings, 'heart_rate'), borderColor: '#f97316' },
    { label: 'SpO2 (%)', data: toPoints(readings, 'spo2'), borderColor: '#a3e635' },
  ]);

  buildChart('envChart', [
    { label: 'pressure (hPa)', data: toPoints(readings, 'pressure'), borderColor: '#c084fc' },
    { label: 'temperature (°C)', data: toPoints(readings, 'temperature'), borderColor: '#fb7185' },
    { label: 'altitude (m)', data: toPoints(readings, 'altitude'), borderColor: '#5eead4' },
  ]);

  renderActivitiesTable(activities);
}

function renderActivitiesTable(activities) {
  const tbody = document.querySelector('#activitiesTable tbody');
  tbody.innerHTML = '';
  for (const a of activities) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="swatch" style="background:${a.color}"></span></td>
      <td>${a.name}</td>
      <td>${a.accel_mag_mean?.toFixed(2) ?? '—'}</td>
      <td>${a.hr_mean != null ? a.hr_mean.toFixed(0) : '—'}</td>
      <td><button class="secondary danger" data-id="${a.id}">Delete</button></td>
    `;
    tr.querySelector('button').addEventListener('click', async () => {
      await api(`/api/activities/${a.id}`, { method: 'DELETE' });
      loadReadings();
    });
    tbody.appendChild(tr);
  }
}

async function previewRange() {
  const device_id = $('deviceId').value.trim();
  const from = toISO($('fromInput').value);
  const to = toISO($('toInput').value);
  if (!from || !to) return;

  const params = new URLSearchParams({ from, to });
  if (device_id) params.set('device_id', device_id);

  const result = await api(`/api/readings/stats?${params.toString()}`);
  $('previewOut').textContent = JSON.stringify(result, null, 2);
}

async function saveActivity() {
  const name = $('activityName').value.trim();
  if (!name) return alert('give the activity a name first');

  const device_id = $('deviceId').value.trim();
  const from = toISO($('fromInput').value);
  const to = toISO($('toInput').value);
  const color = $('activityColor').value;

  await api('/api/activities', {
    method: 'POST',
    body: JSON.stringify({ name, color, device_id: device_id || undefined, from, to }),
  });
  $('activityName').value = '';
  loadReadings();
}

async function loadButtons() {
  const { buttons } = await api('/api/buttons');
  const container = $('buttonsForm');
  container.innerHTML = '';

  for (const b of buttons) {
    const row = document.createElement('div');
    row.className = 'button-row';
    row.innerHTML = `
      <label>#${b.button_index}</label>
      <label>Label <input data-field="label" value="${b.label ?? ''}" /></label>
      <label>Function <input data-field="function_name" value="${b.function_name ?? ''}" /></label>
    `;
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.className = 'secondary';
    saveBtn.addEventListener('click', async () => {
      const label = row.querySelector('[data-field="label"]').value;
      const function_name = row.querySelector('[data-field="function_name"]').value;
      await api(`/api/buttons/${b.button_index}`, { method: 'PUT', body: JSON.stringify({ label, function_name }) });
      saveBtn.textContent = 'Saved ✓';
      setTimeout(() => (saveBtn.textContent = 'Save'), 1200);
    });
    row.appendChild(saveBtn);
    container.appendChild(row);
  }
}

async function loadSettings() {
  const { settings } = await api('/api/settings');
  const container = $('settingsForm');
  container.innerHTML = '';

  for (const [key, value] of Object.entries(settings)) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<label>${key} <input value='${JSON.stringify(value)}' data-key="${key}" /></label>`;
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.className = 'secondary';
    saveBtn.addEventListener('click', async () => {
      const input = row.querySelector('input');
      let parsed;
      try { parsed = JSON.parse(input.value); } catch { parsed = input.value; }
      await api(`/api/settings/${key}`, { method: 'PUT', body: JSON.stringify({ value: parsed }) });
      saveBtn.textContent = 'Saved ✓';
      setTimeout(() => (saveBtn.textContent = 'Save'), 1200);
    });
    row.appendChild(saveBtn);
    container.appendChild(row);
  }
}

$('loadBtn').addEventListener('click', () => loadReadings().catch((e) => alert(e.message)));
$('last24hBtn').addEventListener('click', () => { setDefaultRange(); loadReadings().catch((e) => alert(e.message)); });
$('previewBtn').addEventListener('click', () => previewRange().catch((e) => alert(e.message)));
$('saveActivityBtn').addEventListener('click', () => saveActivity().catch((e) => alert(e.message)));

setDefaultRange();
loadButtons().catch((e) => console.error(e));
loadSettings().catch((e) => console.error(e));
loadReadings().catch((e) => { statusEl.textContent = 'no data yet (sync the watch, or check SUPABASE env vars)'; });
