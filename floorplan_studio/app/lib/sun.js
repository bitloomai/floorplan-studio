/**
 * sun.js — solar position and the daylight model.
 *
 * Two separable things live here on purpose:
 *
 *   position(lat, lon, date)  pure astronomy. No project, no rooms.
 *   daylight(...)             how much of that reaches each room, given the
 *                             openings in its boundaries.
 *
 * Everything the model uses is CONFIG. There is no hardcoded house here: the
 * extinction curve, the beam cap, the horizon fade, the weather multipliers and
 * the solar-sensor corroboration are all fields on `sunConfig`, defaulted in
 * DEFAULTS below. A floor may override the house, and a room may override its
 * floor, so "sun on the whole house" and "sun on just this floor" are the same
 * mechanism at two scopes rather than two features.
 *
 * Runs in Node and the browser.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SunModel = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RAD = Math.PI / 180, DEG = 180 / Math.PI;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

  /* ---------------------------------------------------------------- position */

  /* NOAA solar position. Accurate to well under a degree for any date this
   * century, which is far finer than a floor plan can show — the point of using
   * the real algorithm rather than a sine approximation is that the AZIMUTH is
   * right, and azimuth is what decides which wall a sun patch lands on. */
  function position(lat, lon, date) {
    const d = date || new Date();
    const jd = d.getTime() / 86400000 + 2440587.5;
    const t = (jd - 2451545) / 36525;                       // Julian centuries

    const L0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
    const M = 357.52911 + t * (35999.05029 - 0.0001537 * t);
    const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
    const C = Math.sin(M * RAD) * (1.914602 - t * (0.004817 + 0.000014 * t))
            + Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * t)
            + Math.sin(3 * M * RAD) * 0.000289;
    const trueLong = L0 + C;
    const omega = 125.04 - 1934.136 * t;
    const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);

    const seconds = 21.448 - t * (46.815 + t * (0.00059 - t * 0.001813));
    const e0 = 23 + (26 + seconds / 60) / 60;
    const eps = e0 + 0.00256 * Math.cos(omega * RAD);

    const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(appLong * RAD)) * DEG;

    const y = Math.tan((eps / 2) * RAD) ** 2;
    const eqTime = 4 * DEG * (
      y * Math.sin(2 * L0 * RAD)
      - 2 * e * Math.sin(M * RAD)
      + 4 * e * y * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD)
      - 0.5 * y * y * Math.sin(4 * L0 * RAD)
      - 1.25 * e * e * Math.sin(2 * M * RAD)
    );

    // Minutes past local midnight, from the machine's own clock offset. Using
    // the browser's timezone rather than a stored one keeps "now" honest when
    // you open the plan from a phone in another country.
    const mins = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
    const tzOffsetMin = -d.getTimezoneOffset();
    const trueSolarTime = (mins + eqTime + 4 * lon - tzOffsetMin + 1440) % 1440;
    let hourAngle = trueSolarTime / 4 - 180;
    if (hourAngle < -180) hourAngle += 360;

    const latR = lat * RAD, declR = decl * RAD, haR = hourAngle * RAD;
    const cosZenith = clamp(
      Math.sin(latR) * Math.sin(declR) + Math.cos(latR) * Math.cos(declR) * Math.cos(haR), -1, 1);
    const zenith = Math.acos(cosZenith) * DEG;
    const elevation = 90 - zenith;

    let azimuth;
    const denom = Math.cos(latR) * Math.sin(zenith * RAD);
    if (Math.abs(denom) > 1e-9) {
      let az = Math.acos(clamp((Math.sin(latR) * cosZenith - Math.sin(declR)) / denom, -1, 1)) * DEG;
      azimuth = hourAngle > 0 ? (az + 180) % 360 : (540 - az) % 360;
    } else {
      azimuth = lat > 0 ? 180 : 0;
    }

    // Atmospheric refraction lifts a low sun; it is what makes sunset later
    // than geometry says, and it matters exactly when beams are longest.
    let refraction = 0;
    if (elevation <= 85) {
      const te = Math.tan(elevation * RAD);
      if (elevation > 5) refraction = 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5;
      else if (elevation > -0.575) refraction = 1735 + elevation * (-518.2 + elevation * (103.4 + elevation * (-12.79 + elevation * 0.711)));
      else refraction = -20.772 / te;
      refraction /= 3600;
    }

    return {
      elevation: elevation + refraction,
      azimuth,
      declination: decl,
      above: elevation + refraction > 0,
      at: d.toISOString(),
    };
  }

  /* Sunrise/sunset for the day, for the timeline scrubber. */
  function dayEvents(lat, lon, date) {
    const d = new Date(date || Date.now());
    d.setHours(0, 0, 0, 0);
    const out = { sunrise: null, sunset: null, solarNoon: null, maxElevation: -90 };
    let prev = null;
    for (let m = 0; m <= 1440; m += 4) {
      const t = new Date(d.getTime() + m * 60000);
      const p = position(lat, lon, t);
      if (p.elevation > out.maxElevation) { out.maxElevation = p.elevation; out.solarNoon = t.toISOString(); }
      if (prev && prev.elevation < 0 && p.elevation >= 0) out.sunrise = t.toISOString();
      if (prev && prev.elevation >= 0 && p.elevation < 0) out.sunset = t.toISOString();
      prev = p;
    }
    return out;
  }

  /* ---------------------------------------------------------------- config */

  const DEFAULTS = {
    enabled: false,
    location: { lat: null, lon: null, label: '' },
    /* Where the sun's compass bearing lands on screen. This is the ONLY place
     * the rotation lives: everything else in the app is screen-relative, and a
     * plan drawn with north to the left is a setting, not a convention to
     * remember. `screenUpBearing` is the compass bearing that points up the
     * screen; 0 = north up, 90 = east up, and so on. */
    screenUpBearing: 0,
    /* Sky brightness vs solar elevation. Peaks well before zenith because a
     * plan cares about how much light gets THROUGH a window, and a high sun
     * enters a vertical opening at a poor angle. */
    extinction: { riseAt: -6, peakFrom: 18, peakTo: 30, falloff: 0.55 },
    /* How far a beam is drawn: head height / tan(elevation), capped. */
    beam: { headFt: 6.5, maxFt: 18, minElevation: 4, spreadDeg: 6 },
    /* `outdoor` is the sky fraction a room with no roof gets — see
     * roomDaylight(). 1 is open sky; lower it for a space that is open above
     * but overshadowed.
     *
     * `referenceExposure` is the glazed-area-to-floor-area ratio that counts as
     * FULLY daylit. Without it, exposure is read raw, and a real room glazed to
     * 8% of its floor comes out at 0.08 — so the exposure term contributes
     * almost nothing and every indoor room collapses onto `scatter`. Building
     * practice puts usable daylight at roughly 10% glazing and good daylight at
     * 20%, so 0.16 sits in the middle of the range people actually build to.
     * A room may override it: `room.daylight.referenceExposure`. */
    ambient: { nightFloor: 0.06, max: 1.0, scatter: 0.22, outdoor: 1, referenceExposure: 0.16 },
    /* Multipliers by weather state, matched against the weather entity. */
    weather: {
      entity: null,
      factors: {
        sunny: 1, clear: 1, 'clear-night': 1, partlycloudy: 0.78, cloudy: 0.5,
        rainy: 0.4, pouring: 0.3, lightning: 0.35, 'lightning-rainy': 0.35,
        snowy: 0.55, 'snowy-rainy': 0.45, fog: 0.35, hail: 0.4, windy: 0.9,
        'windy-variant': 0.9, exceptional: 0.8,
      },
      default: 0.85,
    },
    /* Optional corroboration from a real power sensor: if the panels say it is
     * dark, believe them over the almanac. Ignored below minElevation because a
     * low sun makes almost no power even on a clear day, so a near-zero reading
     * there says nothing about the sky. */
    solarSensor: { entity: null, peakW: null, weight: 0.4, minElevation: 12 },
    /* Sensor overrides: use Home Assistant's own sun.sun instead of computing.
     * Useful when HA already knows the location and you would rather have one
     * source of truth than two that can disagree. */
    source: 'compute',        // 'compute' | 'entity'
    sunEntity: 'sun.sun',
  };

  function mergeConfig(...layers) {
    const out = JSON.parse(JSON.stringify(DEFAULTS));
    for (const layer of layers) {
      if (!layer) continue;
      for (const [k, v] of Object.entries(layer)) {
        if (v === undefined || v === null) continue;
        if (typeof v === 'object' && !Array.isArray(v) && typeof out[k] === 'object' && out[k] !== null && !Array.isArray(out[k])) {
          out[k] = Object.assign({}, out[k], v);
          // one more level, for weather.factors
          for (const [k2, v2] of Object.entries(v)) {
            if (typeof v2 === 'object' && !Array.isArray(v2) && typeof out[k][k2] === 'object') {
              out[k][k2] = Object.assign({}, out[k][k2], v2);
            }
          }
        } else out[k] = v;
      }
    }
    return out;
  }

  /* ---------------------------------------------------------------- scene */

  /* Sky strength 0..1 from elevation, via the configured extinction curve. */
  function skyStrength(elev, cfg) {
    const e = cfg.extinction;
    if (elev <= e.riseAt) return 0;
    if (elev < e.peakFrom) return clamp((elev - e.riseAt) / (e.peakFrom - e.riseAt), 0, 1);
    if (elev <= e.peakTo) return 1;
    return clamp(1 - ((elev - e.peakTo) / (90 - e.peakTo)) * e.falloff, 0, 1);
  }

  function weatherFactor(cfg, states) {
    const id = cfg.weather.entity;
    if (!id || !states || !states[id]) return cfg.weather.default;
    const st = states[id].state;
    const f = cfg.weather.factors[st];
    return f === undefined ? cfg.weather.default : f;
  }

  function solarFactor(cfg, states, elev) {
    const s = cfg.solarSensor;
    if (!s.entity || !states || !states[s.entity]) return null;
    if (elev < s.minElevation) return null;
    const raw = parseFloat(states[s.entity].state);
    if (!isFinite(raw)) return null;
    const peak = num(s.peakW, 0);
    if (peak <= 0) return null;
    return clamp(raw / peak, 0, 1);
  }

  /* Resolve "what is the sun doing right now" for a scope (house or floor). */
  function scene(cfg, states, when) {
    if (!cfg.enabled) return null;

    let elevation, azimuth;
    if (cfg.source === 'entity') {
      const st = states && states[cfg.sunEntity];
      if (!st || !st.attributes) return null;
      elevation = num(st.attributes.elevation, NaN);
      azimuth = num(st.attributes.azimuth, NaN);
      if (!isFinite(elevation) || !isFinite(azimuth)) return null;
    } else {
      const { lat, lon } = cfg.location || {};
      if (typeof lat !== 'number' || typeof lon !== 'number') return null;
      const p = position(lat, lon, when);
      elevation = p.elevation; azimuth = p.azimuth;
    }

    const sky = skyStrength(elevation, cfg);
    const wx = weatherFactor(cfg, states);
    const solar = solarFactor(cfg, states, elevation);
    // Blend the almanac with the panels, weighted. The panels only ever pull
    // the estimate DOWN toward what is really happening; they cannot invent
    // light that the geometry says is not there.
    let day = sky * wx;
    if (solar !== null) day = day * (1 - cfg.solarSensor.weight) + Math.min(day, solar) * cfg.solarSensor.weight;
    day = clamp(day, 0, cfg.ambient.max);

    /* Compass bearing -> screen angle. 0 rad points up the screen; angles grow
     * clockwise, which is how SVG's y-down coordinate system works. */
    const screenAngle = ((azimuth - cfg.screenUpBearing) % 360 + 360) % 360;

    return {
      elevation, azimuth, screenAngle,
      day, sky, weather: wx, solar,
      night: day <= cfg.ambient.nightFloor,
      beamLength: elevation > cfg.beam.minElevation
        ? Math.min(cfg.beam.maxFt, cfg.beam.headFt / Math.tan(elevation * RAD))
        : 0,
    };
  }

  /* How much daylight reaches a room, from its own openings.
   *
   * `openings` are the resolved boundary segments that let light through, each
   * carrying an area and a transmission (0..1). This is where a grill, a glass
   * railing, a curtained window and a solid wall stop being special cases and
   * become one number. */
  function roomDaylight(room, openings, sc, cfg) {
    if (!sc) return { ambient: 0, exposure: 0, beams: [] };
    const area = Math.max(1, roomArea(room));
    let glazed = 0;
    const beams = [];

    for (const op of openings) {
      const trans = clamp(num(op.transmission, 1), 0, 1);
      if (trans <= 0) continue;
      const openArea = num(op.width, 0) * num(op.height, 3.5);
      glazed += openArea * trans;

      // A beam is only drawn for an opening whose outward normal actually faces
      // the sun. cos(angle between them) <= 0 means the sun is behind the wall.
      if (sc.beamLength > 0 && op.normalDeg !== undefined) {
        const delta = ((sc.screenAngle - op.normalDeg + 540) % 360) - 180;
        const facing = Math.cos(delta * RAD);
        if (facing > 0.08) {
          beams.push({
            at: op.at, width: op.width, normalDeg: op.normalDeg,
            length: sc.beamLength * facing,
            strength: clamp(sc.day * trans * facing, 0, 1),
            spreadDeg: cfg.beam.spreadDeg,
          });
        }
      }
    }

    /* An OUTDOOR room has no roof, so its daylight is not a question about
     * openings at all — a terrace, a car park and a courtyard are lit from
     * directly above whether or not anything was ever drawn in their walls.
     *
     * Without this, `glazed / area` reads 0 for every unwalled space and the
     * biggest open area in a house comes out darker than its own stairwell,
     * which is both wrong and obviously wrong on screen. `room.outdoor` has been
     * in the data model, the importer and the exporter from the start; it was
     * simply never read here.
     *
     * `cfg.ambient.outdoor` is the fraction of full sky such a room gets, so a
     * space that is open above but overshadowed — a narrow setback between two
     * buildings — can be dialled down without inventing a wall for it. */
    /* Glazing is measured against what counts as fully daylit, not against the
     * floor outright — see `ambient.referenceExposure`. A room may say its own,
     * because "enough glass" is a judgement about that room: a stairwell and a
     * living room with identical ratios are not equally well lit in practice. */
    const roomCfg = (room && room.daylight) || {};
    const reference = clamp(num(roomCfg.referenceExposure,
      num(cfg.ambient.referenceExposure, 1)), 0.01, 1);
    const exposure = room && room.outdoor
      ? clamp(num(roomCfg.outdoor, num(cfg.ambient.outdoor, 1)), 0, 1)
      : clamp(glazed / area / reference, 0, 1);
    const ambient = clamp(
      cfg.ambient.nightFloor + sc.day * (cfg.ambient.scatter + exposure * (1 - cfg.ambient.scatter)),
      0, cfg.ambient.max);
    return { ambient, exposure, beams };
  }

  function roomArea(room) {
    const pts = (room.shape === 'poly' && room.points && room.points.length > 2)
      ? room.points
      : (() => { const [x, y, w, h] = room.rect || [0, 0, 1, 1]; return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; })();
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
      a += x0 * y1 - x1 * y0;
    }
    return Math.abs(a / 2);
  }

  return { DEFAULTS, position, dayEvents, mergeConfig, scene, skyStrength, roomDaylight, roomArea };
}));
