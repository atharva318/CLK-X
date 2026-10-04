-- NEXCORE / CLK-X dashboard schema
-- Run this in the Supabase SQL editor (or any Postgres instance) before
-- deploying the server.

create extension if not exists pgcrypto;

-- One row per watch (useful once you have more than one CLK-X).
create table if not exists devices (
    device_id   text primary key,
    name        text not null default 'CLK-X',
    last_seen   timestamptz
);

-- Raw sensor readings, synced in batches whenever the watch comes in
-- contact with the laptop.
create table if not exists readings (
    id            uuid primary key default gen_random_uuid(),
    device_id     text not null references devices(device_id),
    ts            timestamptz not null,          -- when the watch recorded it
    synced_at     timestamptz not null default now(),

    -- MPU6050
    ax numeric, ay numeric, az numeric,
    gx numeric, gy numeric, gz numeric,
    accel_mag numeric,                            -- sqrt(ax^2+ay^2+az^2), computed on ingest

    -- MAX30100
    heart_rate numeric,
    spo2       numeric,

    -- BMP280
    temperature numeric,
    pressure    numeric,
    altitude    numeric,

    wear_state  boolean,                          -- true = on wrist
    activity_label text,                           -- filled in by the auto-matcher, editable later

    constraint readings_ts_device unique (device_id, ts)
);

create index if not exists idx_readings_device_ts on readings (device_id, ts desc);
create index if not exists idx_readings_activity on readings (activity_label);

-- Named activity "signatures" you define from the dashboard, e.g. "running",
-- "jogging", "walking", "badminton". New readings get matched against these.
create table if not exists activities (
    id              uuid primary key default gen_random_uuid(),
    name            text not null unique,
    accel_mag_mean  numeric not null,
    accel_mag_std   numeric not null default 0,
    hr_mean         numeric,
    hr_std          numeric default 0,
    color           text default '#38bdf8',        -- for the dashboard timeline
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

-- The 3 tactile buttons, remotely configurable from the dashboard. The
-- watch fetches this table (GET /api/buttons) whenever it syncs.
create table if not exists button_config (
    button_index  int primary key check (button_index in (1, 2, 3)),
    label         text not null default 'unassigned',
    function_name text not null default 'none',    -- e.g. "show_hr", "toggle_backlight", "mark_activity"
    payload       jsonb not null default '{}'::jsonb,
    updated_at    timestamptz not null default now()
);

insert into button_config (button_index, label, function_name)
values (1, 'Button 1', 'none'), (2, 'Button 2', 'none'), (3, 'Button 3', 'none')
on conflict (button_index) do nothing;

-- Global thresholds, editable from the dashboard, fetched by the watch at
-- sync time (e.g. what heart rate counts as "too high" -> red LED).
create table if not exists settings (
    key         text primary key,
    value       jsonb not null,
    updated_at  timestamptz not null default now()
);

insert into settings (key, value) values
    ('hr_high_threshold', '130'),
    ('hr_low_threshold', '40'),
    ('activity_match_tolerance', '1.5')
on conflict (key) do nothing;

-- One row per sync event, mostly for the dashboard's "last synced" display
-- and for debugging flaky uploads.
create table if not exists sync_log (
    id            uuid primary key default gen_random_uuid(),
    device_id     text not null references devices(device_id),
    synced_at     timestamptz not null default now(),
    reading_count int not null,
    note          text
);
