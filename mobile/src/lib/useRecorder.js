import { useCallback, useRef, useState } from "react";

/* ============================================================
   Enregistrement audio via l'API native du navigateur
   (getUserMedia + MediaRecorder). Fonctionne dans l'app Android
   grâce à la permission RECORD_AUDIO déjà déclarée : Capacitor
   accorde automatiquement l'accès au micro demandé par la page.
   ============================================================ */

function pickMimeType() {
  const candidats = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const c of candidats) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(c)) return c;
  }
  return "";
}

export function useRecorder() {
  const [status, setStatus] = useState("inactif"); // inactif | demande | enregistrement | arrete
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState(() => new Array(48).fill(4));
  const [erreur, setErreur] = useState(null);

  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const timerRef = useRef(null);
  const mimeRef = useRef("");

  const stopMeter = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {});
    audioCtxRef.current = null;
  };

  const runMeter = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const loop = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      const h = Math.min(100, 4 + rms * 340);
      setLevels((prev) => [...prev.slice(1), h]);
      rafRef.current = requestAnimationFrame(loop);
    };
    loop();
  }, []);

  const start = useCallback(async () => {
    setErreur(null);
    setStatus("demande");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;

      const mime = pickMimeType();
      mimeRef.current = mime;
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.start(250);
      recorderRef.current = recorder;

      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      runMeter();
      setStatus("enregistrement");
    } catch (e) {
      setErreur(
        e.name === "NotAllowedError"
          ? "Accès au microphone refusé. Autorise-le dans les réglages du téléphone."
          : "Impossible de démarrer l'enregistrement : " + e.message
      );
      setStatus("inactif");
    }
  }, [runMeter]);

  const cleanup = () => {
    clearInterval(timerRef.current);
    stopMeter();
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const stop = useCallback(() => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder) { resolve(null); return; }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeRef.current || "audio/webm" });
        cleanup();
        setStatus("arrete");
        resolve(blob);
      };
      recorder.stop();
    });
  }, []);

  const cancel = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    cleanup();
    chunksRef.current = [];
    setStatus("inactif");
    setSeconds(0);
  }, []);

  return { status, seconds, levels, erreur, start, stop, cancel };
}
