// Synthesized local UI/footstep tones. Never starts before a user opts in.
export class NightAudio {
  private context?: AudioContext;
  private active = false;
  private lastFootstep = 0;
  async toggle() {
    this.active = !this.active;
    if (this.active) {
      this.context ||= new AudioContext();
      try { await this.context.resume(); } catch { this.active = false; }
      if (this.active) this.tone(420, .08, .025);
    }
    return this.active;
  }
  tone(frequency: number, duration: number, volume: number) {
    if (!this.active || !this.context || this.context.state !== 'running') return;
    const oscillator = this.context.createOscillator(), envelope = this.context.createGain(), now = this.context.currentTime;
    oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(frequency, now);
    envelope.gain.setValueAtTime(.001, now); envelope.gain.linearRampToValueAtTime(volume, now + .01); envelope.gain.exponentialRampToValueAtTime(.001, now + duration);
    oscillator.connect(envelope); envelope.connect(this.context.destination);
    oscillator.start(now); oscillator.stop(now + duration + .02);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
  }
  step(now: number) {
    if (now - this.lastFootstep < 240) return;
    this.lastFootstep = now; this.tone(75, .055, .028);
  }
  close() { void this.context?.close(); this.context = undefined; this.active = false; }
}
