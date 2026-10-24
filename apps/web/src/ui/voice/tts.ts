export function speak(text: string) {
  if (!("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const ut = new SpeechSynthesisUtterance(text);
    ut.lang = "zh-CN";
    ut.rate = 1;
    ut.pitch = 1;
    ut.volume = 1;
    window.speechSynthesis.speak(ut);
  } catch {
    undefined;
  }
}

export function speakNow(text: string) {
  speak(text);
}

export function unlockTtsInGesture() {
  if (!("speechSynthesis" in window)) return;
  try {
    const ut = new SpeechSynthesisUtterance("");
    ut.lang = "zh-CN";
    ut.rate = 1;
    ut.pitch = 1;
    ut.volume = 0;
    window.speechSynthesis.speak(ut);
    window.speechSynthesis.cancel();
  } catch {
    undefined;
  }
}

export function stopSpeaking() {
  if (!("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    undefined;
  }
}
