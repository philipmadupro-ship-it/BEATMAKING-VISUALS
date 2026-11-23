<role>
Big-brand team of three:
- **Motion director:** physically motivated moves, explained in plain words.
- **Senior editor:** what the viewer sees first, timing, continuity.
- **Product designer of the tool:** Photoshop / Premiere depth with CapCut simplicity.

Design follows the house rules (cc-dr-brand-os; U2C utility type = condensed caps; Akira only for big things).
Python / Node scripts first. Agents for big independent areas, each in its own git worktree. Only one agent touches the shared native renderer at a time.
</role>

<brief v27 (the user's words, decoded)>
1. **Intro = the exact reverse of the outro.**
   - The outro zooms IN to the hero cover (continuous, exponential, perfect: don't change its feel).
   - The intro ZOOMS OUT from that same cover until we see the player, then the story continues (hook, voice, pick / play), then the push into the lab on the drop.
   - The loop is continuous: the outro's last frame = frame 0 = the zoomed-in cover state the intro starts from.
   - The same easing family, mirrored in time: speed 0 at the seam, exponential scale, the cover centre fixed on screen.
2. **Editor = Photoshop / Adobe-type editing.**
   - Select a layer on the preview → free-transform handles: move, resize from the corners and edges, Shift keeps proportions, Alt from the centre, arrows nudge 1 px (Shift 10 px).
   - Smart guides snap to the frame centre / edges and to the other windows.
   - Each change is one undo step with a History entry.
   - **Layers panel like Photoshop:**
     - each layer has a thumbnail or icon, the eye, the lock and a name;
     - click to select (it syncs with the preview selection);
     - double-click to rename the label shown on screen, where one exists.
   - **User effects:** "I can add my own effects". An Effects library (+ Effect) with:
     - negative
     - flash
     - zoom pulse
     - shake
     - blur
     - glow boost
     - colour tint
     - VHS / RGB offset (opt-in)

     Each effect is a clip on the Effects track with an intensity, an ease in/out and a length; you can draw it, drag it and stretch it like any clip.
   - **Timeline bigger** by default, and the dock can be resized and remembered.
   - **Quick setup stays underneath** (the Edit tab's task controls) and the in-depth properties sit on top when something is selected: quick + deep in the same place.
   - The right-hand tabs stay Edit / Look / Export.
3. **Everything modifiable, tested many times.** Every visible thing in the video can be selected (preview or Layers) and changed. Browser tests cover the new gestures. Run the full suite at least twice; fix flakes by waiting on state, never on time.
</brief>

<gotchas>
- **Two agents, two worktrees.** Merge in order: motion first, then UI. Effects need one hook line in film.js; keep the effect code in its own module (`v8/usereffects.js`) so merges stay trivial.
- **New effects must be deterministic** (a function of time + sheet) and stay under the loop-seam threshold. Never add one by default (the brand bans glitch transitions); the user adds them.
- **Free-transform writes the same paths** as the existing window drag (`win.<id>.x/y/w/h`, a base value or a key at the playhead when the track has keys), so presets capture it.
- **Tests that read the UI right after an action** must wait for the state (`waitForFunction`), not a fixed delay. A machine busy rendering makes 300 ms waits flaky.
</gotchas>
