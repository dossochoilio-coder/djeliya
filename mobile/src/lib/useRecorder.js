import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "./i18n.js";

/* ============================================================
   Enregistrement audio via l'API native du navigateur
   (getUserMedia + MediaRecorder). Fonctionne dans l'app Android
   grâce à la permission RECORD_AUDIO déjà déclarée : Capacitor
   accorde automatiquement l'accès au micro demandé par la page.

   - Pause/reprise natives (MediaRecorder.pause()/resume()) : aucune
     perte, aucune coupure, l'audio repart exactement là où il
     s'était arrêté.
   - Maintien de l'écran actif pendant l'enregistrement, pour que
     l'entretien ne soit jamais interrompu par une mise en veille
     automatique du téléphone tant que l'app reste ouverte.
   - Fonctionne entièrement hors connexion : l'enregistrement lui-même
     n'a besoin d'aucun réseau, seul l'envoi final pour transcription
     en a besoin (et l'audio reste sauvegardé sur l'appareil si cet
     envoi échoue, pour un nouvel essai plus tard).
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
  const { t } = useT();
  const [status, setStatus] = useState("inactif"); // inactif | demande | enregistrement | pause | arrete
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
  const wakeLockRef = useRef(null);
  const statusRef = useRef("inactif");

  useEffect(() => { statusRef.current = status; }, [status]);

  const demanderWakeLock = async () => {
    try {
      if ("wakeLock" in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      }
    } catch { /* indisponible sur cet appareil : pas bloquant */ }
  };
  const relacherWakeLock = () => {
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  };

  /* Le verrou d'écran est automatiquement relâché par le système quand l'app
     passe en arrière-plan — on le redemande dès le retour au premier plan
     si l'enregistrement est toujours actif. */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" &&
        (statusRef.current === "enregistrement" || statusRef.current === "pause")) {
        demanderWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const stopMeter = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
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
      await demanderWakeLock();
      setStatus("enregistrement");
    } catch (e) {
      setErreur(
        e.name === "NotAllowedError"
          ? t("nouvelEntretien.micRefuse")
          : t("nouvelEntretien.micErreur") + e.message
      );
      setStatus("inactif");
    }
  }, [runMeter, t]);

  const pause = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    recorder.pause();
    clearInterval(timerRef.current);
    stopMeter();
    setStatus("pause");
  }, []);

  const resume = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "paused") return;
    recorder.resume();
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    runMeter();
    setStatus("enregistrement");
  }, [runMeter]);

  const cleanup = () => {
    clearInterval(timerRef.current);
    stopMeter();
    relacherWakeLock();
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
      // Un MediaRecorder en pause doit être relancé avant de pouvoir être arrêté proprement.
      if (recorder.state === "paused") recorder.resume();
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

  return { status, seconds, levels, erreur, start, pause, resume, stop, cancel };
}
