// U2C brand palettes. Only these three exist (Charcoal / Rust / Amethyst).
// Every template reads colours from these fields; "paper" fields are for light templates (HANDSET, EXE).
export const PALETTES = Object.freeze({
  charcoal: { id:'charcoal', name:'Charcoal', bg:'#161616', bg2:'#232323', main:'#c8c8c8', hi:'#f0f0f0', a2:'#ffffff', a3:'#8a8a8a',
    text:'#e6e6e6', dim:'#5c5c5c', dark:'#161616', paper:'#dcdcda', ink:'#161616', pacc:'#5a5a5a', spark:'#c8c8c8', chain:'#c8c8c8', duo:['#161616','#e2e2e2'] },
  rust: { id:'rust', name:'Rust', bg:'#6e4433', bg2:'#5c3829', main:'#c4a57a', hi:'#e6d3b0', a2:'#2a1710', a3:'#e6d3b0',
    text:'#ecdcc0', dim:'#9a7458', dark:'#2a1710', paper:'#c4a57a', ink:'#2a1710', pacc:'#6e4433', spark:'#c4a57a', chain:'#2a1710', duo:['#2a1710','#d9bf95'] },
  amethyst: { id:'amethyst', name:'Amethyst', bg:'#1d1426', bg2:'#2a1d38', main:'#b79ad8', hi:'#eadcf8', a2:'#e07ad0', a3:'#e0475f',
    text:'#efe6fa', dim:'#6b5785', dark:'#1d1426', paper:'#e9e1f2', ink:'#1d1426', pacc:'#e07ad0', spark:'#f2c14e', chain:'#b79ad8', duo:null, gold:'#f2c14e' },
});
export const PALETTE_ORDER = ['charcoal', 'rust', 'amethyst'];
// accent that reads on a dark background (Rust's a2 is dark ink, so fall back to its light tan)
export const accentOn = p => (p.id === 'rust' ? p.hi : p.a2);
export const hotOn = p => (p.id === 'charcoal' ? '#ffffff' : p.id === 'rust' ? p.hi : p.a3);
