//! U2C Studio DAW plugin: audio pass-through + host transport / audio tap to the web editor.
use nih_plug::prelude::*;
use std::sync::atomic::Ordering::Relaxed;
use std::sync::Arc;

mod capture;
mod editor;
mod server;

#[derive(Default, Params)]
struct U2cParams {}

struct U2cStudio {
    params: Arc<U2cParams>,
    shared: Arc<server::Shared>,
}

impl Default for U2cStudio {
    fn default() -> Self {
        Self { params: Arc::new(U2cParams::default()), shared: server::servers().shared.clone() }
    }
}

impl Plugin for U2cStudio {
    const NAME: &'static str = "U2C Studio";
    const VENDOR: &'static str = "UCHE2CRAZYYY";
    const URL: &'static str = "https://github.com/philipmadupro-ship-it/beatmaking-visuals";
    const EMAIL: &'static str = "";
    const VERSION: &'static str = env!("CARGO_PKG_VERSION");

    const AUDIO_IO_LAYOUTS: &'static [AudioIOLayout] = &[AudioIOLayout {
        main_input_channels: NonZeroU32::new(2),
        main_output_channels: NonZeroU32::new(2),
        ..AudioIOLayout::const_default()
    }];
    const MIDI_INPUT: MidiConfig = MidiConfig::None;
    const SAMPLE_ACCURATE_AUTOMATION: bool = false;

    type SysExMessage = ();
    type BackgroundTask = ();

    fn params(&self) -> Arc<dyn Params> {
        self.params.clone()
    }

    fn editor(&mut self, _executor: AsyncExecutor<Self>) -> Option<Box<dyn Editor>> {
        Some(Box::new(editor::WebEditor))
    }

    fn initialize(&mut self, _layout: &AudioIOLayout, cfg: &BufferConfig, _ctx: &mut impl InitContext<Self>) -> bool {
        self.shared.sr.store(cfg.sample_rate as u32, Relaxed);
        true
    }

    fn process(&mut self, buffer: &mut Buffer, _aux: &mut AuxiliaryBuffers, ctx: &mut impl ProcessContext<Self>) -> ProcessStatus {
                let t = ctx.transport();
        let sh = &self.shared;
        if let Some(b) = t.tempo {
            sh.bpm.store(b.to_bits(), Relaxed);
        }
        sh.begin_block(t.pos_beats());
        sh.playing.store(t.playing, Relaxed);
        sh.tsn.store(t.time_sig_numerator.unwrap_or(4).max(1) as u32, Relaxed);
        sh.tsd.store(t.time_sig_denominator.unwrap_or(4).max(1) as u32, Relaxed);
        let (la, lb) = t.loop_range_beats().unwrap_or((f64::NAN, f64::NAN));
        sh.loop_a.store(la.to_bits(), Relaxed);
        sh.loop_b.store(lb.to_bits(), Relaxed);
        let (mut sum, mut peak, mut n) = (0f32, 0f32, 0usize);
        for mut ch in buffer.iter_samples() {
            let l = ch.get_mut(0).map(|s| *s).unwrap_or(0.0);
            let r = ch.get_mut(1).map(|s| *s).unwrap_or(l);
            sh.push(l, r);
            let m = (l + r) * 0.5;
            sum += m * m;
            peak = peak.max(l.abs()).max(r.abs());
            n += 1;
        }
        if n > 0 {
            sh.rms.store((sum / n as f32).sqrt().to_bits(), Relaxed);
            sh.peak.store(peak.to_bits(), Relaxed);
        }
        ProcessStatus::Normal
    }
}

impl ClapPlugin for U2cStudio {
    const CLAP_ID: &'static str = "com.uche2crazyyy.u2c-studio";
    const CLAP_DESCRIPTION: Option<&'static str> = Some("Beat-video editor that follows the DAW transport");
    const CLAP_MANUAL_URL: Option<&'static str> = None;
    const CLAP_SUPPORT_URL: Option<&'static str> = None;
    const CLAP_FEATURES: &'static [ClapFeature] = &[ClapFeature::AudioEffect, ClapFeature::Analyzer, ClapFeature::Stereo, ClapFeature::Utility];
}

impl Vst3Plugin for U2cStudio {
    const VST3_CLASS_ID: [u8; 16] = *b"U2CStudioPlugin1";
    const VST3_SUBCATEGORIES: &'static [Vst3SubCategory] = &[Vst3SubCategory::Fx, Vst3SubCategory::Analyzer];
}

nih_export_clap!(U2cStudio);
nih_export_vst3!(U2cStudio);
