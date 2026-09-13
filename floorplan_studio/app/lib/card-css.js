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
.fps-anchor-bottom .fps-panel { left: 50%; bottom: 0; transform: translateX(-50%); border-radius: 24px 24px 0 0; box-shadow: 0 -10px 30px rgba(16,22,38,.26); }
.fps-anchor-right .fps-panel  { right: 0; top: 0; bottom: 0; max-height: 100%; border-radius: 16px 0 0 16px; }
.fps-anchor-center .fps-panel { left: 50%; top: 50%; transform: translate(-50%, -50%); }
.fps-surface-inline { position: static; }
.fps-surface-inline .fps-panel { position: static; width: 100%; max-height: none; box-shadow: none; border-top: 1px solid var(--divider-color, #e0e0e0); border-radius: 0; }
.fps-surface-bar .fps-panel { left: 0; right: 0; bottom: 0; width: 100%; transform: none; border-radius: 0; padding: 8px 12px; }
.fps-surface-bar .fps-section-label { display: none; }
/* inlineSections: sections run ALONG the panel rather than stacking. It is
 * what makes a one-strip surface able to carry more than a single section —
 * stacked, the second one is already off the bottom of a 62px bar. Each
 * section keeps its own grid; only their arrangement changes. */
.fps-panel.fps-inline { display: flex; align-items: center; gap: 12px; overflow-x: auto; }
.fps-panel.fps-inline .fps-section { margin-top: 0; flex: 0 0 auto; }
.fps-panel.fps-inline .fps-panel-head { margin-bottom: 0; flex: 0 0 auto; }
.fps-panel.fps-inline .fps-btns { margin-left: 0; flex-wrap: nowrap; }

/* density: how tight the surface sits. A popover anchored to one room has
 * room for a handful of controls and should not spend a third of it on
 * padding; a full-screen sheet can breathe. */
.fps-density-compact .fps-section { margin-top: 8px; }
.fps-density-compact .fps-panel-head { margin-bottom: 6px; }
.fps-density-compact .fps-tile { padding: 5px 7px; font-size: 12px; }
.fps-density-compact .fps-btn { padding: 3px 8px; font-size: 12px; }

/* animation: how the surface arrives, named by the design. A sheet rises, a
 * rail slides in from its edge, a modal fades, a docked panel does neither
 * because it never went anywhere. Every one of them is dropped wholesale for a
 * viewer who has asked for reduced motion — the same rule the plan's own
 * animations follow. */
@keyframes fpsSurfaceUp { from { transform: translateY(12px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes fpsSurfaceIn { from { transform: translateX(12px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes fpsSurfaceFade { from { opacity: 0; } to { opacity: 1; } }
.fps-anim-slide-up { animation: fpsSurfaceUp .18s ease-out; }
.fps-anim-slide-in { animation: fpsSurfaceIn .18s ease-out; }
.fps-anim-fade { animation: fpsSurfaceFade .16s ease-out; }
/* The centred designs are already translated to sit in the middle, so an
 * animation that also transforms them would fight the positioning. */
.fps-anchor-center .fps-anim-slide-up, .fps-anchor-center .fps-anim-slide-in { animation: fpsSurfaceFade .16s ease-out; }
@media (prefers-reduced-motion: reduce) {
  .fps-anim-slide-up, .fps-anim-slide-in, .fps-anim-fade { animation: none; }
}

.fps-grab { width: 38px; height: 4px; border-radius: 2px; margin: 2px auto 10px; background: var(--divider-color, #ccc); cursor: pointer; }
.fps-panel-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.fps-room { font-size: 16px; font-weight: 600; }
.fps-count { font-size: 12.5px; color: var(--secondary-text-color, #666); }
.fps-btns { display: flex; gap: 6px; flex-wrap: wrap; margin-left: auto; }
/* The room sheet's controls, in the look the hand-built card this replaces
 * had settled on: soft grey pills and tiles, a warm amber tint for a light
 * that is on (and for All on, the button that makes them so), and a filled
 * primary tile for a running DEVICE — a fan or an AC is a different kind of
 * "on" from a lamp, and the two read apart at a glance. */
.fps-btn {
  font: inherit; font-size: 12px; font-weight: 600; padding: 6px 12px; cursor: pointer;
  border-radius: 999px; border: 1px solid var(--divider-color, #d6dae2);
  background: var(--secondary-background-color, #f3f5f8); color: var(--primary-text-color, #222);
  -webkit-tap-highlight-color: transparent;
}
.fps-btn:hover { border-color: var(--primary-color, #3d7bd6); }
.fps-btn[data-action="allOn"] { background: #f6b73c22; border-color: #f6b73c88; }
.fps-btn.on { background: #f6b73c22; border-color: #f6b73c88; }

.fps-section { margin-top: 10px; }
.fps-section-label { font-size: 10.5px; letter-spacing: .6px; text-transform: uppercase; color: var(--secondary-text-color, #777); margin-bottom: 4px; }
.fps-slider-row { display: flex; align-items: center; gap: 8px; }
.fps-slider { width: 100%; flex: 1 1 120px; min-width: 0; accent-color: var(--primary-color, #3d7bd6); }
.fps-pct { font-size: 11.5px; font-weight: 600; color: var(--secondary-text-color, #666); min-width: 34px; text-align: right; font-variant-numeric: tabular-nums; }
.fps-grid { display: grid; grid-template-columns: repeat(var(--fps-cols, 3), minmax(0, 1fr)); gap: 5px; }
.fps-tile {
  display: flex; align-items: center; gap: 6px; min-width: 0;
  font: inherit; font-size: 12px; text-align: left; cursor: pointer;
  padding: 7px 9px; border-radius: 10px;
  border: 1px solid var(--divider-color, #e2e5eb);
  background: var(--secondary-background-color, #f6f7f9); color: var(--primary-text-color, #222);
}
.fps-tile.on { border-color: #f6b73c88; background: #f6b73c22; font-weight: 600; }
.fps-tile.on.fps-tile-device { background: var(--primary-color, #5b67d8); border-color: var(--primary-color, #5b67d8); color: var(--text-primary-color, #fff); }
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

/* The house card is the status bar the hand-built "pulse" hero was, and keeps
 * its proportions: a glass shell holding the name row, the counts line and the
 * reading pills, with the household as pills of their own beside it. Three
 * layouts by width — see the media queries at the end. The white-glass values
 * are fallbacks behind custom properties, so a dark theme can set its own. */
.fps-house {
  display: grid; grid-template-columns: minmax(0, 1fr) 132px; gap: 12px; align-items: stretch;
  color: var(--primary-text-color, #222);
}
.fps-house.no-people { grid-template-columns: minmax(0, 1fr); }
.fps-house-shell { min-width: 0; padding: 9px 14px 12px; border-radius: 26px; overflow: visible; }
.fps-house-head {
  appearance: none; display: flex; align-items: center; gap: 8px; width: 100%;
  margin: 0 0 3px; padding: 5px 6px; border: 0; border-radius: 13px;
  background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer;
  -webkit-tap-highlight-color: transparent; transition: background 140ms ease;
}
.fps-house-head:hover { background: var(--fps-glass-hover, rgba(255,255,255,.42)); }
.fps-house-head:active { background: var(--fps-glass-press, rgba(255,255,255,.62)); }
.fps-house-title { font-size: 15px; font-weight: 800; letter-spacing: .1px; white-space: nowrap; }
.fps-house-date { font-size: 12px; font-weight: 600; color: var(--secondary-text-color, #666); white-space: nowrap; }
.fps-house-wx { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; color: var(--secondary-text-color, #666); text-transform: capitalize; }
.fps-house-wx .fps-glyph { font-size: 17px; line-height: 1; }
.fps-wx-temp { font-variant-numeric: tabular-nums; color: var(--primary-text-color, #222); }
.fps-glyph { font-size: 12px; line-height: 1; flex: 0 0 auto; }

/* Counts are text, not pills: an aggregate is a figure to read, and the pills
 * below are the things that open one entity. */
.fps-counts {
  display: flex; flex-wrap: wrap; align-items: center; gap: 2px 6px; padding: 0 4px;
  font-size: 12px; font-weight: 600; color: var(--secondary-text-color, #666);
}
.fps-cnt {
  appearance: none; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;
  font: inherit; color: inherit; background: none; border: 0; padding: 1px 0; margin: 0; cursor: pointer;
}
.fps-cnt.on { color: var(--primary-text-color, #222); }
.fps-sep { opacity: .55; }

.fps-chips { display: flex; flex-wrap: wrap; gap: 5px; padding: 0 2px; margin-top: 6px; }
.fps-chip {
  appearance: none; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; cursor: pointer;
  font: inherit; font-size: 11px; font-weight: 700; letter-spacing: .2px; padding: 3px 9px; margin: 0;
  border-radius: 999px; background: var(--fps-pill-bg, rgba(255,255,255,.5));
  border: .5px solid var(--fps-pill-border, rgba(255,255,255,.72));
  color: var(--primary-text-color, rgba(19,21,54,.82));
  -webkit-tap-highlight-color: transparent; transition: background 140ms ease, transform 120ms ease;
}
.fps-chip:hover { background: var(--fps-pill-hover, rgba(255,255,255,.78)); }
.fps-chip:active { transform: scale(.96); }
.fps-chip.on { background: #f6b73c2e; border-color: #f6b73c8c; }
.fps-chip.tone-warm { background: #f6b73c2e; border-color: #f6b73c8c; color: #7a4e0a; }
.fps-chip-n { font-variant-numeric: tabular-nums; }
.fps-chip .fps-chip-l { font-weight: 600; opacity: .72; }
.fps-stat.neg .fps-chip-n { color: var(--label-badge-green, #2e8b4d); }
.fps-ic { flex: 0 0 auto; }

.fps-people { display: grid; grid-template-rows: repeat(3, minmax(0, 1fr)); gap: 8px; min-width: 0; }
.fps-person {
  appearance: none; position: relative; display: grid; grid-template-columns: 46px minmax(0, 1fr);
  align-items: center; gap: 9px; min-width: 0; min-height: 64px; padding: 7px 9px; overflow: hidden;
  color: var(--primary-text-color, #222); font: inherit; text-align: left; cursor: pointer;
  border: 1px solid var(--fps-pill-border, rgba(255,255,255,.70)); border-radius: 22px;
  background: radial-gradient(circle at 18% 10%, rgba(255,255,255,.76), transparent 54%),
    linear-gradient(145deg, rgba(255,255,255,.46), rgba(226,235,255,.23));
  box-shadow: inset 0 1px 0 rgba(255,255,255,.78), 0 8px 22px rgba(62,73,112,.14);
  -webkit-backdrop-filter: blur(22px) saturate(160%); backdrop-filter: blur(22px) saturate(160%);
  transition: transform 140ms ease, box-shadow 140ms ease;
}
.fps-person:hover { transform: translateY(-1px); box-shadow: inset 0 1px 0 rgba(255,255,255,.86), 0 11px 27px rgba(62,73,112,.18); }
.fps-person:active { transform: scale(.975); }
.fps-avatar { position: relative; width: 46px; height: 46px; }
.fps-avatar img, .fps-initial {
  display: flex; align-items: center; justify-content: center; box-sizing: border-box;
  width: 100%; height: 100%; object-fit: cover; border-radius: 50%;
  border: 1px solid rgba(255,255,255,.94); background: rgba(255,255,255,.42);
  box-shadow: 0 3px 10px rgba(32,41,74,.20);
}
.fps-initial { font-size: 16px; font-weight: 700; color: var(--secondary-text-color, #666); }
/* Green at home, red away: presence is the one thing this row is for, so it is
 * a colour, not a dimmed pill somebody has to compare with its neighbours. */
.fps-presence {
  position: absolute; right: -1px; bottom: 0; width: 13px; height: 13px; box-sizing: border-box;
  border: 2px solid rgba(248,250,255,.98); border-radius: 50%; background: #E53935;
  box-shadow: 0 1px 4px rgba(25,33,57,.28);
}
.fps-person.home .fps-presence { background: #8BC34A; }
.fps-person-copy { min-width: 0; }
.fps-person-name { display: block; overflow: hidden; font-size: 12px; font-weight: 700; line-height: 1.15; text-overflow: ellipsis; white-space: nowrap; }
.fps-person-state { display: block; margin-top: 3px; color: var(--secondary-text-color, #666); font-size: 10px; font-weight: 600; line-height: 1; text-transform: capitalize; }

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

/* The one-sentence floor summary. */
.fps-floor-summary { padding: 14px 16px; }
.fps-floor-summary .fps-floor-title { font-size: 15px; font-weight: 700; margin-bottom: 8px; color: var(--primary-text-color, #222); }
.fps-floor-line { font-size: 14px; line-height: 1.55; color: var(--primary-text-color, #222); }
.fps-floor-line .fps-sep { margin: 0 .3em; }
.fps-phrase {
  appearance: none; display: inline; font: inherit; color: inherit; background: none;
  border: 0; padding: 0; margin: 0; text-align: left; cursor: pointer;
}
.fps-phrase b { font-weight: 700; }
.fps-phrase:hover { text-decoration: underline; text-decoration-color: var(--divider-color, #ccc); }

/* ------------------------------------------------------------ responsive

   Three widths, because a floor plan is used at three distances: a phone in
   one hand, a tablet on a counter, and a wall-mounted screen across a room.
   The plan itself already scales — it is an SVG with a viewBox — so what these
   change is the CHROME around it, which does not.                          */

@media (max-width: 760px) {
  .fps-floor-rows { grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); }
}

/* Wide: one bar. Name, counts and pills flow along the row and the people sit
   at its end as three compact pills — beside the plan on a 4K panel the
   stacked layout was a tall slab of glass holding one line of content. */
@media (min-width: 1000px) {
  .fps-house { grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 10px; }
  .fps-house-shell { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; padding: 8px 14px; }
  .fps-house-head { width: auto; margin: 0; flex: 0 0 auto; }
  .fps-counts { padding: 0; }
  .fps-chips { margin-top: 0; }
  .fps-people { grid-template-rows: 1fr; grid-template-columns: repeat(3, auto); gap: 7px; }
  .fps-person { grid-template-columns: 34px minmax(0, 1fr); gap: 7px; min-height: 46px; padding: 5px 10px 5px 6px; border-radius: 16px; }
  .fps-avatar { width: 34px; height: 34px; }
  .fps-presence { width: 11px; height: 11px; }
}

/* Phone: the people become one row of three under the bar, because the height
   of this card decides how much of the plan is visible without scrolling. */
@media (max-width: 700px) {
  .fps-house { grid-template-columns: minmax(0, 1fr); gap: 6px; }
  .fps-house-shell { border-radius: 22px; padding: 7px 11px 10px; }
  .fps-house-title { font-size: 14px; }
  .fps-house-date, .fps-counts { font-size: 11px; }
  .fps-chip { font-size: 10px; padding: 2.5px 8px; gap: 3px; }
  .fps-chips { gap: 4px; margin-top: 5px; }
  .fps-people { grid-template-columns: repeat(3, minmax(0, 1fr)); grid-template-rows: 1fr; gap: 6px; }
  .fps-person { grid-template-columns: 34px minmax(0, 1fr); gap: 6px; min-height: 48px; padding: 5px 6px; border-radius: 15px; }
  .fps-avatar { width: 34px; height: 34px; }
  .fps-presence { width: 11px; height: 11px; }
  .fps-person-name { font-size: 11px; }
  .fps-person-state { font-size: 9px; }
  .fps-floor-line { font-size: 13px; }
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
  .fps-person { grid-template-columns: 30px minmax(0, 1fr); gap: 5px; padding: 4px 5px; min-height: 44px; }
  .fps-avatar { width: 30px; height: 30px; }
  .fps-person-name { font-size: 10px; }
}

/* A wall tablet in landscape: the plan is square, so there is room either side
   for the panel to sit BESIDE it rather than over it. */
@media (min-width: 1100px) {
  .fps-surface-inline { position: absolute; inset: 0 0 0 auto; }
  .fps-grid { grid-template-columns: repeat(var(--fps-cols, 3), minmax(0, 1fr)); }
}

@media (prefers-reduced-motion: reduce) {
  .fps-floor-fill, .fps-chip, .fps-person, .fps-house-head { transition: none; }
  .fps-chip:active, .fps-person:hover, .fps-person:active { transform: none; }
}
`;
