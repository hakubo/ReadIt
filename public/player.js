// Audio player that runs in extension iframe (bypasses page CSP)
// Communicates with content script via postMessage
//
// Double-buffered: while one <audio> element plays the current sentence, the
// other holds the next sentence, already loaded (PRELOAD_WAV). When the content
// script asks for that sentence (LOAD_WAV with the same index), we swap
// elements and play immediately instead of loading and decoding a new blob.

const players = [document.getElementById('audio-a'), document.getElementById('audio-b')];
let activeSlot = 0;
// Sentence index currently loaded in the inactive element, or null
let preloadedIndex = null;
// True from LOAD_WAV until its play() settles. The element is being swapped or
// re-sourced then, so its pause/play events don't reflect what the user did.
let isLoadingSentence = false;

// Track the parent origin for secure postMessage targeting.
// Learned from the first message received from the content script.
let parentOrigin = null;

function postToParent(msg) {
  if (!parentOrigin) { return; }
  window.parent.postMessage(msg, parentOrigin);
}

function activeAudio() {
  return players[activeSlot];
}

function inactiveAudio() {
  return players[1 - activeSlot];
}

function setSource(audio, wavData) {
  if (audio.src && audio.src.startsWith('blob:')) {
    URL.revokeObjectURL(audio.src);
  }
  const blob = new Blob([wavData], { type: 'audio/wav' });
  audio.src = URL.createObjectURL(blob);
}

function clearSource(audio) {
  audio.pause();
  if (audio.src && audio.src.startsWith('blob:')) {
    URL.revokeObjectURL(audio.src);
  }
  audio.removeAttribute('src');
  audio.load();
}

function playActive() {
  isLoadingSentence = true;
  activeAudio().play()
    .then(() => postToParent({ type: 'PLAYER_PLAYING' }))
    .catch(() => postToParent({ type: 'PLAYER_ERROR' }))
    .finally(() => { isLoadingSentence = false; });
}

// Should this element's play/pause event be reported to the content script?
// Lets OS media keys and Chrome's media controls (which call play()/pause() on
// the element directly) keep the floating player in sync.
function shouldForwardPlayStateEvent(audio, eventType) {
  if (audio !== activeAudio() || isLoadingSentence) { return false; }
  if (!audio.getAttribute('src')) { return false; } // cleared by RESET
  // Reaching the end fires 'pause' before 'ended'; that's not a user pause and
  // the next sentence starts right after.
  if (eventType === 'pause' && audio.ended) { return false; }
  return true;
}

// Only the active element reports progress; the preloaded one is silent.
for (const audio of players) {
  audio.addEventListener('play', () => {
    if (!shouldForwardPlayStateEvent(audio, 'play')) { return; }
    postToParent({ type: 'PLAYER_PLAYING' });
  });
  audio.addEventListener('pause', () => {
    if (!shouldForwardPlayStateEvent(audio, 'pause')) { return; }
    postToParent({ type: 'PLAYER_PAUSED' });
  });
  audio.addEventListener('timeupdate', () => {
    if (audio !== activeAudio()) { return; }
    postToParent({ type: 'PLAYER_TIME', currentTime: audio.currentTime });
  });
  audio.addEventListener('ended', () => {
    if (audio !== activeAudio()) { return; }
    postToParent({ type: 'PLAYER_ENDED' });
  });
}

function loadSentence(msg) {
  const isPreloaded = msg.index !== undefined && msg.index === preloadedIndex;
  if (isPreloaded) {
    activeAudio().pause();
    activeSlot = 1 - activeSlot;
    preloadedIndex = null;
  } else {
    setSource(activeAudio(), msg.wavData);
  }
  const audio = activeAudio();
  audio.currentTime = 0;
  audio.playbackRate = msg.speed || 1;
  playActive();
}

function preloadSentence(msg) {
  if (msg.index === preloadedIndex) { return; }
  const audio = inactiveAudio();
  setSource(audio, msg.wavData);
  audio.preload = 'auto';
  audio.load(); // start fetching + decoding the blob now
  preloadedIndex = msg.index;
}

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
    case 'LOAD_WAV':
      loadSentence(msg);
      break;
    case 'PRELOAD_WAV':
      preloadSentence(msg);
      break;
    case 'PLAY':
      activeAudio().play()
        .then(() => postToParent({ type: 'PLAYER_PLAYING' }))
        .catch(() => postToParent({ type: 'PLAYER_PAUSED' }));
      break;
    case 'PAUSE':
      activeAudio().pause();
      postToParent({ type: 'PLAYER_PAUSED' });
      break;
    case 'SET_SPEED':
      activeAudio().playbackRate = msg.speed;
      break;
    case 'RESTART':
      activeAudio().currentTime = 0;
      activeAudio().play()
        .then(() => postToParent({ type: 'PLAYER_PLAYING' }))
        .catch(() => postToParent({ type: 'PLAYER_PAUSED' }));
      break;
    case 'RESET':
      players.forEach(clearSource);
      preloadedIndex = null;
      break;
  }
});

// PLAYER_READY must use '*' because we don't yet know the parent origin.
// This is safe: the message contains no sensitive data, and subsequent
// communication is locked to the origin of the first received message.
window.parent.postMessage({ type: 'PLAYER_READY' }, '*');
