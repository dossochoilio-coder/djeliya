/* ============================================================
   Calcule une forme d'onde réelle (pics d'amplitude) à partir
   d'un blob audio, pour l'affichage du ruban de lecture.
   ============================================================ */

export async function computePeaks(blob, buckets = 200) {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const channel = audioBuffer.getChannelData(0);
    const blockSize = Math.max(1, Math.floor(channel.length / buckets));
    const peaks = new Array(buckets).fill(0);
    for (let i = 0; i < buckets; i++) {
      const start = i * blockSize;
      let max = 0;
      for (let j = 0; j < blockSize && start + j < channel.length; j++) {
        const v = Math.abs(channel[start + j]);
        if (v > max) max = v;
      }
      peaks[i] = max;
    }
    const peakMax = Math.max(...peaks, 0.0001);
    return {
      peaks: peaks.map((p) => p / peakMax),
      duree: audioBuffer.duration,
    };
  } finally {
    ctx.close();
  }
}
