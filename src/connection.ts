import {
  serverMessageSchema,
  type ClientMessage,
  type Session,
  type Snapshot,
} from "../shared/protocol";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "offline";

export class RaceConnection {
  private socket: WebSocket | undefined;
  private stopped = false;
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  private initialPings: ReturnType<typeof setTimeout>[] = [];
  private readonly clockOrigin = Date.now() - performance.now();
  private offset = 0;
  private bestRtt = Infinity;
  private version = -1;
  public latency: number | null = null;
  public lastSnapshotAt = 0;
  public clockReady = false;
  public status: ConnectionStatus = "connecting";

  constructor(
    private readonly apiUrl: string,
    private readonly roomId: string,
    private readonly session: Session,
    private readonly onSnapshot: (state: Snapshot) => void,
    private readonly onStatus: (status: ConnectionStatus) => void,
    private readonly onError: (message: string) => void,
  ) {
    this.connect();
  }

  now(): number {
    return this.clockOrigin + performance.now() + this.offset;
  }

  send(message: ClientMessage): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    if (message.type !== "hello" && this.status !== "connected") return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  private changeStatus(status: ConnectionStatus): void {
    this.status = status;
    this.onStatus(status);
  }

  private clearPings(): void {
    if (this.pingTimer !== undefined) clearInterval(this.pingTimer);
    this.pingTimer = undefined;
    for (const timer of this.initialPings) clearTimeout(timer);
    this.initialPings = [];
  }

  private connect(): void {
    if (this.stopped) return;
    this.changeStatus(this.retry ? "reconnecting" : "connecting");
    const url = new URL(`/rooms/${this.roomId}/socket`, this.apiUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(url);
    this.socket = socket;
    socket.addEventListener("open", () => {
      this.bestRtt = Infinity;
      this.clockReady = false;
      this.send({ type: "hello", session: this.session });
    });
    socket.addEventListener("message", (event: MessageEvent<unknown>) => {
      if (typeof event.data !== "string") return;
      let raw: unknown;
      try {
        raw = JSON.parse(event.data);
      } catch {
        this.onError("The server sent an invalid response.");
        return;
      }
      const parsed = serverMessageSchema.safeParse(raw);
      if (!parsed.success) {
        this.onError("The server response was not recognized. Reload this page.");
        return;
      }
      const message = parsed.data;
      if (message.type === "error") {
        this.onError(message.message);
        return;
      }
      if (message.type === "pong") {
        const receivedAt = performance.now();
        const rtt = receivedAt - message.sentAt;
        this.latency = Math.round(rtt);
        if (rtt < this.bestRtt) {
          this.bestRtt = rtt;
          this.offset = message.serverNow - (this.clockOrigin + (message.sentAt + receivedAt) / 2);
          this.clockReady = true;
        }
        return;
      }
      if (message.state.version < this.version) return;
      this.version = message.state.version;
      this.lastSnapshotAt = performance.now();
      this.retry = 0;
      this.changeStatus("connected");
      // The first authenticated snapshot acknowledges hello before any other command is sent.
      if (this.pingTimer === undefined) {
        const ping = () => {
          this.send({ type: "ping", sentAt: performance.now() });
        };
        for (const delay of [0, 250, 500]) this.initialPings.push(setTimeout(ping, delay));
        this.pingTimer = setInterval(ping, 60000);
      }
      this.onSnapshot(message.state);
    });
    socket.addEventListener("close", (event) => {
      this.clearPings();
      if (this.stopped) return;
      if ([1000, 1008, 4001, 4004].includes(event.code)) {
        this.stopped = true;
        this.changeStatus("offline");
        this.onError(event.reason || "This session is closed. Reload or create a new room.");
        return;
      }
      if (++this.retry > 6) {
        this.changeStatus("offline");
        this.onError("Connection lost. Reload to reconnect to this room.");
        return;
      }
      this.changeStatus("reconnecting");
      this.retryTimer = setTimeout(
        () => this.connect(),
        Math.min(500 * 2 ** (this.retry - 1), 8000),
      );
    });
    socket.addEventListener("error", () => this.changeStatus("reconnecting"));
  }

  close(): void {
    this.stopped = true;
    if (this.retryTimer !== undefined) clearTimeout(this.retryTimer);
    this.clearPings();
    this.socket?.close(1000, "Page closed.");
  }
}
