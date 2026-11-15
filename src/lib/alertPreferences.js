import { useCallback, useSyncExternalStore } from 'react';

const memory = new Map();
const eventName = 'kfc-alert-preference';
export function readAlertPreference(key) {
  try {
    const value = localStorage.getItem(key);
    if (value === 'true' || value === 'false') return value === 'true';
  } catch { /* Private browsing may disable storage. */ }
  return memory.get(key) ?? null;
}
export function saveAlertPreference(key, enabled) {
  memory.set(key, enabled);
  try { localStorage.setItem(key, String(enabled)); } catch { /* Remember for this visit. */ }
  window.dispatchEvent(new Event(eventName));
}
export function subscribeAlertPreferences(callback) {
  window.addEventListener(eventName, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(eventName, callback);
    window.removeEventListener('storage', callback);
  };
}
export function useAlertPreference(key) {
  const read = useCallback(() => readAlertPreference(key), [key]);
  return useSyncExternalStore(subscribeAlertPreferences, read, () => null);
}

let audio;
export function unlockAlertAudio() {
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return Promise.resolve(false);
    if (!audio || audio.state === 'closed') audio = new Audio();
    return audio.resume().then(() => audio.state === 'running', () => false);
  } catch { return Promise.resolve(false); }
}
export function playAlertSound(scope) {
  if (!readAlertPreference(`kfc_${scope}_sound`)) return;
  try {
    if (audio?.state !== 'running') return;
    const oscillator = audio.createOscillator(), gain = audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(660, audio.currentTime);
    gain.gain.setValueAtTime(0, audio.currentTime);
    gain.gain.linearRampToValueAtTime(0.07, audio.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.35);
    oscillator.connect(gain); gain.connect(audio.destination);
    oscillator.start(); oscillator.stop(audio.currentTime + 0.4);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  } catch { /* Banners remain available. */ }
}
// Mounted once for the site, so a tap before opening tracking can unlock audio too.
export function restoreSavedSoundOnInteraction() {
  const unlock = () => {
    if (readAlertPreference('kfc_customer_sound') || readAlertPreference('kfc_rider_sound')) void unlockAlertAudio();
  };
  const events = ['pointerdown', 'touchend', 'keydown'];
  events.forEach(event => window.addEventListener(event, unlock, { passive: true }));
  return () => events.forEach(event => window.removeEventListener(event, unlock));
}
