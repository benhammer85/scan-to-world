/**
 * The sound of the moment, heard only while a ring is drawn and never kept: how loud it is now, against
 * how loud it has lately been (0 hushed to 1 as loud as it's been), read a frame at a time. Nothing is
 * recorded, sent or stored; once the stroke ends the microphone is let go.
 */
export class Ear {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AnalyserNode | null = null;
  private buf = new Float32Array(1024);
  private loud = 0.02;
  /** The level now, eased (0 to 1). */
  level = 0.5;
  /** Whether it's hearing now. */
  get on(): boolean { return !!this.node; }

  /** Begin hearing (in a touch, as Safari asks). Quietly does nothing if the microphone isn't allowed. */
  async start(): Promise<void> {
    if (this.node || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx ??= new AC();
      void this.ctx.resume();
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const src = this.ctx.createMediaStreamSource(this.stream);
      this.node = this.ctx.createAnalyser(); this.node.fftSize = 1024;
      src.connect(this.node);
      this.level = 0.5;
    } catch { this.stop(); }
  }

  /** How loud now (0 to 1), eased over a breath so a sound swells the ring rather than spiking it. */
  read(): number {
    if (!this.node) return this.level;
    this.node.getFloatTimeDomainData(this.buf);
    let s = 0;
    for (let i = 0; i < this.buf.length; i++) s += this.buf[i] * this.buf[i];
    const rms = Math.sqrt(s / this.buf.length);
    // (Against how loud it's lately been: the room's own scale, rising quickly, falling slowly.)
    this.loud = Math.max(rms, this.loud * 0.995, 0.004);
    const now = Math.min(1, rms / this.loud);
    this.level += (now - this.level) * 0.12;
    return this.level;
  }

  /** Let the microphone go. */
  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null; this.node = null;
  }
}
