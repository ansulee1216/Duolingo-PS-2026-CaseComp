// Two overlapping moving delay taps shift pitch by a constant ratio.
// A constant ratio keeps rising and falling contours in the same direction.
class CharacterVoice extends AudioWorkletProcessor {
  constructor({ processorOptions }) {
    super();
    this.window = Math.round(sampleRate * 0.045);
    this.buffer = new Float32Array(this.window + 8);
    this.index = 0;
    this.phase = 0;
    this.step = (1 - processorOptions.ratio) / this.window;
    this.blocks = 0;
  }

  tap(phase) {
    const position = this.index - 2 - phase * this.window + this.buffer.length;
    const index = Math.floor(position);
    const fraction = position - index;
    const first = this.buffer[index % this.buffer.length];
    const second = this.buffer[(index + 1) % this.buffer.length];
    return first + (second - first) * fraction;
  }

  process(inputs, outputs) {
    if (this.blocks++ % 80 === 0) this.port.postMessage('running');
    const input = inputs[0][0];
    const output = outputs[0][0];
    for (let i = 0; i < output.length; i++) {
      this.buffer[this.index] = input?.[i] ?? 0;
      const other = (this.phase + 0.5) % 1;
      const blend = (1 - Math.cos(2 * Math.PI * this.phase)) / 2;
      output[i] = this.tap(this.phase) * blend + this.tap(other) * (1 - blend);
      this.index = (this.index + 1) % this.buffer.length;
      this.phase = (this.phase + this.step + 1) % 1;
    }
    return true;
  }
}
registerProcessor('character-voice', CharacterVoice);

