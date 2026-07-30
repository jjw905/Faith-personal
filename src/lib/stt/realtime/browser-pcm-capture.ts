"use client";

type PcmChunk = {
  startSec: number;
  endSec: number;
  samples: Float32Array;
};

const KEEP_SECONDS = 120;

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index++) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index++) {
    const sample = Math.max(-1, Math.min(1, samples[index]!));
    view.setInt16(
      44 + index * 2,
      sample < 0 ? sample * 0x8000 : sample * 0x7fff,
      true,
    );
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export class BrowserPcmCapture {
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private silentGain: GainNode | null = null;
  private chunks: PcmChunk[] = [];
  private capturedSamples = 0;

  async start(track: MediaStreamTrack): Promise<void> {
    this.stop();
    const context = new AudioContext();
    const source = context.createMediaStreamSource(new MediaStream([track]));
    const processor = context.createScriptProcessor(4096, 1, 1);
    const silentGain = context.createGain();
    silentGain.gain.value = 0;
    processor.onaudioprocess = (event) => {
      const samples = new Float32Array(event.inputBuffer.getChannelData(0));
      const startSec = this.capturedSamples / context.sampleRate;
      this.capturedSamples += samples.length;
      const endSec = this.capturedSamples / context.sampleRate;
      this.chunks.push({ startSec, endSec, samples });
      const keepAfter = Math.max(0, endSec - KEEP_SECONDS);
      while (this.chunks[0] && this.chunks[0].endSec < keepAfter) {
        this.chunks.shift();
      }
    };
    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(context.destination);
    this.context = context;
    this.source = source;
    this.processor = processor;
    this.silentGain = silentGain;
    this.chunks = [];
    this.capturedSamples = 0;
    if (context.state === "suspended") await context.resume();
  }

  wavForWindow(startSec: number, endSec: number): Blob | null {
    const context = this.context;
    if (!context || endSec <= startSec) return null;
    const from = Math.max(0, startSec - 0.25);
    const to = Math.min(endSec + 0.2, from + 35);
    const pieces: Float32Array[] = [];
    let total = 0;
    for (const chunk of this.chunks) {
      if (chunk.endSec <= from || chunk.startSec >= to) continue;
      const startIndex = Math.max(
        0,
        Math.floor((from - chunk.startSec) * context.sampleRate),
      );
      const endIndex = Math.min(
        chunk.samples.length,
        Math.ceil((to - chunk.startSec) * context.sampleRate),
      );
      if (endIndex <= startIndex) continue;
      const piece = chunk.samples.slice(startIndex, endIndex);
      pieces.push(piece);
      total += piece.length;
    }
    if (total < context.sampleRate * 0.1) return null;
    const samples = new Float32Array(total);
    let offset = 0;
    for (const piece of pieces) {
      samples.set(piece, offset);
      offset += piece.length;
    }
    return encodeWav(samples, context.sampleRate);
  }

  stop(): void {
    if (this.processor) this.processor.onaudioprocess = null;
    this.source?.disconnect();
    this.processor?.disconnect();
    this.silentGain?.disconnect();
    if (this.context) void this.context.close();
    this.context = null;
    this.source = null;
    this.processor = null;
    this.silentGain = null;
    this.chunks = [];
    this.capturedSamples = 0;
  }
}
