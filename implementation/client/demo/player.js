'use strict';
const video = document.getElementById('demo-video');
const start = document.getElementById('start-button');
const speed = document.getElementById('playback-speed');
const error = document.getElementById('player-error');
start.hidden = false;
speed.disabled = false;

start.addEventListener('click', async () => {
  start.disabled = true;
  try {
    await video.play();
    video.focus();
  } catch {
    error.hidden = false;
  } finally {
    start.disabled = false;
  }
});
video.addEventListener('play', () => { start.hidden = true; error.hidden = true; });
video.addEventListener('ended', () => { start.hidden = false; start.setAttribute('aria-label', 'Смотреть ещё раз'); });
video.addEventListener('error', () => { start.hidden = true; error.hidden = false; });
speed.addEventListener('change', () => { video.playbackRate = Number(speed.value); });
video.addEventListener('ratechange', () => { speed.value = String(video.playbackRate); });
