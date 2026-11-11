const $ = id => document.getElementById(id);
let character = 'Lily';
let session;
let saved = false;
try { saved = localStorage.getItem('character-chat-phrase') === 'saved'; } catch {}

function show(screen) {
  for (const id of ['lobby', 'call', 'recap']) $(id).hidden = id !== screen;
}
function error(message = '') {
  $('error').textContent = message;
  $('error').hidden = !message;
}
async function request(path, data, signal) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal: signal ?? AbortSignal.timeout(6000),
  });
  if (!response.ok) throw Error('The connection to the app was lost. Please try again.');
  return response.json();
}
function active(s) { return session === s && !s.stopped; }
function avatar(id, name, label) {
  $(id).className = 'avatar ' + name.toLowerCase();
  $(id).innerHTML = `<img src="/${name.toLowerCase()}.png" alt=""><span class="character-info"><span><strong>${name}</strong><small>${label}</small></span><span class="wave" aria-hidden="true"><i></i><i></i><i></i></span></span>`;
}
function release(s) {
  s.stopped = true;
  clearTimeout(s.poll);
  clearTimeout(s.connectTimeout);
  clearTimeout(s.disconnectTimeout);
  clearInterval(s.clock);
  clearInterval(s.health);
  cancelAnimationFrame(s.animation);
  s.processed?.getTracks().forEach(track => track.stop());
  s.raw?.getTracks().forEach(track => track.stop());
  s.pc?.close();
  if (s.audio) {
    s.audio.pause();
    s.audio.srcObject = null;
  }
  if (s.context) s.context.close().catch(() => {});
}
function end(s, reason, reward = false, notify = true) {
  if (!active(s)) return;
  release(s);
  if (notify && s.id) request('/leave', { id: s.id, reason }).catch(() => {});
  $('xp').textContent = reward ? '+15 XP · CONVERSATION PRACTICE' : 'READY WHEN YOU ARE';
  $('recap-message').textContent = {
    time: 'Three minutes of showing up. Nice work!',
    left: 'The call has ended. Try another conversation.',
    dropped: 'Connection lost. Your microphone has been released.',
    failed: 'We couldn’t connect this call. Try again.',
  }[reason] ?? 'Your partner left the call.';
  $('recap').querySelector('h2').textContent = reward ? 'Chat complete!' : 'Call ended';
  show('recap');
}
function fail(s, message) {
  if (!active(s)) return;
  end(s, 'failed');
  error(message);
}
function analyser(context, source) {
  const node = context.createAnalyser();
  node.fftSize = 512;
  source.connect(node);
  return node;
}
function animate(s) {
  const values = new Float32Array(512);
  for (const [id, node] of [['self', s.localMeter], ['partner', s.remoteMeter]]) {
    if (!node) continue;
    node.getFloatTimeDomainData(values);
    const rms = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
    $(id).classList.toggle('speaking', rms > .012 && !(id === 'self' && s.muted));
  }
  if (active(s)) s.animation = requestAnimationFrame(() => animate(s));
}
async function prepare(s) {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw Error('Microphone access needs HTTPS. Open the shared HTTPS URL, or use localhost on this computer.');
  }
  s.context = new AudioContext();
  await s.context.resume();
  s.raw = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: false,
  });
  if (!active(s)) return release(s);
  await s.context.audioWorklet.addModule('/voice.js');
  const source = s.context.createMediaStreamSource(s.raw);
  const filter = new AudioWorkletNode(s.context, 'character-voice', {
    numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
    processorOptions: { ratio: character === 'Lily' ? .82 : 1.22 },
  });
  filter.onprocessorerror = () => fail(s, 'Voice filter failed. The microphone is muted and the call has ended.');
  const eq = s.context.createBiquadFilter();
  eq.type = 'highpass';
  eq.frequency.value = 110;
  const compressor = s.context.createDynamicsCompressor();
  const destination = s.context.createMediaStreamDestination();
  source.connect(filter).connect(eq).connect(compressor).connect(destination);
  s.processed = destination.stream;
  s.localMeter = analyser(s.context, compressor);
  s.raw.getTracks().forEach(track => {
    track.onended = () => fail(s, 'Microphone access ended. Re-enable it and try again.');
  });
  s.context.onstatechange = () => {
    if (active(s) && s.context.state !== 'running') {
      fail(s, 'Audio processing paused. The microphone is muted and the call has ended. Keep the app open during your chat.');
    }
  };
  // Require a running processor before joining. Only destination audio is ever sent.
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('Voice filter could not start. Please try again.')), 3000);
    filter.port.onmessage = () => {
      s.lastHeartbeat = performance.now();
      clearTimeout(timeout);
      resolve();
    };
  });
  s.health = setInterval(() => {
    if (performance.now() - s.lastHeartbeat > 2000) {
      fail(s, 'Voice filter stopped. The microphone is muted and the call has ended.');
    }
  }, 500);
}
async function match(s, event) {
  show('call');
  $('timer').textContent = '3:00';
  $('connection').textContent = 'Connecting your character voices…';
  $('role').textContent = event.role === 0
    ? 'You want to hang out on Saturday, but you have to be home by 8 p.m.'
    : 'You know a good night market, but you can only meet after 7 p.m.';
  $('hints').hidden = true;
  $('help').setAttribute('aria-expanded', 'false');
  $('repeat').disabled = true;
  $('reaction').textContent = '';
  $('hear').hidden = true;
  $('mute').textContent = 'Mute mic';
  $('mute').setAttribute('aria-pressed', 'false');
  avatar('self', character, 'You · voice filtered');
  avatar('partner', event.partner, 'Your partner');
  s.pc = new RTCPeerConnection({ iceServers: event.iceServers });
  s.candidates = [];
  s.processed.getTracks().forEach(track => s.pc.addTrack(track, s.processed));
  s.pc.onicecandidate = ({ candidate }) => {
    if (candidate && active(s)) request('/signal', { id: s.id, kind: 'candidate', value: candidate.toJSON() }).catch(() => fail(s, 'Signaling connection lost. Please try again.'));
  };
  s.pc.ontrack = ({ streams }) => {
    if (s.remoteSource) return;
    s.audio = new Audio();
    s.audio.autoplay = true;
    s.audio.setAttribute('playsinline', '');
    s.audio.srcObject = streams[0];
    s.remoteSource = s.context.createMediaStreamSource(streams[0]);
    s.remoteMeter = analyser(s.context, s.remoteSource);
    playPartner(s);
  };
  s.pc.onconnectionstatechange = () => {
    if (!active(s)) return;
    if (s.pc.connectionState === 'connected') {
      clearTimeout(s.disconnectTimeout);
      $('connection').textContent = 'Connected · both voices filtered';
      ready(s);
    }
    if (s.pc.connectionState === 'disconnected') {
      $('connection').textContent = 'Connection interrupted…';
      s.processed.getTracks().forEach(track => { track.enabled = false; });
      clearTimeout(s.disconnectTimeout);
      s.disconnectTimeout = setTimeout(() => fail(s, 'The call connection dropped. Please find a partner again.'), 6000);
    }
    if (s.pc.connectionState === 'connected') {
      s.processed.getTracks().forEach(track => { track.enabled = !s.muted; });
    }
    if (s.pc.connectionState === 'failed') fail(s, 'The call could not connect. Check your network or TURN server setup.');
  };
  s.connectTimeout = setTimeout(() => fail(s, 'The call timed out. Try the same Wi-Fi network or configure TURN using the README.'), 30000);
  animate(s);
  if (event.initiator) {
    await s.pc.setLocalDescription(await s.pc.createOffer());
    await request('/signal', { id: s.id, kind: 'description', value: s.pc.localDescription });
  }
}
function ready(s) {
  if (!active(s) || s.ready || !s.playing || s.pc.connectionState !== 'connected') return;
  s.ready = true;
  request('/ready', { id: s.id }).catch(() => fail(s, 'Unable to start the shared timer. Please try again.'));
}
async function playPartner(s) {
  try {
    await s.audio.play();
    if (!active(s)) return;
    s.playing = true;
    $('hear').hidden = true;
    ready(s);
  } catch {
    if (active(s)) {
      $('hear').hidden = false;
      $('connection').textContent = 'Tap Hear your partner to enable call audio.';
    }
  }
}
async function event(s, item, offset) {
  if (item.type === 'match') return match(s, item);
  if (item.type === 'description') {
    await s.pc.setRemoteDescription(item.value);
    for (const candidate of s.candidates.splice(0)) await s.pc.addIceCandidate(candidate);
    if (item.value.type === 'offer') {
      await s.pc.setLocalDescription(await s.pc.createAnswer());
      await request('/signal', { id: s.id, kind: 'description', value: s.pc.localDescription });
    }
  }
  if (item.type === 'candidate') {
    if (s.pc.remoteDescription) await s.pc.addIceCandidate(item.value);
    else s.candidates.push(item.value);
  }
  if (item.type === 'start') {
    clearTimeout(s.connectTimeout);
    $('repeat').disabled = false;
    s.endsAt = item.endsAt;
    s.offset = offset;
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((s.endsAt - Date.now() - s.offset) / 1000));
      $('timer').textContent = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
      if (seconds === 0) end(s, 'time', true);
    };
    tick();
    s.clock = setInterval(tick, 200);
  }
  if (item.type === 'repeat') $('reaction').textContent = '↺ Your partner asks — could you say that again?';
  if (item.type === 'end') end(s, item.reason, item.reward, false);
}
async function poll(s) {
  try {
    const before = Date.now();
    const response = await request('/poll', { id: s.id });
    const offset = response.now - (before + Date.now()) / 2;
    for (const item of response.events) {
      if (!active(s)) return;
      await event(s, item, offset);
    }
    if (active(s)) s.poll = setTimeout(() => poll(s), 300);
  } catch (cause) { fail(s, cause.message); }
}
async function find() {
  if (session && active(session)) return;
  error();
  show('lobby');
  $('find').disabled = true;
  $('find').textContent = 'Preparing your voice…';
  document.querySelectorAll('[data-character]').forEach(button => { button.disabled = true; });
  const s = { stopped: false, muted: false };
  session = s;
  try {
    await prepare(s);
    if (!active(s)) return;
    const result = await request('/join', { character });
    s.id = result.id;
    if (!active(s)) { request('/leave', { id: s.id }).catch(() => {}); return; }
    $('queue').textContent = 'Waiting for a partner…';
    $('find').textContent = 'Finding your conversation partner…';
    $('cancel').hidden = false;
    poll(s);
  } catch (cause) {
    if (!active(s)) return;
    release(s);
    const messages = {
      NotAllowedError: 'Microphone permission was denied. Allow microphone access in your browser’s site settings, then try again.',
      NotFoundError: 'No microphone found. Connect a microphone and try again.',
      NotReadableError: 'The microphone is busy or unavailable. Close other apps using it and try again.',
    };
    error(messages[cause.name] ?? cause.message);
    resetLobby();
  }
}
function resetLobby() {
  $('find').disabled = false;
  $('find').innerHTML = 'Find a partner <span aria-hidden="true">→</span>';
  $('cancel').hidden = true;
  $('queue').textContent = '';
  document.querySelectorAll('[data-character]').forEach(button => { button.disabled = false; });
}
document.querySelectorAll('[data-character]').forEach(button => {
  button.onclick = () => {
    character = button.dataset.character;
    document.querySelectorAll('[data-character]').forEach(option => option.setAttribute('aria-pressed', String(option === button)));
  };
});
$('find').onclick = find;
$('hear').onclick = () => playPartner(session);
$('again').onclick = () => { resetLobby(); find(); };
$('change').onclick = () => { resetLobby(); error(); show('lobby'); };
$('cancel').onclick = () => {
  const s = session;
  release(s);
  if (s.id) request('/leave', { id: s.id }).catch(() => {});
  resetLobby();
};
$('leave').onclick = () => end(session, 'left', Boolean(session.endsAt));
$('mute').onclick = () => {
  const s = session;
  s.muted = !s.muted;
  s.processed.getTracks().forEach(track => { track.enabled = !s.muted; });
  $('mute').textContent = s.muted ? 'Unmute mic' : 'Mute mic';
  $('mute').setAttribute('aria-pressed', String(s.muted));
};
$('help').onclick = () => {
  $('hints').hidden = !$('hints').hidden;
  $('help').setAttribute('aria-expanded', String(!$('hints').hidden));
};
$('repeat').onclick = async () => {
  const s = session;
  try {
    await request('/repeat', { id: s.id });
    if (active(s)) $('reaction').textContent = '↺ Request sent. Give your partner a moment.';
  } catch { fail(s, 'The request could not be sent. Please reconnect.'); }
};
function saveLabel() {
  $('save').textContent = saved ? '✓ Saved on this device' : 'Save phrase';
  $('save').setAttribute('aria-pressed', String(saved));
}
$('save').onclick = () => {
  try { localStorage.setItem('character-chat-phrase', 'saved'); saved = true; saveLabel(); }
  catch { error('Saving is blocked by this browser. You can still copy the phrase.'); }
};
saveLabel();
window.addEventListener('pagehide', () => {
  const s = session;
  if (s && active(s)) {
    release(s);
    if (s.id) navigator.sendBeacon('/leave', new Blob([JSON.stringify({ id: s.id })], { type: 'application/json' }));
  }
});
