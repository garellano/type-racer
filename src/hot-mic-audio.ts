import { hotMicSample, type HotMicRound } from "../shared/hot-mic";

const MAX_CLIP_BYTES = 1024 * 1024;
const MAX_CLIP_SECONDS = 30;
const PASS_FRESH_MS = 90;
const FINISH_FRESH_MS = 1200;
const MAX_VOICES = 32;

type Clips = { applause: AudioBuffer; cheer: AudioBuffer };
type Voice = { source: AudioScheduledSourceNode; nodes: AudioNode[] };

/** Short passing notes and a finite office ovation; animation never decides the speaker. */
export class HotMicAudio {
  private context: AudioContext | undefined;
  private output: GainNode | undefined;
  private clips: Clips | undefined;
  private loading: Promise<Clips> | undefined;
  private readonly requests = new AbortController();
  private readonly voices = new Set<Voice>();
  private enabled = false;
  private available = true;
  private destroyed = false;
  private revision = 0;
  private roundId: string | null = null;
  private segmentIndex = -1;
  private finishArmed = false;
  private finishObserved = false;

  constructor(private readonly sources: { applauseUrl: string; cheerUrl: string }) {}

  async setEnabled(value: boolean): Promise<boolean> {
    const revision = ++this.revision;
    this.enabled = false;
    this.finishArmed = false;
    this.stopVoices();
    if (!value || this.destroyed) return false;
    try {
      if (!this.context || this.context.state === "closed") {
        this.output?.disconnect();
        this.context = new AudioContext();
        this.output = this.context.createGain();
        this.output.gain.value = 0.65;
        this.output.connect(this.context.destination);
      }
      const context = this.context;
      // Resume in the click's synchronous stack, before fetching or decoding any sample.
      const resume = context.resume();
      await Promise.all([resume, this.loadClips(context)]);
      if (revision !== this.revision || this.destroyed || context !== this.context) return false;
      if (context.state !== "running") return false;
      this.enabled = true;
      if (this.available) {
        this.note(523.25, context.currentTime, 0.14, 0.13, "sine");
        this.note(783.99, context.currentTime + 0.12, 0.19, 0.1, "sine");
      }
      return true;
    } catch {
      if (revision === this.revision) {
        this.enabled = false;
        this.finishArmed = false;
        this.stopVoices();
      }
      return false;
    }
  }

  update(round: HotMicRound | null, now: number, available: boolean): void {
    if (this.destroyed) return;
    this.available = available;
    const id = round?.id ?? null;
    if (id !== this.roundId) {
      this.stopVoices();
      this.roundId = id;
      this.segmentIndex = -1;
      this.finishArmed = false;
      this.finishObserved = false;
    }
    const context = this.context;
    const audible =
      this.enabled && available && context?.state === "running" && this.clips !== undefined;
    if (!audible) {
      this.finishArmed = false;
      this.stopVoices();
    }
    if (!round || !Number.isFinite(now)) return;

    if (now < round.startAt) {
      this.finishArmed = false;
      return;
    }
    const sample = hotMicSample(round, now);
    if (sample.phase === "finished") {
      if (this.finishObserved) return;
      this.finishObserved = true;
      const celebrate = audible && this.finishArmed && now - round.finishAt <= FINISH_FRESH_MS;
      this.finishArmed = false;
      this.stopVoices();
      if (celebrate) this.fanfare(context.currentTime);
      return;
    }

    this.finishArmed = audible;
    if (sample.segmentIndex <= this.segmentIndex) return;
    // Observe missed or muted passes once; returning to a tab never queues old notes.
    this.segmentIndex = sample.segmentIndex;
    const segment = round.segments[sample.segmentIndex];
    if (!segment || segment.kind !== "pass") return;
    const age = sample.progress * segment.durationMs;
    if (!audible || age > PASS_FRESH_MS) return;
    const notes = [392, 440, 523.25, 587.33, 659.25] as const;
    this.note(notes[sample.segmentIndex % notes.length]!, context.currentTime, 0.1, 0.08, "sine");
  }

  /** Hiding or muting cannot leave a finish armed for a later return to the tab. */
  pause(): void {
    this.available = false;
    this.finishArmed = false;
    this.stopVoices();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    ++this.revision;
    this.enabled = false;
    this.pause();
    this.requests.abort();
    this.loading = undefined;
    this.clips = undefined;
    this.output?.disconnect();
    this.output = undefined;
    const context = this.context;
    this.context = undefined;
    if (context && context.state !== "closed") void context.close().catch(() => {});
  }

  private loadClips(context: AudioContext): Promise<Clips> {
    if (this.clips) return Promise.resolve(this.clips);
    if (this.loading) return this.loading;
    const pending = Promise.all([
      this.fetchClip(this.sources.applauseUrl, context),
      this.fetchClip(this.sources.cheerUrl, context),
    ]).then(([applause, cheer]) => {
      const clips = { applause, cheer };
      if (!this.destroyed) this.clips = clips;
      return clips;
    });
    this.loading = pending;
    // Attach both branches so a failed fetch is retryable without an unhandled rejection.
    void pending.then(
      () => {
        if (this.loading === pending) this.loading = undefined;
      },
      () => {
        if (this.loading === pending) this.loading = undefined;
      },
    );
    return pending;
  }

  private async fetchClip(url: string, context: AudioContext): Promise<AudioBuffer> {
    const response = await fetch(url, { signal: this.requests.signal, credentials: "same-origin" });
    if (!response.ok) throw new Error("Could not load the office sound.");
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_CLIP_BYTES) {
      await response.body?.cancel();
      throw new Error("The office sound is too large.");
    }
    let encoded: ArrayBuffer;
    if (response.body) {
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          length += next.value.byteLength;
          if (length > MAX_CLIP_BYTES) {
            await reader.cancel();
            throw new Error("The office sound is too large.");
          }
          chunks.push(next.value);
        }
      } finally {
        reader.releaseLock();
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      encoded = bytes.buffer;
    } else {
      encoded = await response.arrayBuffer();
      if (encoded.byteLength > MAX_CLIP_BYTES) throw new Error("The office sound is too large.");
    }
    if (encoded.byteLength === 0) throw new Error("The office sound is empty.");
    const decoded = await context.decodeAudioData(encoded);
    if (
      !Number.isFinite(decoded.duration) ||
      decoded.duration <= 0 ||
      decoded.duration > MAX_CLIP_SECONDS
    )
      throw new Error("The office sound has an invalid duration.");
    return decoded;
  }

  private sample(
    buffer: AudioBuffer,
    at: number,
    duration: number,
    volume: number,
    offset = 0,
  ): void {
    const context = this.context;
    if (!context || !this.output || this.voices.size >= MAX_VOICES) return;
    const length = Math.min(duration, buffer.duration - offset);
    if (length < 0.05) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    const gain = context.createGain();
    source.connect(gain).connect(this.output);
    this.envelope(gain.gain, at, length, volume);
    this.track(source, [source, gain]);
    source.start(at, offset, length);
    source.stop(at + length);
  }

  private note(
    frequency: number,
    at: number,
    duration: number,
    volume: number,
    type: OscillatorType = "sawtooth",
  ): void {
    const context = this.context;
    if (!context || !this.output || this.voices.size >= MAX_VOICES) return;
    const source = context.createOscillator();
    source.type = type;
    source.frequency.setValueAtTime(frequency, at);
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = type === "sine" ? 4000 : 2400;
    filter.Q.value = 0.6;
    const gain = context.createGain();
    source.connect(filter).connect(gain).connect(this.output);
    this.envelope(gain.gain, at, duration, volume);
    this.track(source, [source, filter, gain]);
    source.start(at);
    source.stop(at + duration);
  }

  private envelope(gain: AudioParam, at: number, duration: number, volume: number): void {
    const attack = Math.min(0.035, duration / 3);
    gain.setValueAtTime(0.0001, at);
    gain.exponentialRampToValueAtTime(volume, at + attack);
    gain.setValueAtTime(volume, at + Math.max(attack, duration - 0.09));
    gain.exponentialRampToValueAtTime(0.0001, at + duration);
  }

  private track(source: AudioScheduledSourceNode, nodes: AudioNode[]): void {
    const voice = { source, nodes };
    this.voices.add(voice);
    source.onended = () => this.release(voice);
  }

  private release(voice: Voice): void {
    if (!this.voices.delete(voice)) return;
    voice.source.onended = null;
    for (const node of voice.nodes) node.disconnect();
  }

  private stopVoices(): void {
    for (const voice of this.voices) {
      try {
        voice.source.stop();
      } catch {
        /* A source that ended between ticks is already silent. */
      }
      this.release(voice);
    }
  }

  private fanfare(at: number): void {
    const clips = this.clips;
    if (!clips) return;
    // Original C-major brass-like rise and cadence, with a short office ovation underneath.
    for (const [offset, frequency, duration, volume] of [
      [0, 523.25, 0.16, 0.13],
      [0.18, 659.25, 0.16, 0.13],
      [0.36, 783.99, 0.21, 0.14],
      [0.61, 1046.5, 0.43, 0.16],
      [1.08, 783.99, 0.17, 0.12],
      [1.31, 523.25, 0.95, 0.08],
      [1.31, 659.25, 0.95, 0.08],
      [1.31, 1046.5, 0.95, 0.13],
    ] as const)
      this.note(frequency, at + offset, duration, volume);
    this.sample(clips.applause, at + 0.05, 3, 0.72, 1);
    this.sample(clips.cheer, at + 0.23, 2.5, 0.18, 0.4);
  }
}
