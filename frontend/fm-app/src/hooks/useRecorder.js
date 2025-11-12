import { useState, useRef } from "react";

export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const mediaRecorder = useRef(null);
  const chunks = useRef([]);

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder.current = new MediaRecorder(stream);
    mediaRecorder.current.ondataavailable = (e) => chunks.current.push(e.data);
    mediaRecorder.current.start();
    setRecording(true);
  }

  async function stop() {
    return new Promise((resolve) => {
      mediaRecorder.current.onstop = async () => {
        const blob = new Blob(chunks.current, { type: "audio/wav" });
        chunks.current = [];
        setRecording(false);
        resolve(blob);
      };
      mediaRecorder.current.stop();
    });
  }

  return { recording, start, stop };
}















