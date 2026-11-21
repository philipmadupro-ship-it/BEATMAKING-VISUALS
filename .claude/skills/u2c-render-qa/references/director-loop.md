# Director-notes loop (U2C)
Note format (one line each): `[shot/bar] what is wrong -> path=value (why)`. Examples:
- `[bar 4 push eq] lands but EQ is half open -> win.eq.open=-2 (open before the push)`
- `[drop 1] logo glow too hot on kicks -> logo.glow=0.7`
- `[break] pendant feels stiff -> pendant.damp=0.28, pendant.wave=0.9`
Severity: BLOCK (breaks a rule in u2c-beat-preview-motion section 7), FIX (visible to a viewer), POLISH. Pass ends when no BLOCK/FIX remain.
Keep passes in `u2c-motion/review/`; record the render command + sheet file for each pass.
