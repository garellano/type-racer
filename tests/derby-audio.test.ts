import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDerbyRound, type DerbyRound } from "../shared/derby";

type DerbyAudio = {
  setEnabled(value: boolean): Promise<boolean>;
  update(round: DerbyRound | null, now: number, available: boolean): void;
  pause(): void;
  destroy(): void;
};
// The browser class is checked with DOM types by tsconfig.json. Importing it through
// Vitest keeps DOM globals out of the separate Workers TypeScript program.
const { DerbyAudio } = await vi.importActual<{
  DerbyAudio: new (sources: { applauseUrl: string; cheerUrl: string }) => DerbyAudio;
}>("../src/derby-audio");

class MockParameter {
  value = 0;
  setValueAtTime = vi.fn((value: number, _time: number) => {
    this.value = value;
    return this;
  });
  linearRampToValueAtTime = vi.fn((value: number, _time: number) => {
    this.value = value;
    return this;
  });
  exponentialRampToValueAtTime = this.linearRampToValueAtTime;
  cancelScheduledValues = vi.fn((_time: number) => this);
}

class MockNode {
  connect = vi.fn((destination: unknown) => destination);
  disconnect = vi.fn();
}

class MockGain extends MockNode {
  gain = new MockParameter();
}

class MockFilter extends MockNode {
  type = "lowpass";
  frequency = new MockParameter();
  Q = new MockParameter();
  gain = new MockParameter();
}

class MockSource extends MockNode {
  buffer: { duration: number } | null = null;
  frequency = new MockParameter();
  detune = new MockParameter();
  playbackRate = new MockParameter();
  type = "sine";
  loop = false;
  onended: (() => void) | null = null;
  start = vi.fn((..._times: number[]) => {});
  stop = vi.fn((..._times: number[]) => {});

  constructor(readonly kind: "buffer" | "oscillator") {
    super();
  }

  end(): void {
    this.onended?.();
  }
}

class MockAudioContext {
  static instances: MockAudioContext[] = [];
  static resumeFailures = 0;
  static decodeFailures = 0;
  static resumeGate: Promise<void> | null = null;
  currentTime = 10;
  sampleRate = 48_000;
  state = "suspended";
  destination = new MockNode();
  sources: MockSource[] = [];
  filters: MockFilter[] = [];
  gains: MockGain[] = [];
  resume = vi.fn(async () => {
    if (MockAudioContext.resumeFailures > 0) {
      MockAudioContext.resumeFailures--;
      throw new Error("Audio unlock rejected");
    }
    if (MockAudioContext.resumeGate) await MockAudioContext.resumeGate;
    this.state = "running";
  });
  close = vi.fn(async () => {
    this.state = "closed";
  });
  decodeAudioData = vi.fn(async (data: ArrayBuffer) => {
    if (MockAudioContext.decodeFailures > 0) {
      MockAudioContext.decodeFailures--;
      throw new Error("Unsupported audio");
    }
    return { duration: new Uint8Array(data)[0] === 2 ? 4 : 7 };
  });

  constructor() {
    MockAudioContext.instances.push(this);
  }

  createGain(): MockGain {
    const gain = new MockGain();
    this.gains.push(gain);
    return gain;
  }

  createBufferSource(): MockSource {
    const source = new MockSource("buffer");
    this.sources.push(source);
    return source;
  }

  createOscillator(): MockSource {
    const source = new MockSource("oscillator");
    this.sources.push(source);
    return source;
  }

  createBiquadFilter(): MockFilter {
    const filter = new MockFilter();
    this.filters.push(filter);
    return filter;
  }
}

const sampleResponse = async (resource: unknown): Promise<Response> =>
  new Response(new Uint8Array([String(resource).includes("cheer") ? 2 : 1]), {
    headers: { "Content-Length": "1" },
  });
const fetchAudio = vi.fn(sampleResponse);
const audios: DerbyAudio[] = [];
const createdAt = 1_800_000_000_000;

function round(now = createdAt) {
  return createDerbyRound(
    [
      { id: "sam", name: "Sam", characterId: "sunbeam" },
      { id: "gary", name: "Gary", characterId: "scout" },
    ],
    now,
  );
}

function audio(): DerbyAudio {
  const sound = new DerbyAudio({
    applauseUrl: "/assets/derby/audio/office-applause-v1.mp3",
    cheerUrl: "/assets/derby/audio/office-cheer-v1.mp3",
  });
  audios.push(sound);
  return sound;
}

function context(): MockAudioContext {
  return MockAudioContext.instances.at(-1)!;
}

function started(kind?: MockSource["kind"]): MockSource[] {
  return context().sources.filter(
    (source) => source.start.mock.calls.length > 0 && (!kind || source.kind === kind),
  );
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

beforeEach(() => {
  MockAudioContext.instances = [];
  MockAudioContext.resumeFailures = 0;
  MockAudioContext.decodeFailures = 0;
  MockAudioContext.resumeGate = null;
  fetchAudio.mockReset().mockImplementation(sampleResponse);
  vi.stubGlobal("AudioContext", MockAudioContext);
  vi.stubGlobal("fetch", fetchAudio);
});

afterEach(() => {
  for (const sound of audios.splice(0)) sound.destroy();
  vi.unstubAllGlobals();
});

describe("Office Derby audio unlock and assets", () => {
  it("unlocks from the user gesture before awaiting and reuses its decoded samples", async () => {
    const sound = audio();
    const enabling = sound.setEnabled(true);
    expect(MockAudioContext.instances).toHaveLength(1);
    expect(context().resume).toHaveBeenCalledOnce();
    expect(await enabling).toBe(true);
    expect(started("oscillator").length).toBeGreaterThan(0);
    expect(fetchAudio).toHaveBeenCalledTimes(2);
    expect(context().decodeAudioData).toHaveBeenCalledTimes(2);
    expect(await sound.setEnabled(false)).toBe(false);
    expect(await sound.setEnabled(true)).toBe(true);
    expect(MockAudioContext.instances).toHaveLength(1);
    expect(fetchAudio).toHaveBeenCalledTimes(2);
    expect(context().decodeAudioData).toHaveBeenCalledTimes(2);
  });

  it("keeps failed unlocks silent and allows a later gesture to retry", async () => {
    const sound = audio();
    MockAudioContext.resumeFailures = 1;
    expect(await sound.setEnabled(true)).toBe(false);
    expect(started()).toHaveLength(0);
    expect(await sound.setEnabled(true)).toBe(true);
    expect(started("oscillator").length).toBeGreaterThan(0);
  });

  it("cannot reactivate from a pending unlock after the host mutes", async () => {
    const sound = audio();
    const gate = deferred();
    MockAudioContext.resumeGate = gate.promise;
    const pending = sound.setEnabled(true);
    expect(await sound.setEnabled(false)).toBe(false);
    gate.resolve();
    expect(await pending).toBe(false);
    expect(started()).toHaveLength(0);
  });

  it("lets the latest enable win when asset loading overlaps rapid toggles", async () => {
    const sound = audio();
    const gate = deferred();
    fetchAudio.mockImplementation(async (resource) => {
      await gate.promise;
      return sampleResponse(resource);
    });
    const first = sound.setEnabled(true);
    await Promise.resolve();
    await sound.setEnabled(false);
    const latest = sound.setEnabled(true);
    gate.resolve();
    expect(await first).toBe(false);
    expect(await latest).toBe(true);
    expect(MockAudioContext.instances).toHaveLength(1);
  });

  it("cleans up a destroyed instance while an unlock is pending", async () => {
    const sound = audio();
    const gate = deferred();
    MockAudioContext.resumeGate = gate.promise;
    const pending = sound.setEnabled(true);
    sound.destroy();
    gate.resolve();
    expect(await pending).toBe(false);
    expect(context().close).toHaveBeenCalledOnce();
    expect(started()).toHaveLength(0);
    expect(await sound.setEnabled(true)).toBe(false);
  });

  it("handles failed downloads and decoding without a partially enabled soundtrack", async () => {
    const sound = audio();
    fetchAudio.mockResolvedValueOnce(new Response("Unavailable", { status: 503 }));
    expect(await sound.setEnabled(true)).toBe(false);
    expect(started()).toHaveLength(0);
    expect(await sound.setEnabled(true)).toBe(true);
    const decoding = audio();
    MockAudioContext.decodeFailures = 1;
    expect(await decoding.setEnabled(true)).toBe(false);
    expect(started()).toHaveLength(0);
    expect(await decoding.setEnabled(true)).toBe(true);
  });

  it.each(["declared", "streamed"])("rejects a %s sample over one MiB", async (size) => {
    fetchAudio.mockImplementation(async () =>
      size === "declared"
        ? new Response(new Uint8Array([1]), { headers: { "Content-Length": "1048577" } })
        : new Response(new Uint8Array(1_048_577)),
    );
    const sound = audio();
    expect(await sound.setEnabled(true)).toBe(false);
    expect(started()).toHaveLength(0);
    expect(context().decodeAudioData).not.toHaveBeenCalled();
  });

  it("accepts bounded samples exactly at the one-MiB limit", async () => {
    fetchAudio.mockImplementation(async (resource) => {
      const bytes = new Uint8Array(1_048_576);
      bytes[0] = String(resource).includes("cheer") ? 2 : 1;
      return new Response(bytes, { headers: { "Content-Length": "1048576" } });
    });
    expect(await audio().setEnabled(true)).toBe(true);
  });
});

describe("Office Derby live soundtrack", () => {
  it("keeps crowd samples silent until the scheduled race start", async () => {
    const sound = audio();
    const race = round();
    await sound.setEnabled(true);
    sound.update(race, createdAt, true);
    sound.update(race, race.startAt - 1, true);
    expect(started("buffer")).toHaveLength(0);
    sound.update(race, race.startAt, true);
    expect(started("buffer").length).toBeGreaterThan(0);
  });

  it("plays each fresh cheer bucket once and never accumulates a frame-by-frame queue", async () => {
    const sound = audio();
    const race = round();
    await sound.setEnabled(true);
    sound.update(race, race.startAt, true);
    const first = started("buffer").length;
    expect(first).toBeGreaterThan(0);
    for (const elapsed of [50, 150, 300, 650]) sound.update(race, race.startAt + elapsed, true);
    expect(started("buffer")).toHaveLength(first);
    sound.update(race, race.startAt + 6000, true);
    const second = started("buffer").length;
    expect(second).toBeGreaterThan(first);
    sound.update(race, race.startAt + 6300, true);
    expect(started("buffer")).toHaveLength(second);
    sound.update(race, race.startAt + 12000, true);
    const third = started("buffer").length;
    expect(third).toBeGreaterThan(second);
    sound.update(race, race.startAt + 12300, true);
    sound.update(race, race.startAt + 17500, true);
    expect(started("buffer")).toHaveLength(third);
  });

  it("skips old buckets rather than replaying missed applause", async () => {
    const sound = audio();
    const race = round();
    await sound.setEnabled(true);
    sound.update(race, race.startAt + 1800, true);
    expect(started("buffer")).toHaveLength(0);
    sound.update(race, race.startAt + 6500, true);
    const fresh = started("buffer").length;
    expect(fresh).toBeGreaterThan(0);
    sound.update(race, race.startAt + 14000, true);
    expect(started("buffer")).toHaveLength(fresh);
  });

  it("observes muted events so enabling inside the same bucket does not replay them", async () => {
    const sound = audio();
    const race = round();
    sound.update(race, race.startAt, true);
    await sound.setEnabled(true);
    sound.update(race, race.startAt + 100, true);
    expect(started("buffer")).toHaveLength(0);
    sound.update(race, race.startAt + 6000, true);
    expect(started("buffer").length).toBeGreaterThan(0);
  });

  it("plays one finite fanfare and ovation after an audible, visible race", async () => {
    const sound = audio();
    const race = round();
    await sound.setEnabled(true);
    sound.update(race, race.startAt, true);
    const before = started().length;
    const notesBefore = started("oscillator").length;
    const clipsBefore = started("buffer").length;
    sound.update(race, race.finishAt, true);
    expect(started("oscillator").length).toBeGreaterThan(notesBefore);
    expect(started("buffer").length).toBeGreaterThan(clipsBefore);
    const after = started().length;
    expect(after).toBeGreaterThan(before);
    sound.update(race, race.finishAt + 100, true);
    sound.update(race, race.finishAt + 600, true);
    expect(started()).toHaveLength(after);
    for (const source of started()) {
      const duration = source.start.mock.calls[0]?.[2];
      expect(source.loop).toBe(false);
      expect(source.stop.mock.calls.length > 0 || (duration !== undefined && duration > 0)).toBe(
        true,
      );
      for (const stop of source.stop.mock.calls)
        if (stop[0] !== undefined) expect(stop[0]).toBeLessThanOrEqual(context().currentTime + 10);
    }
  });

  it.each(["restored", "late", "paused", "unavailable", "muted"])(
    "does not play a stale %s finish fanfare",
    async (scenario) => {
      const sound = audio();
      const race = round();
      await sound.setEnabled(true);
      if (scenario !== "restored") sound.update(race, race.startAt, true);
      if (scenario === "paused") sound.pause();
      if (scenario === "unavailable") sound.update(race, race.finishAt, false);
      if (scenario === "muted") {
        await sound.setEnabled(false);
        sound.update(race, race.finishAt, true);
        await sound.setEnabled(true);
      }
      const before = started().length;
      sound.update(race, race.finishAt + (scenario === "late" ? 1500 : 100), true);
      expect(started()).toHaveLength(before);
    },
  );

  it("stops all live voices immediately on mute and never reconnects them later", async () => {
    const sound = audio();
    const race = round();
    await sound.setEnabled(true);
    sound.update(race, race.startAt, true);
    const playing = started().filter((source) => source.disconnect.mock.calls.length === 0);
    const stopCounts = playing.map((source) => source.stop.mock.calls.length);
    await sound.setEnabled(false);
    playing.forEach((source, index) =>
      expect(source.stop.mock.calls.length).toBeGreaterThan(stopCounts[index]!),
    );
    const count = started().length;
    sound.update(race, race.startAt + 6000, true);
    expect(started()).toHaveLength(count);
  });

  it("silences an unavailable page immediately and resumes only a fresh future bucket", async () => {
    const sound = audio();
    const race = round();
    await sound.setEnabled(true);
    sound.update(race, race.startAt, true);
    const playing = started().filter((source) => source.disconnect.mock.calls.length === 0);
    expect(playing.length).toBeGreaterThan(0);
    sound.update(race, race.startAt + 200, false);
    for (const source of playing) expect(source.disconnect).toHaveBeenCalled();
    const count = started().length;
    sound.update(race, race.startAt + 400, true);
    expect(started()).toHaveLength(count);
    sound.update(race, race.startAt + 6000, true);
    expect(started().length).toBeGreaterThan(count);
  });

  it("cancels the previous round and clears source connections on completion", async () => {
    const sound = audio();
    const first = round();
    await sound.setEnabled(true);
    sound.update(first, first.startAt, true);
    const oldSources = started().filter((source) => source.disconnect.mock.calls.length === 0);
    const oldStops = oldSources.map((source) => source.stop.mock.calls.length);
    const next = round(createdAt + 30_000);
    sound.update(next, next.startAt, true);
    oldSources.forEach((source, index) =>
      expect(source.stop.mock.calls.length).toBeGreaterThan(oldStops[index]!),
    );
    for (const source of started()) {
      source.end();
      expect(source.disconnect).toHaveBeenCalled();
    }
    sound.destroy();
    expect(context().close).toHaveBeenCalledOnce();
  });
});
