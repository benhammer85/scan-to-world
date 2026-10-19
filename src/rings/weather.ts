/**
 * The weather where you are, for the grove: asked for only once you say so, and then only roughly (where to a
 * tenth of a degree, some ten kilometres), from Open-Meteo (no account), once an hour at most. The grove eases
 * into what's outside over a minute or so; nothing is forecast, nothing is numbered.
 * (`?weather=rain`, `snow`, `fog`, `cloud`, `wind`, `storm` or `clear`, with `:0.6` for how much, to try one.)
 */
export type Sky = { cloud: number; rain: number; snow: number; fog: number; wind: number; windDx: number; windDy: number };
export const CLEAR: Sky = { cloud: 0, rain: 0, snow: 0, fog: 0, wind: 0.15, windDx: 1, windDy: 0 };

const ON = 'annulus.weather', WHERE = 'annulus.where', LAST = 'annulus.sky';
const HOUR = 3600e3;
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* not kept, then */ } };

const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const tried = (() => {
  const w = params.get('weather');
  if (!w) return null;
  const [kind, amt] = w.split(':'), a = Math.max(0, Math.min(1, Number(amt ?? 0.8) || 0.8));
  const s: Sky = { ...CLEAR };
  if (kind === 'rain') { s.rain = a; s.cloud = 0.9; s.wind = 0.35; }
  else if (kind === 'storm') { s.rain = 1; s.cloud = 1; s.wind = 0.9; }
  else if (kind === 'snow') { s.snow = a; s.cloud = 0.8; s.wind = 0.25; }
  else if (kind === 'fog') { s.fog = a; s.cloud = 0.7; s.wind = 0.05; }
  else if (kind === 'cloud') s.cloud = a;
  else if (kind === 'wind') { s.wind = a; s.cloud = 0.3; }
  s.windDx = Math.cos(0.5); s.windDy = Math.sin(0.5);
  return s;
})();

/** Whether the grove takes its weather from where you are. */
export const weatherOn = (): boolean => !!tried || get(ON) === 'on';

let want: Sky = tried ?? CLEAR, shown: Sky = { ...want }, shownAt = 0, asking = false;
// (The last weather known, kept: the grove opens as it was, never clear and then raining.)
try { const l = JSON.parse(get(LAST) || 'null'); if (!tried && l && get(ON) === 'on') { want = l.sky; shown = { ...l.sky }; } } catch { /* clear, then */ }

/** Turned on (asking where, once) or off. Resolves whether it's on. */
export async function setWeather(on: boolean): Promise<boolean> {
  if (!on) { set(ON, null); set(WHERE, null); set(LAST, null); want = { ...CLEAR }; return false; }
  const where = await locate();
  if (!where) return false;
  set(ON, 'on');
  await refresh(true);
  return true;
}
function locate(): Promise<[number, number] | null> {
  return new Promise((done) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { done(null); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        // (Only roughly: a tenth of a degree, never the street.)
        const w: [number, number] = [Math.round(p.coords.latitude * 10) / 10, Math.round(p.coords.longitude * 10) / 10];
        set(WHERE, JSON.stringify({ w, at: Date.now() })); done(w);
      },
      () => done(null),
      { enableHighAccuracy: false, maximumAge: 6 * HOUR, timeout: 20e3 },
    );
  });
}
/** The weather asked for again, if an hour has gone by (or `now`). */
async function refresh(now = false): Promise<void> {
  if (tried || asking || get(ON) !== 'on') return;
  let last: { at: number } | null = null;
  try { last = JSON.parse(get(LAST) || 'null'); } catch { /* none */ }
  if (!now && last && Date.now() - last.at < HOUR) return;
  asking = true;
  try {
    let where: { w: [number, number]; at: number } | null = null;
    try { where = JSON.parse(get(WHERE) || 'null'); } catch { /* none */ }
    // (Where you are, looked at again once a day, in case you've gone somewhere.)
    if (!where || Date.now() - where.at > 24 * HOUR) { const w = await locate(); if (w) where = { w, at: Date.now() }; }
    if (!where) return;
    const [lat, lon] = where.w;
    // (Given up on after a while: never left asking.)
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=weather_code,cloud_cover,wind_speed_10m,wind_direction_10m`, { signal: AbortSignal.timeout?.(15e3) });
    if (!r.ok) return;
    const c = (await r.json()).current;
    want = skyOf(c.weather_code, c.cloud_cover, c.wind_speed_10m, c.wind_direction_10m);
    set(LAST, JSON.stringify({ sky: want, at: Date.now() }));
  } catch { /* the weather as it was, then */ } finally { asking = false; }
}
/** WMO's weather codes, as the grove shows them. */
function skyOf(code: number, cover: number, kmh: number, from: number): Sky {
  const s: Sky = { ...CLEAR, cloud: Math.max(0, Math.min(1, (cover ?? 0) / 100)), wind: Math.max(0, Math.min(1, (kmh ?? 0) / 40)) };
  // (The wind blows toward the far side from where it comes: north up the sheet.)
  const b = (((from ?? 270) + 180) * Math.PI) / 180;
  s.windDx = Math.sin(b); s.windDy = -Math.cos(b);
  const rain: Record<number, number> = { 51: 0.25, 53: 0.35, 55: 0.45, 56: 0.35, 57: 0.5, 61: 0.45, 63: 0.7, 65: 1, 66: 0.6, 67: 0.9, 80: 0.5, 81: 0.75, 82: 1, 95: 1, 96: 1, 99: 1 };
  const snow: Record<number, number> = { 71: 0.4, 73: 0.7, 75: 1, 77: 0.3, 85: 0.6, 86: 1 };
  if (rain[code]) { s.rain = rain[code]; s.cloud = Math.max(s.cloud, 0.85); }
  if (snow[code]) { s.snow = snow[code]; s.cloud = Math.max(s.cloud, 0.8); }
  if (code === 45 || code === 48) { s.fog = code === 48 ? 1 : 0.75; s.cloud = Math.max(s.cloud, 0.7); }
  if (code >= 95) s.wind = Math.max(s.wind, 0.7);
  return s;
}
/** The weather as the grove shows it now (`t` seconds): eased toward what's outside over a minute or so. */
export function skyNow(t: number): Sky {
  if (!tried && get(ON) === 'on') void refresh();
  const dt = Math.min(1, Math.max(0, t - shownAt)); shownAt = t;
  const k = 1 - Math.exp(-dt / 25);
  for (const key of Object.keys(shown) as (keyof Sky)[]) shown[key] += (want[key] - shown[key]) * k;
  return shown;
}
/** How dim the sun is under it (0 clear to 1 gone), in steps, so the grove's light is drawn afresh only now and then. */
export const overcast = (s: Sky): number => Math.round(Math.max(s.cloud * 0.75, s.rain, s.snow * 0.9, s.fog) * 4) / 4;
