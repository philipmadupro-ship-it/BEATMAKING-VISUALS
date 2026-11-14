import {registerRoot, Composition, AbsoluteFill, useCurrentFrame, interpolate} from 'remotion';
import React from 'react';
const Smoke = () => {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{background:'#161616',alignItems:'center',justifyContent:'center'}}>
    <div style={{color:'#b79ad8',fontFamily:'monospace',fontSize:72,opacity:interpolate(f,[0,20],[0,1],{extrapolateRight:'clamp'})}}>U2C.EXE</div>
  </AbsoluteFill>;
};
const Root = () => <Composition id="Smoke" component={Smoke} durationInFrames={30} fps={30} width={540} height={960}/>;
registerRoot(Root);
