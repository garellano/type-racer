import type { Snapshot } from "../shared/protocol";

// Original synthesized score: a heartbeat under a sparse, unresolved eight-note phrase.
const PHRASE = [220, 261.63, 311.13, 261.63, 207.65, 261.63, 311.13, 246.94];

export class BombAudio {
  private context: AudioContext | undefined;
  private output: GainNode | undefined;
  private noise: AudioBuffer | undefined;
  private readonly voices = new Set<AudioScheduledSourceNode>();
  private enabled = false;
  private revision = 0;
  private round: string | null = null;
  private phase = "";
  private nextBeat = 0;
  private beat = 0;
  private readonly cuts = new Set<number>();
  private finished = false;
  private countdown = "";
  private destroyed = false;
  private active = false;

  async setEnabled(value: boolean): Promise<boolean> {
    const revision = ++this.revision;
    this.enabled = false;
    this.pause();
    if (!value || this.destroyed) return false;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.output = this.context.createGain();
        this.output.gain.value = 0.6;
        this.output.connect(this.context.destination);
        this.noise = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
        const samples = this.noise.getChannelData(0);
        for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;
      }
      // Called directly from the sound button's user gesture, including on mobile Safari.
      await this.context.resume();
      if (revision !== this.revision || this.destroyed) return false;
      this.enabled = this.context.state === "running";
      if (this.enabled && this.active && !document.hidden) {
        const at = this.context.currentTime;
        this.note(440, at, 0.16, 0.13, "sine");
        this.note(660, at + 0.12, 0.2, 0.1, "sine");
      }
      return this.enabled;
    } catch {
      return false;
    }
  }

  update(state: Snapshot, now: number, available: boolean): void {
    if (state.raceId !== this.round) {
      this.pause();
      this.round = state.raceId;
      this.cuts.clear();
      this.finished = false;
      this.countdown = "";
      this.beat = 0;
    }
    const context = this.context;
    const audible =
      this.enabled && this.active && available && !document.hidden && context?.state === "running";
    if (!audible) this.pause();
    if (this.phase !== state.phase) {
      this.nextBeat = 0;
      this.phase = state.phase;
    }

    // Observe events even while muted/offline. Reconnection never queues old sound effects.
    for (const cable of state.bomb?.cables ?? []) {
      if (cable.cutAt === null || cable.cutAt > now || this.cuts.has(cable.id)) continue;
      this.cuts.add(cable.id);
      if (audible && now - cable.cutAt < 600) {
        this.hiss(context.currentTime, 0.09, 0.2, 2600);
        this.note(880, context.currentTime + 0.04, 0.14, 0.1, "sine");
      }
    }
    const seconds = Math.max(0, Math.ceil(((state.startAt ?? now) - now) / 1000));
    const countdown = `${state.raceId}:${state.phase}:${seconds}`;
    if (countdown !== this.countdown) {
      this.countdown = countdown;
      if (audible && state.phase === "countdown" && seconds > 0)
        this.note(440, context.currentTime, 0.13, 0.18, "sine");
    }
    if (state.phase === "finished" && !this.finished) {
      this.finished = true;
      this.pause();
      if (
        audible &&
        state.finishAt !== null &&
        now >= state.finishAt &&
        now - state.finishAt < 1200
      )
        this.boom(context.currentTime);
    }
    const suspense = ["selecting", "countdown", "defusing", "finale"].includes(state.phase);
    if (!audible || !suspense) return;
    // Stop at the known server deadline even if the next snapshot is delayed.
    const timeLeft = state.deadline === null ? Infinity : (state.deadline - now) / 1000;
    if (timeLeft <= 0) {
      this.pause();
      return;
    }
    const remaining = state.bomb?.cables.filter((cable) => cable.cutAt === null).length ?? 0;
    const interval =
      state.phase === "finale"
        ? 0.27
        : state.phase === "defusing"
          ? 0.3 + 0.4 * (remaining / Math.max(1, state.bomb?.cables.length ?? 1))
          : 0.8;
    const at = context.currentTime;
    if (this.nextBeat < at - 0.05) this.nextBeat = at;
    // A small lookahead absorbs ordinary UI jitter without building a delayed playback queue.
    for (let scheduled = 0; scheduled < 2 && this.nextBeat < at + 0.12; scheduled++) {
      const beatAt = this.nextBeat;
      const duration = Math.min(0.3, timeLeft - (beatAt - at));
      if (duration <= 0) break;
      this.note(65, beatAt, Math.min(0.13, duration), 0.25, "sine", 42);
      if (duration > 0.2) this.note(55, beatAt + 0.13, 0.1, 0.12, "sine", 38);
      this.note(PHRASE[this.beat % PHRASE.length]!, beatAt, duration, 0.075, "triangle");
      this.beat = (this.beat + 1) % PHRASE.length;
      this.nextBeat += interval;
    }
  }

  private note(
    frequency: number,
    at: number,
    duration: number,
    volume: number,
    type: OscillatorType,
    endFrequency = frequency,
  ): void {
    const context = this.context;
    if (!context || !this.output) return;
    const voice = context.createOscillator();
    voice.type = type;
    voice.frequency.setValueAtTime(frequency, at);
    voice.frequency.exponentialRampToValueAtTime(endFrequency, at + duration);
    this.envelope(voice, at, duration, volume);
  }

  private hiss(at: number, duration: number, volume: number, frequency: number): void {
    const context = this.context;
    if (!context || !this.noise || !this.output) return;
    const voice = context.createBufferSource();
    voice.buffer = this.noise;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = frequency;
    voice.connect(filter);
    this.envelope(voice, at, duration, volume, filter);
  }

  private envelope(
    voice: AudioScheduledSourceNode,
    at: number,
    duration: number,
    volume: number,
    filtered?: BiquadFilterNode,
  ): void {
    const context = this.context;
    if (!context || !this.output) return;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + Math.min(0.012, duration / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    (filtered ?? voice).connect(gain).connect(this.output);
    this.voices.add(voice);
    voice.onended = () => {
      this.voices.delete(voice);
      voice.disconnect();
      filtered?.disconnect();
      gain.disconnect();
    };
    voice.start(at);
    voice.stop(at + duration);
  }

  private boom(at: number): void {
    this.hiss(at, 0.8, 0.45, 950);
    this.note(110, at, 0.75, 0.45, "sine", 30);
    for (const [index, frequency] of [440, 554.37, 659.25].entries())
      this.note(frequency, at + 0.55 + index * 0.14, 0.4, 0.1, "sine");
  }

  pause(): void {
    this.nextBeat = 0;
    for (const voice of this.voices) voice.stop();
    this.voices.clear();
  }

  setActive(value: boolean): void {
    this.active = value;
    if (!value) this.pause();
  }

  destroy(): void {
    this.destroyed = true;
    ++this.revision;
    this.enabled = false;
    this.pause();
    void this.context?.close().catch(() => {});
  }
}
