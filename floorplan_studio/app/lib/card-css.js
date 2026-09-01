/**
 * The card's own stylesheet, as a string.
 *
 * Separate from `card-runtime.js` only so the runtime stays readable; both are
 * concatenated into the one Lovelace module by `card-build.js`. It is scoped by
 * a shadow root, so the selectors can be short without leaking, and it uses
 * Home Assistant's own theme variables wherever the surrounding dashboard has
 * an opinion — the plan should look like part of the dashboard it sits in, not
 * like a page that ignored it.
 */
module.exports = `
:host { display: block; }
.fps-card {
  position: relative;
  background: var(--ha-card-background, var(--card-background-color, #fff));
  border-radius: var(--ha-card-border-radius, 12px);
  box-shadow: var(--ha-card-box-shadow, none);
  border: var(--ha-card-border-width, 1px) solid var(--ha-card-border-color, transparent);
  overflow: hidden;
}
.fps-head {
  display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
  padding: 12px 16px 8px;
  color: var(--primary-text-color, #222);
}
.fps-title { font-size: 17px; font-weight: 600; }
.fps-sub { font-size: 12.5px; color: var(--secondary-text-color, #666); }
.fps-plan { line-height: 0; }
.fps-svg { width: 100%; height: auto; display: block; touch-action: manipulation; }

/* Tap targets. Transparent, generous, and above everything — the visible disc
 * is about half the radius of the circle you can actually hit. */
.fps-hits { pointer-events: all; }
.fps-hit { cursor: pointer; }
.fps-hit-room { fill: transparent; }
.fps-hit:active { opacity: 1; }

/* ---- control surface ---- */
.fps-surface[hidden] { display: none; }
.fps-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,.34); }
.fps-panel {
  position: absolute; z-index: 2;
  /* border-box, because the width is often 100% and the padding would
     otherwise push the panel wider than the card that contains it — which on a
     phone means the right-hand column of tiles is cut off the screen. */
  box-sizing: border-box;
  width: var(--fps-w); max-width: 100%; max-height: var(--fps-maxh); overflow: auto;
  background: var(--card-background-color, #fff);
  color: var(--primary-text-color, #222);
  border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,.28);
  padding: 10px 14px 16px;
}
.fps-anchor-bottom .fps-panel { left: 50%; bottom: 0; transform: translateX(-50%); border-radius: 16px 16px 0 0; }
.fps-anchor-right .fps-panel  { right: 0; top: 0; bottom: 0; max-height: 100%; border-radius: 16px 0 0 16px; }
.fps-anchor-center .fps-panel { left: 50%; top: 50%; transform: translate(-50%, -50%); }
.fps-surface-inline { position: static; }
.fps-surface-inline .fps-panel { position: static; width: 100%; max-height: none; box-shadow: none; border-top: 1px solid var(--divider-color, #e0e0e0); border-radius: 0; }
.fps-surface-bar .fps-panel { left: 0; right: 0; bottom: 0; width: 100%; transform: none; border-radius: 0; padding: 8px 12px; }
.fps-surface-bar .fps-section-label { display: none; }

.fps-grab { width: 38px; height: 4px; border-radius: 2px; margin: 2px auto 10px; background: var(--divider-color, #ccc); cursor: pointer; }
.fps-panel-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.fps-room { font-size: 16px; font-weight: 600; }
.fps-count { font-size: 12.5px; color: var(--secondary-text-color, #666); }
.fps-btns { display: flex; gap: 6px; flex-wrap: wrap; margin-left: auto; }
.fps-btn {
  font: inherit; font-size: 12.5px; padding: 5px 10px; cursor: pointer;
  border-radius: 999px; border: 1px solid var(--divider-color, #ddd);
  background: transparent; color: inherit;
}
.fps-btn.on { background: var(--state-icon-active-color, #f9c22e); border-color: transparent; color: #241a00; font-weight: 600; }

.fps-section { margin-top: 12px; }
.fps-section-label { font-size: 11.5px; letter-spacing: .04em; text-transform: uppercase; color: var(--secondary-text-color, #777); margin-bottom: 6px; }
.fps-slider { width: 100%; accent-color: var(--state-icon-active-color, #f9c22e); }
.fps-grid { display: grid; grid-template-columns: repeat(var(--fps-cols, 3), minmax(0, 1fr)); gap: 6px; }
.fps-tile {
  display: flex; align-items: center; gap: 6px; min-width: 0;
  font: inherit; font-size: 12.5px; text-align: left; cursor: pointer;
  padding: 8px 10px; border-radius: 10px;
  border: 1px solid var(--divider-color, #e2e2e2);
  background: transparent; color: inherit;
}
.fps-tile.on { border-color: transparent; background: color-mix(in srgb, var(--state-icon-active-color, #f9c22e) 22%, transparent); font-weight: 600; }
.fps-tile.dead { opacity: .45; border-style: dashed; }
.fps-tile-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fps-tile-value { margin-left: auto; color: var(--secondary-text-color, #666); font-variant-numeric: tabular-nums; }
.fps-swatch { width: 10px; height: 10px; border-radius: 50%; flex: 0 0 auto; border: 1px solid var(--divider-color, #ccc); }
.fps-tiles .fps-tile { flex-direction: column; align-items: flex-start; min-height: 62px; }

/* A tile that is one of the user's own shortcuts rather than an entity the room
 * happens to contain. Marked, not restyled: it behaves the same, and a row of
 * two visual languages reads as two rows. */
.fps-tile.fps-shortcut { border-style: solid; }

/* A scene and a script FIRE — they have no on-state to hold —
 * so they never take the lit background a switch does, and are marked as
 * momentary by their shape instead: fully rounded, like the header buttons. */
.fps-tile-button { border-radius: 999px; justify-content: center; text-align: center; }
.fps-tile-button .fps-tile-label { flex: 0 1 auto; }
.fps-tile-readout { cursor: default; }

/* A settable helper is a label with a control under it, so it needs the column
 * a switch does not — and it must not be a <button>, or every drag of the
 * slider would also count as a press. */
.fps-tile-number, .fps-tile-select, .fps-tile-text {
  flex-direction: column; align-items: stretch; gap: 4px; cursor: default;
}
.fps-tile-number .fps-tile-label, .fps-tile-select .fps-tile-label, .fps-tile-text .fps-tile-label { cursor: pointer; }
.fps-tile-number .fps-tile-value { margin-left: 0; text-align: right; font-size: 11.5px; }
.fps-select, .fps-input {
  font: inherit; font-size: 12.5px; width: 100%; box-sizing: border-box;
  padding: 4px 6px; border-radius: 7px; color: inherit;
  border: 1px solid var(--divider-color, #ddd);
  background: var(--card-background-color, transparent);
}

/* What a marker is, without tapping it. Above the plan, never under the
   pointer, and it does not take pointer events — a tooltip that swallows the
   click it is describing is worse than none. */
.fps-tip {
  position: absolute; z-index: 3; pointer-events: none;
  padding: 4px 8px; border-radius: 7px; max-width: 240px;
  font-size: 12px; line-height: 1.35; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
  background: var(--primary-text-color, #222);
  color: var(--card-background-color, #fff);
  box-shadow: 0 4px 14px rgba(0,0,0,.22);
}
.fps-tip[hidden] { display: none; }

/* ------------------------------------------------------- overview cards */

.fps-house { padding: 12px 14px; }
.fps-house-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; color: var(--primary-text-color, #222); }
.fps-house-title { font-size: 19px; font-weight: 650; letter-spacing: -0.01em; }
.fps-house-wx {
  display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
  font-size: 13px; color: var(--secondary-text-color, #666); text-transform: capitalize;
}
.fps-wx-temp { font-variant-numeric: tabular-nums; font-weight: 600; color: var(--primary-text-color, #222); }
.fps-people { display: flex; gap: 6px; margin-left: auto; flex-wrap: wrap; }
.fps-person {
  display: inline-flex; align-items: center; gap: 5px; cursor: pointer;
  font: inherit; font-size: 12px; padding: 3px 9px 3px 3px; border-radius: 999px;
  border: 1px solid var(--divider-color, #ddd); background: transparent; color: inherit;
  opacity: .5;
}
/* Home is the state worth seeing at a glance, so away is the dimmed one — the
 * opposite reads as "three people greyed out" and says nothing. */
.fps-person.home { opacity: 1; border-color: transparent; background: color-mix(in srgb, var(--state-icon-active-color, #f9c22e) 20%, transparent); font-weight: 600; }
.fps-person img { width: 20px; height: 20px; border-radius: 50%; object-fit: cover; }

.fps-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.fps-chip {
  display: inline-flex; align-items: center; gap: 5px; cursor: pointer;
  font: inherit; font-size: 12.5px; padding: 5px 10px; border-radius: 999px;
  border: 1px solid var(--divider-color, #ddd); background: transparent;
  color: var(--secondary-text-color, #666);
}
.fps-chip.on { color: var(--primary-text-color, #222); border-color: transparent; background: color-mix(in srgb, var(--state-icon-active-color, #f9c22e) 20%, transparent); }
.fps-chip-n { font-variant-numeric: tabular-nums; font-weight: 650; }
.fps-chip-l { opacity: .75; }
.fps-stat .fps-chip-n { color: var(--primary-text-color, #222); }
.fps-stat.neg .fps-chip-n { color: var(--label-badge-green, #2e8b4d); }
.fps-chip-action { border-style: solid; }
.fps-ic { flex: 0 0 auto; }

.fps-floorcard { padding: 12px 14px; }
.fps-floor-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; color: var(--primary-text-color, #222); }
.fps-floor-title { font-size: 15px; font-weight: 600; }
.fps-floor-count { margin-left: auto; font-size: 13px; color: var(--secondary-text-color, #666); }
.fps-big { font-size: 22px; font-weight: 700; color: var(--primary-text-color, #222); font-variant-numeric: tabular-nums; }
.fps-floor-dead { font-size: 12px; color: var(--error-color, #c05a5a); }
.fps-floor-rows { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 6px 14px; margin-top: 10px; }
.fps-floor-row {
  display: grid; grid-template-columns: 1fr auto; grid-template-areas: "label n" "bar bar";
  gap: 2px 8px; align-items: center; cursor: pointer; text-align: left;
  font: inherit; font-size: 12.5px; padding: 4px 2px; border: 0; background: transparent;
  color: var(--secondary-text-color, #666);
}
.fps-floor-row.on { color: var(--primary-text-color, #222); }
.fps-floor-label { grid-area: label; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fps-floor-n { grid-area: n; font-variant-numeric: tabular-nums; font-weight: 600; }
.fps-floor-bar { grid-area: bar; height: 3px; border-radius: 2px; background: var(--divider-color, #e2e2e2); overflow: hidden; }
.fps-floor-fill { display: block; height: 100%; background: var(--state-icon-active-color, #f9c22e); transition: width 240ms ease; }

/* ------------------------------------------------------------ responsive

   Three widths, because a floor plan is used at three distances: a phone in
   one hand, a tablet on a counter, and a wall-mounted screen across a room.
   The plan itself already scales — it is an SVG with a viewBox — so what these
   change is the CHROME around it, which does not.                          */

@media (max-width: 760px) {
  .fps-floor-rows { grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); }
  .fps-house-title { font-size: 17px; }
  .fps-people { margin-left: 0; width: 100%; }
}

@media (max-width: 600px) {
  .fps-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .fps-head { padding: 10px 12px 6px; }
  .fps-title { font-size: 15.5px; }

  /* Every surface becomes a bottom sheet on a phone. A popover anchored to a
     room, a rail down one edge and a docked panel all assume space beside the
     plan, and there is none — so the design choice is honoured where it fits
     and overridden where it cannot be. */
  /* Marked important on purpose, and only here. The runtime writes --fps-w as
     an INLINE custom property because it comes from the chosen design's own
     size, and an inline property beats any stylesheet rule no matter how
     specific — so a phone could not otherwise take a 320px docked panel back to
     full width. This is the one place a design's own measurement is overruled.

     (No backticks in this file: it is one long template literal, and a backtick
     in a comment ends the string. That has cost time once already.) */
  .fps-surface-drawer, .fps-surface-popover, .fps-surface-inline, .fps-surface-modal {
    position: absolute; inset: auto 0 0 0;
    --fps-w: 100% !important; --fps-maxh: 76vh !important;
  }
  .fps-surface-drawer .fps-panel, .fps-surface-popover .fps-panel,
  .fps-surface-inline .fps-panel, .fps-surface-modal .fps-panel {
    width: 100%; max-width: none; max-height: 76vh;
    border-radius: 16px 16px 0 0;
  }
  .fps-panel { padding: 12px 14px 16px; }
  .fps-btns { gap: 5px; }
  .fps-btn { padding: 6px 11px; }            /* 44px-ish targets, not 30px */
  .fps-tile { padding: 10px 10px; }
  .fps-chips { gap: 5px; }
  .fps-chip { padding: 6px 10px; }
}

@media (max-width: 420px) {
  .fps-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .fps-tiles .fps-tile { min-height: 56px; }
  .fps-panel-head { flex-wrap: wrap; }
  .fps-btns { margin-left: 0; width: 100%; }
  .fps-floor-rows { grid-template-columns: 1fr 1fr; }
  .fps-house-wx { font-size: 12px; }
}

/* A wall tablet in landscape: the plan is square, so there is room either side
   for the panel to sit BESIDE it rather than over it. */
@media (min-width: 1100px) {
  .fps-surface-inline { position: absolute; inset: 0 0 0 auto; }
  .fps-grid { grid-template-columns: repeat(var(--fps-cols, 3), minmax(0, 1fr)); }
}

@media (prefers-reduced-motion: reduce) {
  .fps-floor-fill { transition: none; }
}
`;
