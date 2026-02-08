// Audio player that runs in extension iframe (bypasses page CSP)
// Communicates with content script via postMessage

const audio = document.getElementById('audio');

// Track the parent origin for secure postMessage targeting.
// Learned from the first message received from the content script.
let parentOrigin = null;

function postToParent(msg) {
  if (!parentOrigin) { return; }
  window.parent.postMessage(msg, parentOrigin);
}

audio.addEventListener('timeupdate', () => {
  postToParent({
    type: 'PLAYER_TIME',
    currentTime: audio.currentTime,
  });
});

audio.addEventListener('ended', () => {
  postToParent({ type: 'PLAYER_ENDED' });
});

window.addEventListener('message', (event) => {
  // Only accept messages from our parent window
  if (event.source !== window.parent) { return; }

  // Learn the parent origin from the first message, then enforce it
  if (!parentOrigin) {
    parentOrigin = event.origin;
  } else if (event.origin !== parentOrigin) {
    return;
  }

  const msg = event.data;
  if (!msg || !msg.type) { return; }

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
        .then(() => postToParent({ type: 'PLAYER_PLAYING' }))
        .catch(() => postToParent({ type: 'PLAYER_ERROR' }));
      break;
    }
    case 'PLAY':
      audio.play()
        .then(() => postToParent({ type: 'PLAYER_PLAYING' }))
        .catch(() => {});
      break;
    case 'PAUSE':
      audio.pause();
      postToParent({ type: 'PLAYER_PAUSED' });
      break;
    case 'SET_SPEED':
      audio.playbackRate = msg.speed;
      break;
    case 'RESTART':
      audio.currentTime = 0;
      audio.play()
        .then(() => postToParent({ type: 'PLAYER_PLAYING' }))
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

// PLAYER_READY must use '*' because we don't yet know the parent origin.
// This is safe: the message contains no sensitive data, and subsequent
// communication is locked to the origin of the first received message.
window.parent.postMessage({ type: 'PLAYER_READY' }, '*');
