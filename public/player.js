// Audio player that runs in extension iframe (bypasses page CSP)
// Communicates with content script via postMessage

const audio = document.getElementById('audio');

audio.addEventListener('timeupdate', () => {
  window.parent.postMessage({
    type: 'PLAYER_TIME',
    currentTime: audio.currentTime,
  }, '*');
});

audio.addEventListener('ended', () => {
  window.parent.postMessage({ type: 'PLAYER_ENDED' }, '*');
});

window.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || !msg.type) return;

  switch (msg.type) {
    case 'LOAD_WAV': {
      const blob = new Blob([msg.wavData], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      if (audio.src && audio.src.startsWith('blob:')) {
        URL.revokeObjectURL(audio.src);
      }
      audio.src = url;
      audio.playbackRate = msg.speed || 1;
      audio.play()
        .then(() => window.parent.postMessage({ type: 'PLAYER_PLAYING' }, '*'))
        .catch(() => window.parent.postMessage({ type: 'PLAYER_ERROR' }, '*'));
      break;
    }
    case 'PLAY':
      audio.play()
        .then(() => window.parent.postMessage({ type: 'PLAYER_PLAYING' }, '*'))
        .catch(() => {});
      break;
    case 'PAUSE':
      audio.pause();
      window.parent.postMessage({ type: 'PLAYER_PAUSED' }, '*');
      break;
    case 'SET_SPEED':
      audio.playbackRate = msg.speed;
      break;
    case 'RESTART':
      audio.currentTime = 0;
      audio.play()
        .then(() => window.parent.postMessage({ type: 'PLAYER_PLAYING' }, '*'))
        .catch(() => {});
      break;
    case 'RESET':
      audio.pause();
      if (audio.src && audio.src.startsWith('blob:')) {
        URL.revokeObjectURL(audio.src);
      }
      audio.src = '';
      break;
  }
});

window.parent.postMessage({ type: 'PLAYER_READY' }, '*');
