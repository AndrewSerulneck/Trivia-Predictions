import type { PromoSynthId } from "@/lib/promo/promoSounds";

// Share to social sounds made in code (Web Audio), ported from the approved Phase 0 test page
// (docs/partner-social-promo-spike/reel-sound-test.html). Browser-only at call time; importing is safe.
// One function per PromoSynthId — the Record type makes a missing one a type error.

export type SynthKit = {
  context: BaseAudioContext;
  /** Two seconds of seeded white noise. */
  noise: AudioBuffer;
  random: () => number;
};

type Synth = (kit: SynthKit, out: AudioNode, startS: number, durationS: number) => void;

const envelope = (gain: GainNode, t: number, peak: number, attack: number, decay: number) => {
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
};

const noiseHit = (
  kit: SynthKit,
  out: AudioNode,
  t: number,
  length: number,
  filter: BiquadFilterType,
  frequency: number,
  q: number,
  peak: number,
  attack: number,
  decay: number,
) => {
  const source = kit.context.createBufferSource();
  source.buffer = kit.noise;
  source.loop = true;
  const band = kit.context.createBiquadFilter();
  band.type = filter;
  band.frequency.value = frequency;
  band.Q.value = q;
  const gain = kit.context.createGain();
  envelope(gain, t, peak, attack, decay);
  source.connect(band).connect(gain).connect(out);
  source.start(t, kit.random() * 1.5);
  source.stop(t + length);
};

const tone = (
  kit: SynthKit,
  out: AudioNode,
  t: number,
  type: OscillatorType,
  from: number,
  to: number | null,
  attack: number,
  decay: number,
  peak: number,
  lowpass?: number,
) => {
  const osc = kit.context.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
  const gain = kit.context.createGain();
  envelope(gain, t, peak, attack, decay);
  let node: AudioNode = osc;
  if (lowpass) {
    const filter = kit.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = lowpass;
    osc.connect(filter);
    node = filter;
  }
  node.connect(gain).connect(out);
  osc.start(t);
  osc.stop(t + attack + decay + 0.05);
};

/** 120 BPM: kick, snare, hats, bass and a pad on Am–F–C–G. */
const gameNightBeat: Synth = (kit, out, startS, durationS) => {
  const beat = 0.5;
  const progression = [
    [220, 261.6, 329.6],
    [174.6, 220, 261.6],
    [261.6, 329.6, 392],
    [196, 246.9, 293.7],
  ];
  for (let b = 0; b * beat < durationS - 0.2; b += 1) {
    const t = startS + b * beat;
    const chord = progression[Math.floor(b / 4) % 4];
    tone(kit, out, t, "sine", 150, 45, 0.005, 0.28, 0.9);
    if (b % 2 === 1) noiseHit(kit, out, t, 0.2, "bandpass", 1800, 0.8, 0.35, 0.003, 0.13);
    noiseHit(kit, out, t, 0.06, "highpass", 7000, 0.7, 0.12, 0.002, 0.04);
    noiseHit(kit, out, t + beat / 2, 0.06, "highpass", 7000, 0.7, 0.08, 0.002, 0.04);
    tone(kit, out, t, "sawtooth", chord[0] / 2, null, 0.01, 0.2, 0.22, 500);
    tone(kit, out, t + beat / 2, "sawtooth", chord[0] / 2, null, 0.01, 0.15, 0.16, 500);
    if (b % 4 === 0) {
      for (const f of chord) {
        tone(kit, out, t, "sawtooth", f, null, 0.08, 1.8, 0.035, 1400);
        tone(kit, out, t, "sawtooth", f * 1.005, null, 0.08, 1.8, 0.035, 1400);
      }
    }
  }
};

/** A snare roll building into the prize. */
const drumroll: Synth = (kit, out, startS, durationS) => {
  const hits = Math.floor(durationS * 24);
  for (let i = 0; i < hits; i += 1) {
    noiseHit(kit, out, startS + i / 24, 0.08, "bandpass", 1600, 0.9, 0.06 + 0.4 * (i / hits), 0.002, 0.06);
  }
};

/** A click and two bell strikes. */
const kaChing: Synth = (kit, out, startS) => {
  noiseHit(kit, out, startS, 0.04, "highpass", 3000, 0.7, 0.3, 0.001, 0.03);
  for (const f of [2637, 3951, 5274]) tone(kit, out, startS + 0.02, "sine", f, null, 0.002, 0.7, 0.12);
  for (const f of [3136, 4699]) tone(kit, out, startS + 0.14, "sine", f, null, 0.002, 0.9, 0.12);
};

export const PROMO_SYNTHS: Record<PromoSynthId, Synth> = {
  "game-night-beat": gameNightBeat,
  drumroll,
  "ka-ching": kaChing,
};
