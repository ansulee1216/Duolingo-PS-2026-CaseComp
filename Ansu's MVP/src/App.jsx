import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Mic,
  MicOff,
  PhoneOff,
  ShieldCheck,
  ShieldAlert,
  SkipForward,
  Flame,
  Gem,
  Heart,
  Home,
  Shield,
  User,
  Users,
  Sparkles,
  Keyboard,
  Send,
  ChevronRight,
  EyeOff,
  Eye,
  Play,
  X,
  Signal,
  Wifi,
  BatteryFull,
  Lock,
  Check,
  Flag,
  ThumbsUp,
  ThumbsDown,
  Clock,
  MessageCircle,
  Bot,
  AudioLines,
  Star,
  BookOpen,
  Video
} from 'lucide-react';

/* ==========================================================================
   DUOLINGO CONNECT — PROTOTYPE
   Tap Connect → choose Lily (AI) or a real learner → your avatar speaks for
   you. Face is hidden by default; real vs. synthetic voice is the user's call.
   ========================================================================== */

// --- Design tokens (Duolingo palette names) ---------------------------------
const C = {
  feather: '#58CC02',
  featherDark: '#58A700',
  mask: '#89E219',
  seaSponge: '#D7FFB8',
  macaw: '#1CB0F6',
  macawDark: '#1899D6',
  iguana: '#DDF4FF',
  blueJay: '#84D8FF',
  humpback: '#2B70C9',
  cardinal: '#FF4B4B',
  cardinalDark: '#EA2B2B',
  bee: '#FFC800',
  beeDark: '#E5B400',
  fox: '#FF9600',
  beetle: '#CE82FF',
  beetleDark: '#A568CC',
  eel: '#4B4B4B',
  wolf: '#777777',
  hare: '#AFAFAF',
  swan: '#E5E5E5',
  polar: '#F7F7F7',
  night: '#131F24',
  nightCard: '#202F36',
  nightBorder: '#37464F'
};

const PHONE_W = 390;
const PHONE_H = 844;

// --- Sound effects (one shared AudioContext) --------------------------------
let sharedAudioCtx = null;
const getAudioCtx = () => {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx) sharedAudioCtx = new AudioCtx();
  if (sharedAudioCtx.state === 'suspended') sharedAudioCtx.resume();
  return sharedAudioCtx;
};

const TONES = {
  pop: [{ f: [520, 880], t: 0, d: 0.07, type: 'sine', g: 0.12 }],
  ring: [
    { f: [660, 880], t: 0, d: 0.2, type: 'triangle', g: 0.12 },
    { f: [660, 880], t: 0.25, d: 0.2, type: 'triangle', g: 0.12 }
  ],
  connect: [523.25, 659.25, 783.99].map((f, i) => ({ f: [f], t: i * 0.08, d: 0.25, type: 'triangle', g: 0.14 })),
  match: [523.25, 659.25, 783.99, 1046.5].map((f, i) => ({ f: [f], t: i * 0.07, d: 0.3, type: 'triangle', g: 0.13 })),
  block: [310, 230].map((f, i) => ({ f: [f], t: i * 0.11, d: 0.18, type: 'sawtooth', g: 0.1 })),
  hangup: [480, 340].map((f, i) => ({ f: [f], t: i * 0.09, d: 0.16, type: 'sine', g: 0.14 }))
};

const playDuoSound = (type) => {
  try {
    const ctx = getAudioCtx();
    if (!ctx || !TONES[type]) return;
    const now = ctx.currentTime;
    TONES[type].forEach(({ f, t, d, type: wave, g }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = wave;
      osc.frequency.setValueAtTime(f[0], now + t);
      if (f[1]) osc.frequency.exponentialRampToValueAtTime(f[1], now + t + d * 0.6);
      gain.gain.setValueAtTime(g, now + t);
      gain.gain.exponentialRampToValueAtTime(0.001, now + t + d);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + d + 0.02);
    });
  } catch (e) {
    // Autoplay restrictions — ignore
  }
};

// --- Text-to-speech that resolves when the line finishes --------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isCJK = (s) => /[぀-ヿ㐀-鿿]/.test(s);

const speakLine = (text, { lang, pitch = 1, rate = 1 }) =>
  new Promise((resolve) => {
    const clean = text.replace(/\([^)]*\)/g, '').replace(/["“”]/g, '').trim();
    const estimate = Math.min(9000, Math.max(1400, clean.length * (isCJK(clean) ? 190 : 62)));
    const minMs = Math.min(estimate, 1600);
    const started = Date.now();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      const remaining = minMs - (Date.now() - started);
      setTimeout(resolve, Math.max(0, remaining));
    };
    try {
      if (!('speechSynthesis' in window)) throw new Error('no tts');
      const synth = window.speechSynthesis;
      synth.cancel();
      const utter = new SpeechSynthesisUtterance(clean);
      utter.lang = lang;
      utter.pitch = pitch;
      utter.rate = rate;
      const voices = synth.getVoices();
      const voice =
        voices.find((v) => v.lang && v.lang.replace('_', '-').toLowerCase() === lang.toLowerCase()) ||
        voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
      if (voice) utter.voice = voice;
      utter.onend = finish;
      utter.onerror = finish;
      synth.speak(utter);
      setTimeout(finish, estimate + 2500); // safety net if onend never fires
    } catch (e) {
      setTimeout(finish, estimate);
    }
  });

const stopSpeech = () => {
  try {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  } catch (e) {}
};

// Split "main text (romanization / translation)" into two display lines
const splitSub = (text) => {
  const m = text.match(/^([\s\S]*?)\s*\(([^)]*)\)\s*$/);
  return m ? { main: m[1], sub: m[2] } : { main: text, sub: null };
};

// --- Duo Guardian: real-time personal-info detection ------------------------
const PII_PATTERNS = [
  { label: 'phone number', re: /\+?\d[\d\s().-]{7,}\d/g },
  { label: 'email', re: /[\w.+-]+@[\w-]+\.[\w.]+/g },
  { label: 'social handle', re: /@[\w.]{2,}/g },
  { label: 'address', re: /\b\d{1,5}\s+[A-Za-z]+(?:\s[A-Za-z]+)*\s(?:st|street|ave|avenue|rd|road|blvd|lane|ln|dr|drive)\b/gi },
  { label: 'address', re: /(?:my address is|i live at)\s+[^.,!?]+/gi }
];

const redactPII = (text) => {
  const ranges = [];
  PII_PATTERNS.forEach(({ label, re }) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const start = m.index;
      const end = start + m[0].length;
      if (!ranges.some((r) => start < r.end && end > r.start)) ranges.push({ start, end, label });
    }
  });
  if (!ranges.length) return null;
  ranges.sort((a, b) => a.start - b.start);
  const segments = [];
  let cursor = 0;
  ranges.forEach((r) => {
    if (r.start > cursor) segments.push(text.slice(cursor, r.start));
    segments.push({ redacted: r.label });
    cursor = r.end;
  });
  if (cursor < text.length) segments.push(text.slice(cursor));
  return { segments, count: ranges.length };
};

// --- Synthetic voice options -------------------------------------------------
const SYNTH_VOICES = [
  { id: 'bright', label: 'Bright', pitch: 1.4, rate: 1.03 },
  { id: 'warm', label: 'Warm', pitch: 1.0, rate: 0.97 },
  { id: 'deep', label: 'Deep', pitch: 0.55, rate: 0.92 }
];

/* ==========================================================================
   CHARACTER ART (from the original MVP — swap for official design-system
   assets before anything ships)
   ========================================================================== */
const LilyAvatarSVG = ({ isSpeaking = false, isEyeRolling = false, isCardIcon = false }) => {
  const viewBox = isCardIcon ? '18 14 164 176' : '0 0 200 280';

  return (
    <svg className="w-full h-full select-none" viewBox={viewBox} fill="none">
      <rect x="0" y="0" width="200" height="280" fill="#E6DEFF" />
      <g className={isSpeaking ? 'duo-talk' : ''}>
        <path d="M 44 82 C 44 16, 156 16, 156 82 L 172 175 L 25 175 Z" fill="#9B6DFF" />
        <rect x="78" y="218" width="33" height="58" fill="#9B6DFF" />
        <rect x="79" y="144" width="32" height="32" fill="#4A306D" />
        <path d="M 79 167 L 111 167 L 138 208 Q 144 222 128 222 L 62 222 Q 46 222 52 208 Z" fill="#4A306D" />
        <path d="M 67 204 C 71 196, 80 196, 83 200 L 76 208 C 70 208, 66 206, 67 204 Z" fill="#F9C4AC" />
        <path d="M 103 196 C 112 193, 121 199, 120 206 C 118 210, 111 208, 108 202 Z" fill="#F9C4AC" />
        <path d="M 55 212 Q 95 202 133 212" stroke="#3B235A" strokeWidth="5" strokeLinecap="round" fill="none" />
        <path d="M 68 206 L 118 208" stroke="#3B235A" strokeWidth="4" strokeLinecap="round" fill="none" />
        <circle cx="155" cy="112" r="12" fill="#F9C4AC" />
        <path d="M 73 56 L 146 56 L 146 119 C 146 136, 134 146, 115 146 L 73 146 Z" fill="#F9C4AC" />
        <rect x="68" y="84" width="27" height="32" rx="13.5" fill="#FFFFFF" />
        <circle
          cx={isEyeRolling ? '85' : '83'}
          cy={isEyeRolling ? '97' : '101'}
          r="7.5"
          fill="#3D314A"
          style={{ transition: 'all 0.25s ease' }}
        />
        <path d="M 68 97 C 68 86, 95 86, 95 97 L 95 101 L 68 101 Z" fill="#9B6DFF" />
        <rect x="99" y="84" width="32" height="32" rx="16" fill="#FFFFFF" />
        <circle
          cx={isEyeRolling ? '116' : '113'}
          cy={isEyeRolling ? '97' : '101'}
          r="7.5"
          fill="#3D314A"
          style={{ transition: 'all 0.25s ease' }}
        />
        <path d="M 99 97 C 99 84, 131 84, 131 97 L 131 101 L 99 101 Z" fill="#9B6DFF" />
        <path d="M 97 109 C 91 116, 90 125, 97 125 C 104 125, 103 116, 97 109 Z" fill="#E08A70" />
        {isSpeaking ? (
          <ellipse cx="115" cy="132" rx="7.5" ry="5.5" fill="#4A306D">
            <animate attributeName="ry" values="1.8;6.5;2.2;5.8;1.8" dur="0.24s" repeatCount="indefinite" />
          </ellipse>
        ) : (
          <path d="M 108 136 Q 118 125 123 130" stroke="#E08A70" strokeWidth="4.5" strokeLinecap="round" fill="none" />
        )}
        <path d="M 75 50 C 78 74, 112 87, 154 87 L 154 45 L 75 45 Z" fill="#9B6DFF" />
        <path d="M 75 52 C 84 74, 114 86, 148 86" stroke="#8556E8" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <path d="M 44 65 C 44 35, 76 35, 75 52 L 75 175 L 25 175 Z" fill="#A575FF" />
      </g>
    </svg>
  );
};

const AVATAR_BG = ['#FDF0A6', '#D7FFB8', '#DDF4FF'];

const PeerAvatarSVG = ({ preset = 0, isSpeaking = false, viewBox }) => {
  const vb = viewBox || '0 0 280 320';
  const par = viewBox ? 'xMidYMid slice' : 'xMidYMid meet';
  const mouth = (cx, cy, fill) =>
    isSpeaking ? (
      <ellipse cx={cx} cy={cy} rx="9" ry="11" fill={fill}>
        <animate attributeName="ry" values="4;12;5;11;4" dur="0.22s" repeatCount="indefinite" />
      </ellipse>
    ) : (
      <circle cx={cx} cy={cy} r="8" fill={fill} />
    );

  if (preset === 0) {
    return (
      <svg className="w-full h-full select-none" viewBox={vb} preserveAspectRatio={par} fill="none">
        <rect width="280" height="320" fill="#FDF0A6" />
        <g className={isSpeaking ? 'duo-talk' : ''}>
          <g fill="#333333">
            <circle cx="140" cy="70" r="46" />
            <circle cx="95" cy="84" r="42" />
            <circle cx="185" cy="84" r="42" />
            <circle cx="68" cy="126" r="39" />
            <circle cx="212" cy="126" r="39" />
            <circle cx="64" cy="174" r="36" />
            <circle cx="216" cy="174" r="36" />
            <circle cx="84" cy="212" r="30" />
            <circle cx="196" cy="212" r="30" />
            <circle cx="140" cy="135" r="72" />
          </g>
          <path d="M72 320 L92 240 Q140 234 188 240 L208 320 Z" fill="#EFEFEF" />
          <rect x="98" y="216" width="84" height="32" rx="10" fill="#EFEFEF" />
          <circle cx="76" cy="166" r="18" fill="#D5906C" />
          <circle cx="204" cy="166" r="18" fill="#D5906C" />
          <circle cx="77" cy="187" r="17" stroke="#F7EDE2" strokeWidth="6" fill="none" />
          <circle cx="203" cy="187" r="17" stroke="#F7EDE2" strokeWidth="6" fill="none" />
          <rect x="82" y="106" width="116" height="120" rx="34" fill="#D5906C" />
          <rect x="108" y="130" width="29" height="41" rx="14.5" fill="#FFFFFF" />
          <rect x="143" y="130" width="29" height="41" rx="14.5" fill="#FFFFFF" />
          <rect x="118" y="140" width="14" height="24" rx="7" fill="#1E78D6" />
          <circle cx="117" cy="149" r="5" fill="#FFFFFF" />
          <rect x="153" y="140" width="14" height="24" rx="7" fill="#1E78D6" />
          <circle cx="152" cy="149" r="5" fill="#FFFFFF" />
          <path d="M140 163 C135 172, 131 183, 140 183 C149 183, 145 172, 140 163 Z" fill="#8F5136" />
          {mouth(152, 197, '#6E261E')}
          <path d="M154 210 Q165 209 167 197" stroke="#B87352" strokeWidth="4" strokeLinecap="round" fill="none" />
        </g>
      </svg>
    );
  }

  if (preset === 1) {
    return (
      <svg className="w-full h-full select-none" viewBox={vb} preserveAspectRatio={par} fill="none">
        <rect width="280" height="320" fill="#D7FFB8" />
        <g className={isSpeaking ? 'duo-talk' : ''}>
          <path d="M64 320 L84 242 Q140 234 196 242 L216 320 Z" fill="#1CB0F6" />
          <rect x="94" y="218" width="92" height="30" rx="14" fill="#1899D6" />
          <circle cx="76" cy="166" r="18" fill="#F3C19D" />
          <circle cx="204" cy="166" r="18" fill="#F3C19D" />
          <rect x="82" y="108" width="116" height="118" rx="34" fill="#F3C19D" />
          <path d="M78 132 C78 72, 202 72, 202 132 L198 116 L82 116 Z" fill="#FF4B4B" />
          <rect x="74" y="96" width="132" height="26" rx="13" fill="#EA2B2B" />
          <circle cx="140" cy="68" r="16" fill="#FF4B4B" />
          <rect x="108" y="132" width="28" height="40" rx="14" fill="#FFFFFF" />
          <rect x="144" y="132" width="28" height="40" rx="14" fill="#FFFFFF" />
          <rect x="118" y="142" width="13" height="23" rx="6.5" fill="#58CC02" />
          <circle cx="117" cy="151" r="4.5" fill="#FFFFFF" />
          <rect x="154" y="142" width="13" height="23" rx="6.5" fill="#58CC02" />
          <circle cx="153" cy="151" r="4.5" fill="#FFFFFF" />
          <circle cx="122" cy="152" r="22" stroke="#333333" strokeWidth="5" fill="none" />
          <circle cx="158" cy="152" r="22" stroke="#333333" strokeWidth="5" fill="none" />
          <line x1="144" y1="152" x2="136" y2="152" stroke="#333333" strokeWidth="5" />
          <path d="M140 164 C135 173, 131 184, 140 184 C149 184, 145 173, 140 164 Z" fill="#C68B63" />
          {mouth(148, 198, '#6E261E')}
          <path d="M150 210 Q161 209 163 198" stroke="#C68B63" strokeWidth="4" strokeLinecap="round" fill="none" />
        </g>
      </svg>
    );
  }

  return (
    <svg className="w-full h-full select-none" viewBox={vb} preserveAspectRatio={par} fill="none">
      <rect width="280" height="320" fill="#DDF4FF" />
      <g className={isSpeaking ? 'duo-talk' : ''}>
        <path d="M68 320 L88 242 Q140 234 192 242 L212 320 Z" fill="#FFC800" />
        <rect x="98" y="218" width="84" height="30" rx="12" fill="#E5A400" />
        <circle cx="76" cy="166" r="18" fill="#B9764F" />
        <circle cx="204" cy="166" r="18" fill="#B9764F" />
        <rect x="82" y="108" width="116" height="118" rx="34" fill="#B9764F" />
        <path d="M74 128 C70 68, 210 68, 206 128 C180 102, 110 102, 74 128 Z" fill="#222222" />
        <circle cx="115" cy="86" r="24" fill="#222222" />
        <circle cx="160" cy="84" r="26" fill="#222222" />
        <rect x="108" y="132" width="28" height="40" rx="14" fill="#FFFFFF" />
        <rect x="144" y="132" width="28" height="40" rx="14" fill="#FFFFFF" />
        <rect x="118" y="142" width="13" height="23" rx="6.5" fill="#3B2314" />
        <circle cx="117" cy="151" r="4.5" fill="#FFFFFF" />
        <rect x="154" y="142" width="13" height="23" rx="6.5" fill="#3B2314" />
        <circle cx="153" cy="151" r="4.5" fill="#FFFFFF" />
        <path d="M140 163 C135 172, 131 183, 140 183 C149 183, 145 172, 140 163 Z" fill="#7A4528" />
        {mouth(150, 197, '#4A1812')}
        <path d="M152 210 Q163 209 165 197" stroke="#8A5232" strokeWidth="4" strokeLinecap="round" fill="none" />
      </g>
    </svg>
  );
};

/* ==========================================================================
   CONVERSATION CONTENT
   ========================================================================== */
const COURSES = [
  {
    code: 'ES',
    name: 'Spanish',
    flag: '🇪🇸',
    speechLang: 'es-ES',
    voicePreview: '¡Hola! Encantado de conocerte.',
    guardDemo: '¡Escríbeme al 310-555-0142 o búscame en Insta, @alex.mad!',
    lilyGreeting:
      "Ugh, hi. Skip the textbook grammar — how would you actually ask for iced coffee in Madrid without sounding like a robot?",
    lilyTopics: [
      {
        label: 'Order like a local',
        userSay: '¡Buenas! Me pones un café con hielo porfa, que hace un calorazo.',
        reply: 'Wait… "me pones" and "porfa"? Okay, I\'m mildly impressed. You actually sound like you live in Malasaña.',
        tip: '"Me pones…" + "porfa" sounds natural; "Quisiera un café" sounds stiff.'
      },
      {
        label: 'Weekend plans',
        userSay: '¿Qué plan hay para este finde, Lily? ¿Salimos de tapeo?',
        reply: 'I was planning to stare at my ceiling and listen to indie rock, but tapas sound tolerable. Good use of "finde".',
        tip: '"Finde" = fin de semana (weekend).'
      },
      {
        label: 'Compliment her sweater',
        userSay: 'Me flipa tu suéter morado, te queda genial.',
        reply: 'Obviously. I wear it every single day. "Me flipa" gets you bonus street cred, though.',
        tip: '"Me flipa" = I love it.'
      }
    ],
    peers: [
      {
        name: 'Maya',
        country: '🇪🇸 Spain',
        level: 'Native speaker',
        preset: 0,
        voice: { pitch: 1.15, rate: 1.0 },
        greeting: '¡Hola! Qué ilusión hablar con alguien en vivo. ¿Qué tal va tu día?',
        topics: [
          {
            label: 'How your day is going',
            userSay: '¡Hola Maya! Todo súper bien, con muchas ganas de practicar.',
            reply: '¡Qué guay! Se te entiende clarísimo. Aquí en Madrid decimos "en plan" y "mola mazo" todo el tiempo.',
            tip: '"Mola mazo" = it\'s really cool (Spain).'
          },
          {
            label: 'Ask about music',
            userSay: '¡Me encanta tu avatar! ¿Qué música escuchas normalmente?',
            reply: '¡Jaja, gracias! Escucho mucho a Rosalía y C. Tangana. ¿Y tú qué sueles escuchar?'
          },
          {
            label: 'Favorite food',
            userSay: '¿Cuál es tu plato favorito para comer con amigos?',
            reply: 'Sin duda unas bravas y tortilla española en una terraza. ¡Cuando vengas te invito!'
          }
        ]
      },
      {
        name: 'Mateo',
        country: '🇲🇽 Mexico',
        level: 'Native speaker',
        preset: 1,
        voice: { pitch: 0.9, rate: 1.02 },
        greeting: '¡Qué onda! Estoy en mi descanso. ¿Practicamos un poco de slang mexicano?',
        topics: [
          {
            label: 'Taco recommendations',
            userSay: '¡Qué onda, Mateo! ¿Cuáles son los mejores tacos de tu ciudad?',
            reply: '¡No manches, los de pastor en la noche están buenísimos! Tu pronunciación suena súper natural.',
            tip: '"No manches" = no way! (Mexico).'
          },
          {
            label: 'Concerts',
            userSay: '¡Está padrísimo tu gorro! ¿Has ido a algún concierto últimamente?',
            reply: '¡Qué chido que dijiste "padrísimo"! Fui al Vive Latino el mes pasado, estuvo increíble.',
            tip: '"Padrísimo" / "chido" = awesome (Mexico).'
          }
        ]
      },
      {
        name: 'Diego',
        country: '🇦🇷 Argentina',
        level: 'Native speaker',
        preset: 2,
        voice: { pitch: 0.8, rate: 1.0 },
        greeting: '¡Che, qué tal! Qué copado conectar en vivo. ¿De dónde sos?',
        topics: [
          {
            label: 'Argentine slang',
            userSay: '¡Hola Diego! Siempre escucho "che" y "copado". ¿Qué más dicen allá?',
            reply: '¡Jaja, re bien! Decimos "re" para todo y "un montón". ¡Te sale bárbaro el acento!',
            tip: '"Re" = very (Argentina) — "re bien", "re lindo".'
          },
          {
            label: 'Football',
            userSay: '¿Cómo se vive el fútbol allá en Buenos Aires?',
            reply: 'Es una locura total, los domingos se para todo el país. ¡Sigamos charlando!'
          }
        ]
      }
    ]
  },
  {
    code: 'JA',
    name: 'Japanese',
    flag: '🇯🇵',
    speechLang: 'ja-JP',
    voicePreview: 'はじめまして！よろしくね。',
    guardDemo: 'インスタ @alex_tokyo をフォローしてね！電話は 090-1234-5678 だよ。',
    lilyGreeting:
      "Yahho. Textbooks make everyone sound like a 19th-century samurai. Show me you can chat casually in Tokyo.",
    lilyTopics: [
      {
        label: 'Quick konbini run',
        userSay: 'ちょっとコンビニ行ってくるね！何かいる？ (Chotto konbini itte kuru ne! Nani ka iru?)',
        reply: 'Ooh, dropping particles naturally. Grab me a melonpan. Your pitch accent on "konbini" was spot on.',
        tip: 'Dropping は/を in casual speech sounds much more natural.'
      },
      {
        label: 'React with "maji de?"',
        userSay: 'えっ、マジで？それめっちゃヤバいね！ (E, maji de? Sore meccha yabai ne!)',
        reply: '"Maji de" and "meccha yabai"… congratulations, you officially speak fluent Harajuku teenager.',
        tip: '"めっちゃヤバい" = super crazy / amazing, depending on tone.'
      }
    ],
    peers: [
      {
        name: 'Kenji',
        country: '🇯🇵 Japan',
        level: 'Native speaker',
        preset: 1,
        voice: { pitch: 0.9, rate: 1.0 },
        greeting: 'ヤッホー！ライブで話せて嬉しいよ。最近どう？ (Yahho! Great to talk live. How have you been?)',
        topics: [
          {
            label: 'Anime & gaming',
            userSay: 'ヤッホー、けんじ！最近は日本のアニメをよく見てるよ。 (Lately I watch a lot of anime.)',
            reply: 'いいね！発音がすごく綺麗だよ。 (Nice! Your pronunciation is really clean.)'
          },
          {
            label: 'Tokyo ramen',
            userSay: '東京で一番おすすめのラーメン屋さんはどこ？ (Best ramen spot in Tokyo?)',
            reply: '新宿の豚骨ラーメンがめっちゃうまいよ！ (The tonkotsu in Shinjuku is so good!)'
          }
        ]
      },
      {
        name: 'Sora',
        country: '🇯🇵 Japan',
        level: 'Native speaker',
        preset: 0,
        voice: { pitch: 1.2, rate: 1.0 },
        greeting: 'まいど！大阪からやで。気軽にしゃべろう！ (Hey from Osaka! Let\'s chat casually!)',
        topics: [
          {
            label: 'Try Kansai-ben',
            userSay: 'めっちゃ楽しそう！関西弁ってほんまに素敵やね。 (Kansai dialect is really lovely.)',
            reply: 'うわ、「ほんまに」って言ってくれた！イントネーション完璧やん！ (Your intonation is perfect!)',
            tip: '"ほんまに" = 本当に (really) in Kansai dialect.'
          }
        ]
      }
    ]
  },
  {
    code: 'ZH',
    name: 'Chinese',
    flag: '🇨🇳',
    speechLang: 'zh-CN',
    voicePreview: '你好！很高兴认识你。',
    guardDemo: '加我微信吧，我的手机号是 138-1234-5678！',
    lilyGreeting: "Nǐ hǎo. Everyone says tones are the hardest part — so let's test all four in a real chat.",
    lilyTopics: [
      {
        label: 'Order boba with tones',
        userSay: '老板，我要一杯少冰半糖的珍珠奶茶！ (Wǒ yào yī bēi shǎo bīng bàn táng de zhēnzhū nǎichá!)',
        reply: 'Third tone on "shǎo," fourth on "bàn" — crystal clear. You actually get your boba.',
        tip: '3rd → 4th tone: shǎo bīng bàn táng.'
      },
      {
        label: 'Use "juéjuézǐ"',
        userSay: '这家店的奶茶真的绝绝子！ (Zhè jiā diàn de nǎichá zhēn de juéjuézǐ!)',
        reply: 'Did you just say "juéjuézǐ"? You spend way too much time on Xiaohongshu. Respect.',
        tip: '绝绝子 (juéjuézǐ) = absolutely iconic.'
      }
    ],
    peers: [
      {
        name: 'Lin',
        country: '🇹🇼 Taiwan',
        level: 'Native speaker',
        preset: 0,
        voice: { pitch: 1.15, rate: 1.0 },
        greeting: '哈啰！很高兴跟你连线练习中文，你今天过得怎么样？ (Hi! How is your day going?)',
        topics: [
          {
            label: 'Night markets',
            userSay: '哈啰！我超想去台北夜市吃小吃！ (I really want to try Taipei night markets!)',
            reply: '哈哈，你的四声发音非常标准！ (Your four tones are really accurate!)'
          },
          {
            label: 'Mandopop',
            userSay: '你平时喜欢听周杰伦的歌吗？ (Do you like Jay Chou?)',
            reply: '超喜欢！每次去KTV必点《晴天》。 (Love him! I always sing "Sunny Day" at KTV.)'
          }
        ]
      }
    ]
  }
];

/* ==========================================================================
   SMALL UI PIECES
   ========================================================================== */
const STYLES = `
  /* Fallback for bracket-sized utility classes (works with or without Tailwind JIT) */
.bottom-\\[330px\\]{bottom:330px}
.gap-\\[2px\\]{gap:2px}
.gap-\\[3px\\]{gap:3px}
.h-\\[100px\\]{height:100px}
.h-\\[150px\\]{height:150px}
.h-\\[22px\\]{height:22px}
.h-\\[30px\\]{height:30px}
.h-\\[34px\\]{height:34px}
.h-\\[400px\\]{height:400px}
.h-\\[48px\\]{height:48px}
.h-\\[50px\\]{height:50px}
.h-\\[52px\\]{height:52px}
.h-\\[54px\\]{height:54px}
.h-\\[5px\\]{height:5px}
.h-\\[72px\\]{height:72px}
.h-\\[76px\\]{height:76px}
@media (min-width:1024px){.lg\\:w-\\[380px\\]{width:380px}}
.max-w-\\[280px\\]{max-width:280px}
.max-w-\\[390px\\]{max-width:390px}
.max-w-\\[86\\%\\]{max-width:86%}
.mt-\\[110px\\]{margin-top:110px}
.mt-\\[140px\\]{margin-top:140px}
.mt-\\[1px\\]{margin-top:1px}
.p-\\[11px\\]{padding:11px}
.pt-\\[54px\\]{padding-top:54px}
.pt-\\[58px\\]{padding-top:58px}
.py-\\[1px\\]{padding-top:1px;padding-bottom:1px}
.rounded-\\[32px\\]{border-radius:32px}
.rounded-\\[40px\\]{border-radius:40px}
.rounded-\\[46px\\]{border-radius:46px}
.rounded-\\[56px\\]{border-radius:56px}
.rounded-t-\\[28px\\]{border-top-left-radius:28px;border-top-right-radius:28px}
.text-\\[10px\\]{font-size:10px}
.text-\\[11px\\]{font-size:11px}
.text-\\[12px\\]{font-size:12px}
.text-\\[13px\\]{font-size:13px}
.text-\\[14px\\]{font-size:14px}
.text-\\[15px\\]{font-size:15px}
.text-\\[16px\\]{font-size:16px}
.text-\\[17px\\]{font-size:17px}
.text-\\[18px\\]{font-size:18px}
.text-\\[19px\\]{font-size:19px}
.text-\\[20px\\]{font-size:20px}
.text-\\[22px\\]{font-size:22px}
.text-\\[24px\\]{font-size:24px}
.text-\\[26px\\]{font-size:26px}
.text-\\[28px\\]{font-size:28px}
.text-\\[30px\\]{font-size:30px}
.top-\\[11px\\]{top:11px}
.top-\\[3px\\]{top:3px}
.top-\\[58px\\]{top:58px}
.top-\\[96px\\]{top:96px}
.tracking-\\[0\\.2em\\]{letter-spacing:0.2em}
.w-\\[120px\\]{width:120px}
.w-\\[134px\\]{width:134px}
.w-\\[22px\\]{width:22px}
.w-\\[3px\\]{width:3px}
.w-\\[52px\\]{width:52px}
.w-\\[54px\\]{width:54px}
.w-\\[64px\\]{width:64px}
.w-\\[72px\\]{width:72px}
.w-\\[76px\\]{width:76px}
.w-\\[88px\\]{width:88px}
.z-\\[60\\]{z-index:60}
.z-\\[70\\]{z-index:70}
  @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@600;700;800;900&display=swap');
  .duo-font { font-family: 'Nunito', 'DIN Next Rounded', ui-rounded, system-ui, sans-serif; }
  .duo-btn {
    border-radius: 16px; font-weight: 800; text-transform: uppercase;
    letter-spacing: 0.06em; transition: transform .08s ease, box-shadow .08s ease, filter .15s ease;
    user-select: none;
  }
  .duo-btn:hover { filter: brightness(1.05); }
  .duo-btn:active:not(:disabled) { transform: translateY(4px); box-shadow: 0 0 0 0 transparent !important; }
  .duo-btn:disabled { cursor: default; filter: none; }
  .duo-green  { background: ${C.feather}; color: #fff; box-shadow: 0 4px 0 ${C.featherDark}; }
  .duo-blue   { background: ${C.macaw};   color: #fff; box-shadow: 0 4px 0 ${C.macawDark}; }
  .duo-purple { background: ${C.beetle};  color: #fff; box-shadow: 0 4px 0 ${C.beetleDark}; }
  .duo-red    { background: ${C.cardinal};color: #fff; box-shadow: 0 4px 0 ${C.cardinalDark}; }
  .duo-white  { background: #fff; color: ${C.macaw}; border: 2px solid ${C.swan}; box-shadow: 0 4px 0 ${C.swan}; }
  .duo-ghost-dark { background: transparent; color: #fff; border: 2px solid ${C.nightBorder}; box-shadow: 0 4px 0 ${C.nightBorder}; }
  .duo-disabled { background: ${C.swan}; color: ${C.hare}; box-shadow: 0 4px 0 #CECECE; }
  .duo-card {
    background: #fff; border: 2px solid ${C.swan}; border-radius: 16px; box-shadow: 0 4px 0 ${C.swan};
  }
  .duo-card-press { transition: transform .08s ease, box-shadow .08s ease; cursor: pointer; }
  .duo-card-press:active { transform: translateY(4px); box-shadow: 0 0 0 0 transparent; }
  .no-scrollbar::-webkit-scrollbar { display: none; }
  .no-scrollbar { scrollbar-width: none; }

  @keyframes duoTalk { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }
  .duo-talk { animation: duoTalk .45s ease-in-out infinite; transform-box: fill-box; }
  @keyframes popIn { 0% { transform: scale(.6); opacity: 0 } 70% { transform: scale(1.06) } 100% { transform: scale(1); opacity: 1 } }
  .pop-in { animation: popIn .38s cubic-bezier(.2,.9,.3,1.2) both; }
  @keyframes slideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
  .slide-up { animation: slideUp .32s cubic-bezier(.2,.9,.3,1) both; }
  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
  .fade-in { animation: fadeIn .25s ease both; }
  @keyframes riseIn { from { transform: translateY(8px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
  .rise-in { animation: riseIn .28s ease both; }
  @keyframes ring { 0% { transform: scale(.85); opacity: .55 } 100% { transform: scale(1.9); opacity: 0 } }
  .ring-pulse { animation: ring 1.8s ease-out infinite; }
  @keyframes floaty { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
  .floaty { animation: floaty 2.2s ease-in-out infinite; }
  @keyframes eq { 0%,100% { transform: scaleY(.35) } 50% { transform: scaleY(1) } }
  .eq-bar { transform-origin: bottom; animation: eq .7s ease-in-out infinite; }
  @keyframes dots { 0%, 80%, 100% { opacity: .25 } 40% { opacity: 1 } }
  .dot { animation: dots 1.2s infinite; }
  @keyframes speakRing { 0% { transform: scale(.92); opacity: .9 } 100% { transform: scale(1.25); opacity: 0 } }
  .speak-ring { animation: speakRing 1s ease-out infinite; }
  @keyframes twinkle { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
  .twinkle { animation: twinkle 1.6s ease-in-out infinite; }
  @keyframes flicker { 0% { transform: scaleY(1) } 100% { transform: scaleY(.82) skewX(3deg) } }
  .flicker { animation: flicker .35s ease-in-out infinite alternate; transform-origin: 360px 76px; }
  .super-grad { background: linear-gradient(100deg, #26F4C0 0%, #2B9BFF 38%, #A960FF 70%, #FF6BD6 100%); }
  .super-text { background: linear-gradient(100deg, #26F4C0 0%, #2B9BFF 38%, #A960FF 70%, #FF6BD6 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .super-chip { font-size: 10px; font-weight: 900; letter-spacing: .08em; color: #fff; padding: 2px 7px; border-radius: 8px; background: linear-gradient(100deg, #2B9BFF, #A960FF 60%, #FF6BD6); }
  .duo-super { color: #fff; background: linear-gradient(100deg, #2B9BFF 0%, #A960FF 60%, #FF6BD6 100%); box-shadow: 0 4px 0 #6A3FC4; }
`;

const Toggle = ({ on, onChange, label }) => (
  <button
    role="switch"
    aria-checked={on}
    aria-label={label}
    onClick={() => onChange(!on)}
    className="relative w-[52px] h-[30px] rounded-full transition-colors shrink-0"
    style={{ background: on ? C.feather : C.swan }}
  >
    <span
      className="absolute top-[3px] w-6 h-6 rounded-full bg-white transition-all"
      style={{ left: on ? 25 : 3, boxShadow: '0 2px 0 rgba(0,0,0,.12)' }}
    />
  </button>
);

const IconTile = ({ icon: Icon, bg, fg, size = 44 }) => (
  <div
    className="rounded-2xl flex items-center justify-center shrink-0"
    style={{ width: size, height: size, background: bg }}
  >
    <Icon className="w-[22px] h-[22px]" style={{ color: fg }} strokeWidth={2.5} />
  </div>
);

const EqBars = ({ active, color = C.feather }) => (
  <span className="flex items-end gap-[2px] h-3">
    {[0, 1, 2, 3].map((i) => (
      <span
        key={i}
        className={`w-[3px] h-3 rounded-full ${active ? 'eq-bar' : ''}`}
        style={{
          background: color,
          animationDelay: `${i * 0.12}s`,
          transform: active ? undefined : 'scaleY(.3)',
          transformOrigin: 'bottom'
        }}
      />
    ))}
  </span>
);

const RedactedText = ({ segments }) => (
  <>
    {segments.map((s, i) =>
      typeof s === 'string' ? (
        <span key={i}>{s}</span>
      ) : (
        <span
          key={i}
          className="inline-flex items-center gap-1 align-middle mx-0.5 px-1.5 py-[1px] rounded-md text-[11px] font-extrabold text-white"
          style={{ background: C.eel }}
        >
          <Lock className="w-3 h-3" /> {s.redacted} hidden
        </span>
      )
    )}
  </>
);

/* ==========================================================================
   CONNECT ROOMS (Super) — a cozy living room you walk around in.
   Get close to someone → Say hi. Groups form, merge and break up freely.
   ========================================================================== */
const LANGS = {
  ES: { flag: '🇪🇸', name: 'Spanish' },
  JA: { flag: '🇯🇵', name: 'Japanese' },
  ZH: { flag: '🇨🇳', name: 'Chinese' },
  EN: { flag: '🇺🇸', name: 'English' },
  KO: { flag: '🇰🇷', name: 'Korean' },
  FR: { flag: '🇫🇷', name: 'French' },
  HI: { flag: '🇮🇳', name: 'Hindi' }
};

const LEVELS = [
  { id: 'beginner', label: 'Beginner', sub: 'I know the basics', color: C.feather, bars: 1 },
  { id: 'intermediate', label: 'Intermediate', sub: 'I can hold a simple chat', color: C.macaw, bars: 2 },
  { id: 'advanced', label: 'Advanced', sub: 'I can talk about most things', color: C.beetle, bars: 3 }
];

const shade = (hex, amt) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, v));
  const r = c((n >> 16) + amt);
  const g = c(((n >> 8) & 255) + amt);
  const b = c((n & 255) + amt);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
};

// Parametric avatar in the same visual style as the peer avatars
const BuddyAvatarSVG = ({ look, isSpeaking = false, viewBox = '0 0 280 320', fit = 'meet' }) => {
  const { bg, skin, hair, hairColor: hc, shirt, collar, eye } = look;
  const nose = shade(skin, -70);
  const crease = shade(skin, -40);
  const back = {
    bob: <rect x="62" y="92" width="156" height="150" rx="64" fill={hc} />,
    long: <path d="M66 140 C60 66, 220 66, 214 140 L224 266 Q140 284 56 266 Z" fill={hc} />,
    puffs: (
      <>
        <circle cx="74" cy="100" r="40" fill={hc} />
        <circle cx="206" cy="100" r="40" fill={hc} />
      </>
    ),
    bun: <circle cx="140" cy="70" r="30" fill={hc} />
  }[hair];
  const front = {
    short: <path d="M80 146 C72 78, 208 78, 200 146 C186 116, 94 116, 80 146 Z" fill={hc} />,
    bob: <path d="M82 152 C78 90, 202 90, 198 152 L198 132 C168 114 112 114 82 132 Z" fill={hc} />,
    bun: <path d="M82 142 C80 88, 200 88, 198 142 C176 116, 104 116, 82 142 Z" fill={hc} />,
    puffs: <path d="M82 142 C80 92, 200 92, 198 142 C176 120, 104 120, 82 142 Z" fill={hc} />,
    swoop: (
      <>
        <path d="M76 142 C70 72, 210 68, 204 134 C176 102, 112 104, 76 142 Z" fill={hc} />
        <circle cx="170" cy="90" r="26" fill={hc} />
      </>
    ),
    long: <path d="M82 148 C80 88, 200 88, 198 148 C170 110, 120 106, 82 148 Z" fill={hc} />,
    beanie: (
      <>
        <path d="M78 132 C78 66, 202 66, 202 132 Z" fill={hc} />
        <rect x="74" y="110" width="132" height="26" rx="13" fill={shade(hc, -35)} />
        <circle cx="140" cy="62" r="15" fill={shade(hc, -35)} />
      </>
    )
  }[hair];
  return (
    <svg className="w-full h-full select-none" viewBox={viewBox} preserveAspectRatio={`xMidYMid ${fit}`} fill="none">
      <rect width="280" height="320" fill={bg} />
      <g className={isSpeaking ? 'duo-talk' : ''}>
        {back}
        <path d="M68 320 L88 242 Q140 234 192 242 L212 320 Z" fill={shirt} />
        <rect x="98" y="218" width="84" height="30" rx="12" fill={collar} />
        <circle cx="76" cy="166" r="18" fill={skin} />
        <circle cx="204" cy="166" r="18" fill={skin} />
        <rect x="82" y="108" width="116" height="118" rx="34" fill={skin} />
        {front}
        <rect x="108" y="134" width="28" height="40" rx="14" fill="#FFFFFF" />
        <rect x="144" y="134" width="28" height="40" rx="14" fill="#FFFFFF" />
        <rect x="118" y="144" width="13" height="23" rx="6.5" fill={eye} />
        <circle cx="117" cy="153" r="4.5" fill="#FFFFFF" />
        <rect x="154" y="144" width="13" height="23" rx="6.5" fill={eye} />
        <circle cx="153" cy="153" r="4.5" fill="#FFFFFF" />
        <path d="M140 165 C135 174, 131 185, 140 185 C149 185, 145 174, 140 165 Z" fill={nose} />
        {isSpeaking ? (
          <ellipse cx="148" cy="199" rx="9" ry="11" fill="#6E261E">
            <animate attributeName="ry" values="4;12;5;11;4" dur="0.22s" repeatCount="indefinite" />
          </ellipse>
        ) : (
          <circle cx="148" cy="199" r="8" fill="#6E261E" />
        )}
        <path d="M150 211 Q161 210 163 199" stroke={crease} strokeWidth="4" strokeLinecap="round" fill="none" />
      </g>
    </svg>
  );
};

const HEAD_CROP = '56 44 168 176';
const AvatarArt = ({ person, isSpeaking = false, crop = false }) =>
  person.preset != null ? (
    <PeerAvatarSVG preset={person.preset} isSpeaking={isSpeaking} viewBox={crop ? HEAD_CROP : undefined} />
  ) : (
    <BuddyAvatarSVG look={person.look} isSpeaking={isSpeaking} viewBox={crop ? HEAD_CROP : undefined} fit={crop ? 'slice' : 'meet'} />
  );

const ROSTER = [
  { id: 'maya', name: 'Maya', preset: 0, ring: '#FFC800', native: 'ES', learning: { EN: 'intermediate' } },
  { id: 'mateo', name: 'Mateo', preset: 1, ring: '#58CC02', native: 'ES', learning: { EN: 'beginner', ZH: 'beginner' } },
  { id: 'diego', name: 'Diego', preset: 2, ring: '#1CB0F6', native: 'ES', learning: { JA: 'intermediate' } },
  {
    id: 'kenji', name: 'Kenji', ring: '#58CC02', native: 'JA', learning: { ES: 'intermediate', EN: 'advanced' },
    look: { bg: '#FFE7D1', skin: '#F1C79A', hair: 'short', hairColor: '#2B2B2B', shirt: '#58CC02', collar: '#58A700', eye: '#3B2314' }
  },
  {
    id: 'sora', name: 'Sora', ring: '#FF86D0', native: 'JA', learning: { ZH: 'beginner' },
    look: { bg: '#F6E7FF', skin: '#F6D3B8', hair: 'bob', hairColor: '#5A3A22', shirt: '#FF86D0', collar: '#E46BB8', eye: '#3B2314' }
  },
  {
    id: 'lin', name: 'Lin', ring: '#CE82FF', native: 'ZH', learning: { ES: 'beginner', EN: 'advanced' },
    look: { bg: '#FFF4CC', skin: '#F3CBA8', hair: 'bun', hairColor: '#1F1F1F', shirt: '#CE82FF', collar: '#A568CC', eye: '#2B1B12' }
  },
  {
    id: 'amara', name: 'Amara', ring: '#FF9600', native: 'EN', learning: { ES: 'advanced', JA: 'beginner' },
    look: { bg: '#DDF4FF', skin: '#8D5524', hair: 'puffs', hairColor: '#1B1B1B', shirt: '#FF9600', collar: '#E07F00', eye: '#2B1B12' }
  },
  {
    id: 'leo', name: 'Léo', ring: '#2B70C9', native: 'FR', learning: { ES: 'beginner', ZH: 'intermediate' },
    look: { bg: '#E5F8D8', skin: '#F2C6A0', hair: 'swoop', hairColor: '#C77B30', shirt: '#2B70C9', collar: '#1F5AA6', eye: '#2E6B3A' }
  },
  {
    id: 'priya', name: 'Priya', ring: '#1CB0F6', native: 'EN', learning: { JA: 'intermediate', ES: 'beginner', ZH: 'beginner' },
    look: { bg: '#FFE5E5', skin: '#B97A56', hair: 'long', hairColor: '#1A1110', shirt: '#1CB0F6', collar: '#1899D6', eye: '#2B1B12' }
  },
  {
    id: 'jun', name: 'Jun', ring: '#FFC800', native: 'KO', learning: { ZH: 'advanced', ES: 'intermediate', JA: 'advanced' },
    look: { bg: '#EDEDED', skin: '#F0C8A0', hair: 'beanie', hairColor: '#FFC800', shirt: '#4B4B4B', collar: '#333333', eye: '#2B1B12' }
  }
];

const ROOM_LINES = {
  ES: {
    chat: [
      '¿Alguien ha visto la nueva serie de Netflix? (Has anyone seen the new Netflix show?)',
      'Este mes estoy aprendiendo a cocinar paella. (This month I\'m learning to cook paella.)',
      '¡Qué salón tan acogedor! Me encanta la chimenea. (What a cozy living room! I love the fireplace.)',
      'Perdón, ¿puedes repetirlo más despacio? (Sorry, can you repeat that more slowly?)',
      'En mi ciudad hace muchísimo calor ahora. (It\'s really hot in my city right now.)',
      '¿Cuánto tiempo llevas estudiando español? (How long have you been studying Spanish?)',
      'La verdad, el subjuntivo me cuesta mucho. (Honestly, the subjunctive is really hard for me.)',
      'Mañana tengo un examen, ¡deseadme suerte! (I have an exam tomorrow, wish me luck!)',
      '¿Qué música estáis escuchando últimamente? (What music have you all been listening to?)'
    ],
    teach: [
      'Oye, ¿cómo se dice "sobremesa" en inglés? (Hey, how do you say "sobremesa" in English?)',
      '¿"I\'m down" significa que estoy triste? (Does "I\'m down" mean I\'m sad?)'
    ],
    greet: ['¡Hola! Bienvenido, únete a nosotros. (Hi! Welcome, join us.)', '¡Hey! ¿De dónde eres? (Hey! Where are you from?)'],
    me: [
      { label: 'Introduce yourself', say: '¡Hola a todos! Soy Ansu, estudio en Los Ángeles. (Hi everyone! I\'m Ansu, I study in LA.)' },
      { label: 'Ask about weekends', say: '¿Qué soléis hacer los fines de semana? (What do you usually do on weekends?)' },
      { label: 'Ask to slow down', say: '¿Podéis hablar un poco más despacio, porfa? (Could you speak a bit slower, please?)' },
      { label: 'Help with English', say: 'En inglés diríamos "lingering at the table". (In English we\'d say "lingering at the table".)' }
    ]
  },
  JA: {
    chat: [
      '最近なにか面白いドラマ見た？ (Seen any good dramas lately?)',
      '週末は友達とカラオケに行ったよ。 (I went to karaoke with friends this weekend.)',
      'このリビング、めっちゃ落ち着くね。 (This living room is so relaxing.)',
      'ごめん、もう一回ゆっくり言ってくれる？ (Sorry, can you say it again slowly?)',
      '敬語がまだ難しいなあ。 (Keigo is still hard for me.)',
      '日本語を勉強してどれくらい？ (How long have you studied Japanese?)',
      '来月、京都に旅行するんだ。 (I\'m traveling to Kyoto next month.)'
    ],
    teach: ['「いただきます」って英語でなんて言うの？ (How do you say "itadakimasu" in English?)', '"No worries" ってどういう意味？ (What does "no worries" mean?)'],
    greet: ['あ、いらっしゃい！一緒に話そう！ (Oh, welcome! Let\'s talk!)', 'はじめまして！どこから来たの？ (Nice to meet you! Where are you from?)'],
    me: [
      { label: 'Introduce yourself', say: 'みなさん、こんにちは！アンスです。 (Hi everyone! I\'m Ansu.)' },
      { label: 'Ask about weekends', say: '週末はいつも何してる？ (What do you usually do on weekends?)' },
      { label: 'Ask to slow down', say: 'もう少しゆっくり話してもらえる？ (Could you speak a little slower?)' },
      { label: 'Help with English', say: '英語だと "Let\'s eat!" って感じかな。 (In English it\'s like "Let\'s eat!")' }
    ]
  },
  ZH: {
    chat: [
      '你最近在看什么剧？ (What show are you watching lately?)',
      '我周末去吃了火锅，超好吃！ (I had hotpot this weekend, so good!)',
      '这个客厅好温馨啊。 (This living room is so cozy.)',
      '不好意思，你可以说慢一点吗？ (Sorry, could you speak a bit slower?)',
      '声调对我来说还是很难。 (Tones are still hard for me.)',
      '你学中文多久了？ (How long have you studied Chinese?)',
      '下个月我要去上海玩。 (I\'m visiting Shanghai next month.)'
    ],
    teach: ['"加油"用英文怎么说？ (How do you say "jiāyóu" in English?)', '"Hang out" 是什么意思？ (What does "hang out" mean?)'],
    greet: ['欢迎欢迎！快来一起聊天！ (Welcome! Come chat with us!)', '你好！你是哪里人？ (Hi! Where are you from?)'],
    me: [
      { label: 'Introduce yourself', say: '大家好！我是Ansu，在洛杉矶上学。 (Hi everyone! I\'m Ansu, I study in LA.)' },
      { label: 'Ask about weekends', say: '你们周末一般做什么？ (What do you usually do on weekends?)' },
      { label: 'Ask to slow down', say: '可以说慢一点吗？ (Could you speak a bit slower?)' },
      { label: 'Help with English', say: '英文可以说 "You got this!" (In English you can say "You got this!")' }
    ]
  }
};

// --- World geometry (top-down, in px) ---------------------------------------
const WORLD_W = 720;
const WORLD_H = 1000;
const VIEW_W = 368;
const VIEW_H = 822;
const NEAR_R = 84; // close enough to start talking
const LEAVE_R = 170; // walk this far from a conversation and you leave it
const PLAYER_SPEED = 160;
const NPC_SPEED = 72;

const OBSTACLES = [
  { x: 0, y: 0, w: 720, h: 30 },
  { x: 0, y: 0, w: 30, h: 1000 },
  { x: 690, y: 0, w: 30, h: 1000 },
  { x: 0, y: 970, w: 330, h: 30 },
  { x: 410, y: 970, w: 310, h: 30 },
  { x: 296, y: 30, w: 128, h: 50 }, // fireplace
  { x: 196, y: 394, w: 328, h: 54 }, // sofa
  { x: 300, y: 248, w: 120, h: 56 }, // coffee table
  { x: 98, y: 202, w: 68, h: 68 }, // armchair L
  { x: 554, y: 202, w: 68, h: 68 }, // armchair R
  { x: 640, y: 470, w: 50, h: 210 }, // bookshelf
  { x: 30, y: 560, w: 50, h: 300 }, // kitchen counter
  { x: 124, y: 704, w: 112, h: 112 }, // kitchen table
  { x: 42, y: 42, w: 40, h: 40 }, // plants
  { x: 638, y: 42, w: 40, h: 40 },
  { x: 638, y: 916, w: 40, h: 40 },
  { x: 92, y: 112, w: 28, h: 28 } // floor lamp
];

const blocked = (x, y, r = 15) => {
  if (x < r || y < r || x > WORLD_W - r || y > WORLD_H - r) return true;
  return OBSTACLES.some((o) => x > o.x - r && x < o.x + o.w + r && y > o.y - r && y < o.y + o.h + r);
};
const randomOpenPoint = () => {
  for (let i = 0; i < 40; i++) {
    const x = 70 + Math.random() * 580;
    const y = 110 + Math.random() * 820;
    if (!blocked(x, y, 28)) return { x, y };
  }
  return { x: 470, y: 640 };
};
const tryMove = (o, dx, dy) => {
  if (!blocked(o.x + dx, o.y + dy)) {
    o.x += dx;
    o.y += dy;
    return true;
  }
  if (Math.abs(dx) > 0.01 && !blocked(o.x + dx, o.y)) {
    o.x += dx;
    return true;
  }
  if (Math.abs(dy) > 0.01 && !blocked(o.x, o.y + dy)) {
    o.y += dy;
    return true;
  }
  return false;
};
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// --- Pathfinding (A* on a 20px grid) so walking routes around furniture -------
const CELL = 20;
const GW = Math.ceil(WORLD_W / CELL);
const GH = Math.ceil(WORLD_H / CELL);
let GRID = null;
const getGrid = () => {
  if (GRID) return GRID;
  GRID = new Uint8Array(GW * GH);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) GRID[y * GW + x] = blocked(x * CELL + CELL / 2, y * CELL + CELL / 2, 16) ? 1 : 0;
  return GRID;
};
const clearLine = (a, b) => {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.ceil(d / 8);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (blocked(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 15)) return false;
  }
  return true;
};
const findPath = (from, to) => {
  if (clearLine(from, to)) return [to];
  const grid = getGrid();
  const cellOf = (pt) => [Math.max(0, Math.min(GW - 1, Math.floor(pt.x / CELL))), Math.max(0, Math.min(GH - 1, Math.floor(pt.y / CELL)))];
  let [sx, sy] = cellOf(from);
  let [tx, ty] = cellOf(to);
  // snap the goal to the nearest walkable cell
  if (grid[ty * GW + tx]) {
    let best = null;
    for (let r = 1; r < 8 && !best; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const x = tx + dx;
          const y = ty + dy;
          if (x >= 0 && y >= 0 && x < GW && y < GH && !grid[y * GW + x]) {
            const dd = dx * dx + dy * dy;
            if (!best || dd < best.dd) best = { x, y, dd };
          }
        }
    if (!best) return [];
    tx = best.x;
    ty = best.y;
    to = { x: tx * CELL + CELL / 2, y: ty * CELL + CELL / 2 };
  }
  const start = sy * GW + sx;
  const goal = ty * GW + tx;
  const g = new Float32Array(GW * GH).fill(Infinity);
  const came = new Int32Array(GW * GH).fill(-1);
  const open = [start];
  const inOpen = new Uint8Array(GW * GH);
  g[start] = 0;
  inOpen[start] = 1;
  const h = (i) => Math.hypot((i % GW) - tx, Math.floor(i / GW) - ty);
  let found = false;
  let guard = 0;
  while (open.length && guard++ < 6000) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (g[open[i]] + h(open[i]) < g[open[bi]] + h(open[bi])) bi = i;
    const cur = open.splice(bi, 1)[0];
    inOpen[cur] = 0;
    if (cur === goal) {
      found = true;
      break;
    }
    const cx = cur % GW;
    const cy = Math.floor(cur / GW);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        const ni = ny * GW + nx;
        if (grid[ni] && ni !== start) continue;
        if (dx && dy && (grid[cy * GW + nx] || grid[ny * GW + cx])) continue;
        const ng = g[cur] + (dx && dy ? 1.414 : 1);
        if (ng < g[ni]) {
          g[ni] = ng;
          came[ni] = cur;
          if (!inOpen[ni]) {
            open.push(ni);
            inOpen[ni] = 1;
          }
        }
      }
  }
  if (!found) return [];
  const cells = [];
  for (let c = goal; c !== -1 && c !== start; c = came[c]) cells.unshift({ x: (c % GW) * CELL + CELL / 2, y: Math.floor(c / GW) * CELL + CELL / 2 });
  cells[cells.length - 1] = to;
  // string-pull: skip waypoints we can see past
  const out = [];
  let anchor = from;
  let i = 0;
  while (i < cells.length) {
    let j = cells.length - 1;
    while (j > i && !clearLine(anchor, cells[j])) j--;
    out.push(cells[j]);
    anchor = cells[j];
    i = j + 1;
  }
  return out;
};
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// --- Static room art ---------------------------------------------------------
const RoomArt = React.memo(function RoomArt() {
  const plant = (cx, cy) => (
    <g>
      <circle cx={cx} cy={cy + 4} r="18" fill="#C46A3A" />
      <circle cx={cx} cy={cy} r="20" fill="#3FA34D" />
      <circle cx={cx - 9} cy={cy - 7} r="11" fill="#58CC02" />
      <circle cx={cx + 9} cy={cy - 4} r="10" fill="#89E219" />
      <circle cx={cx + 2} cy={cy + 8} r="9" fill="#58A700" />
    </g>
  );
  const books = [];
  for (let i = 0; i < 9; i++) {
    const colors = ['#FF4B4B', '#1CB0F6', '#FFC800', '#58CC02', '#CE82FF', '#FF9600'];
    books.push(<rect key={i} x={648} y={480 + i * 22} width={34} height={14} rx={3} fill={colors[i % colors.length]} />);
  }
  const lights = [];
  for (let i = 0; i < 18; i++) {
    const colors = ['#FFC800', '#FF86D0', '#89E219', '#1CB0F6'];
    lights.push(<circle key={i} className="twinkle" style={{ animationDelay: `${(i % 5) * 0.4}s` }} cx={46 + i * 37} cy={38 + (i % 2) * 4} r="4" fill={colors[i % 4]} />);
  }
  return (
    <svg width={WORLD_W} height={WORLD_H} viewBox={`0 0 ${WORLD_W} ${WORLD_H}`} style={{ position: 'absolute', left: 0, top: 0, display: 'block' }}>
      <defs>
        <pattern id="planks" width="120" height="40" patternUnits="userSpaceOnUse">
          <rect width="120" height="40" fill="#EBCB9F" />
          <rect width="120" height="20" fill="#E6C393" />
          <line x1="0" y1="20" x2="120" y2="20" stroke="#D9AE7B" strokeWidth="2" />
          <line x1="0" y1="40" x2="120" y2="40" stroke="#D9AE7B" strokeWidth="2" />
          <line x1="72" y1="0" x2="72" y2="20" stroke="#D9AE7B" strokeWidth="2" />
          <line x1="22" y1="20" x2="22" y2="40" stroke="#D9AE7B" strokeWidth="2" />
        </pattern>
        <pattern id="tiles" width="36" height="36" patternUnits="userSpaceOnUse">
          <rect width="36" height="36" fill="#F7F1E6" />
          <rect width="18" height="18" fill="#EFE5D3" />
          <rect x="18" y="18" width="18" height="18" fill="#EFE5D3" />
        </pattern>
        <radialGradient id="lampGlow">
          <stop offset="0" stopColor="#FFE9A8" stopOpacity=".8" />
          <stop offset="1" stopColor="#FFE9A8" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="fireGlow">
          <stop offset="0" stopColor="#FFB547" stopOpacity=".6" />
          <stop offset="1" stopColor="#FFB547" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFF8DD" stopOpacity=".65" />
          <stop offset="1" stopColor="#FFF8DD" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* floors */}
      <rect width={WORLD_W} height={WORLD_H} fill="url(#planks)" />
      <rect x="30" y="540" width="250" height="330" fill="url(#tiles)" />

      {/* window light */}
      <polygon points="80,30 200,30 250,330 40,330" fill="url(#beam)" />
      <polygon points="520,30 640,30 690,330 470,330" fill="url(#beam)" />

      {/* rugs */}
      <rect x="150" y="150" width="420" height="300" rx="34" fill="#BDEB9B" />
      <rect x="166" y="166" width="388" height="268" rx="26" fill="none" stroke="#89E219" strokeWidth="4" strokeDasharray="2 12" strokeLinecap="round" />
      <circle cx="588" cy="566" r="74" fill="#F3E5FF" />
      <circle cx="588" cy="566" r="60" fill="none" stroke="#E3C6FF" strokeWidth="4" />
      <rect x="96" y="676" width="168" height="168" rx="24" fill="#FFE1A8" opacity=".9" />
      <rect x="460" y="780" width="200" height="160" rx="28" fill="#FFD9E8" />
      <rect x="474" y="794" width="172" height="132" rx="20" fill="none" stroke="#FFB3D1" strokeWidth="4" strokeDasharray="10 8" />

      {/* glows */}
      <circle cx="106" cy="126" r="120" fill="url(#lampGlow)" />
      <circle cx="360" cy="120" r="170" fill="url(#fireGlow)" />

      {/* fireplace */}
      <rect x="290" y="30" width="140" height="56" rx="10" fill="#B5654A" />
      <rect x="290" y="30" width="140" height="56" rx="10" fill="none" stroke="#8E4A35" strokeWidth="4" />
      <rect x="318" y="38" width="84" height="40" rx="18" fill="#3A2420" />
      <g className="flicker">
        <path d="M360 76 C340 72, 342 52, 352 44 C352 56, 362 56, 360 46 C372 54, 380 70, 360 76 Z" fill="#FF9600" />
        <path d="M360 76 C350 72, 352 62, 358 56 C360 64, 366 64, 364 58 C370 64, 372 74, 360 76 Z" fill="#FFC800" />
      </g>

      {/* coffee table + mugs */}
      <rect x="300" y="248" width="120" height="56" rx="16" fill="#B07A4F" />
      <rect x="306" y="252" width="108" height="10" rx="5" fill="#C99266" />
      <circle cx="334" cy="282" r="9" fill="#FFFFFF" />
      <circle cx="334" cy="282" r="5" fill="#8A5A3A" />
      <circle cx="386" cy="278" r="9" fill="#FFFFFF" />
      <circle cx="386" cy="278" r="5" fill="#8A5A3A" />

      {/* sofa (back toward the bottom) */}
      <rect x="196" y="394" width="328" height="54" rx="20" fill="#1CB0F6" />
      <rect x="196" y="430" width="328" height="18" rx="9" fill="#1899D6" />
      <rect x="196" y="394" width="30" height="54" rx="14" fill="#1899D6" />
      <rect x="494" y="394" width="30" height="54" rx="14" fill="#1899D6" />
      <rect x="232" y="400" width="80" height="28" rx="12" fill="#84D8FF" />
      <rect x="320" y="400" width="80" height="28" rx="12" fill="#84D8FF" />
      <rect x="408" y="400" width="80" height="28" rx="12" fill="#84D8FF" />

      {/* armchairs */}
      {[98, 554].map((x) => (
        <g key={x}>
          <rect x={x} y="202" width="68" height="68" rx="20" fill="#FF9600" />
          <rect x={x + 10} y="212" width="48" height="44" rx="14" fill="#FFB547" />
        </g>
      ))}

      {/* floor lamp */}
      <circle cx="106" cy="126" r="16" fill="#FFC800" />
      <circle cx="106" cy="126" r="8" fill="#FFF3B0" />

      {/* bookshelf + beanbag */}
      <rect x="640" y="470" width="50" height="210" rx="6" fill="#8B5A3C" />
      {books}
      <ellipse cx="572" cy="586" rx="36" ry="30" fill="#CE82FF" />
      <ellipse cx="566" cy="578" rx="22" ry="17" fill="#E0B3FF" />

      {/* kitchen */}
      <rect x="30" y="560" width="50" height="300" rx="6" fill="#ECECEC" />
      <rect x="36" y="600" width="38" height="50" rx="8" fill="#BDE8FF" />
      <circle cx="55" cy="720" r="11" fill="#4B4B4B" />
      <circle cx="55" cy="752" r="11" fill="#4B4B4B" />
      {[
        [180, 690],
        [180, 830],
        [110, 760],
        [250, 760]
      ].map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x - 16} y={y - 16} width="32" height="32" rx="10" fill="#FFC800" />
      ))}
      <circle cx="180" cy="760" r="54" fill="#C88A5A" />
      <circle cx="180" cy="760" r="44" fill="none" stroke="#D9A274" strokeWidth="3" />
      <circle cx="166" cy="748" r="10" fill="#FFFFFF" />
      <circle cx="198" cy="772" r="13" fill="#FF4B4B" />
      <circle cx="198" cy="772" r="6" fill="#FFD1D1" />

      {/* game corner */}
      <circle cx="520" cy="860" r="18" fill="#FF86D0" />
      <circle cx="600" cy="860" r="18" fill="#1CB0F6" />
      <rect x="540" y="840" width="40" height="40" rx="8" fill="#FFFFFF" />
      <rect x="546" y="846" width="12" height="12" fill="#58CC02" />
      <rect x="562" y="862" width="12" height="12" fill="#FF4B4B" />

      {/* a sleepy cat */}
      <g transform="translate(470 182)">
        <ellipse cx="0" cy="0" rx="22" ry="15" fill="#9A9A9A" />
        <circle cx="16" cy="-8" r="10" fill="#9A9A9A" />
        <path d="M10 -16 L13 -24 L18 -16 Z M18 -16 L22 -24 L25 -14 Z" fill="#9A9A9A" />
        <path d="M-20 4 C-32 10, -30 -6, -18 -4" stroke="#9A9A9A" strokeWidth="6" fill="none" strokeLinecap="round" />
        <text x="30" y="-18" fontSize="14" fontWeight="900" fill="#777">z</text>
      </g>

      {/* plants */}
      {plant(62, 62)}
      {plant(658, 62)}
      {plant(658, 936)}

      {/* walls */}
      <rect x="0" y="0" width={WORLD_W} height="30" fill="#7A5236" />
      <rect x="0" y="0" width="30" height={WORLD_H} fill="#7A5236" />
      <rect x="690" y="0" width="30" height={WORLD_H} fill="#7A5236" />
      <rect x="0" y="970" width="330" height="30" fill="#7A5236" />
      <rect x="410" y="970" width="310" height="30" fill="#7A5236" />
      <rect x="80" y="6" width="120" height="18" rx="4" fill="#BDE8FF" stroke="#FFFFFF" strokeWidth="3" />
      <rect x="520" y="6" width="120" height="18" rx="4" fill="#BDE8FF" stroke="#FFFFFF" strokeWidth="3" />
      {lights}

      {/* door mat */}
      <rect x="334" y="930" width="72" height="34" rx="8" fill="#58CC02" />
      <text x="370" y="953" textAnchor="middle" fontSize="12" fontWeight="900" fill="#FFFFFF" fontFamily="Nunito, sans-serif">
        HOLA
      </text>
    </svg>
  );
});

const npcIds = (g) => g.members.filter((m) => m !== 'me');
const slotRadius = (n) => 28 + 8 * n;
const recomputePhase = (g, me) => {
  const n = g.members.length;
  if (g.members.includes('me')) {
    g.phase = Math.atan2(me.y - g.anchor.y, me.x - g.anchor.x) + (2 * Math.PI) / n;
  } else if (g.phase == null) {
    g.phase = -Math.PI / 2;
  }
};
const slotPos = (g, i) => {
  const n = g.members.length;
  const a = g.phase + (i * 2 * Math.PI) / n;
  const r = slotRadius(n);
  return { x: g.anchor.x + r * Math.cos(a), y: g.anchor.y + r * Math.sin(a) };
};

const initWorld = (members) => {
  const now = performance.now();
  const people = {};
  members.forEach((m, i) => {
    people[m.id] = {
      ...m,
      x: 470,
      y: 640,
      tx: null,
      ty: null,
      mode: 'wander',
      groupId: null,
      bubble: null,
      moving: false,
      nextWander: now + 1500 + Math.random() * 3000,
      voice: { pitch: 0.8 + (i % 4) * 0.14, rate: 1 }
    };
  });
  const W = { people, groups: {}, me: { x: 370, y: 900, tx: null, ty: null, groupId: null, moving: false }, gid: 0, floaters: [], tap: null, cam: { x: 186, y: 460 } };
  const n = members.length;
  const late = members[n - 1];
  const rest = members.slice(0, n - 1);
  const makeGroup = (ids, anchor) => {
    const id = `g${++W.gid}`;
    const g = { id, anchor, members: [...ids], phase: -Math.PI / 2 + Math.random(), nextTalk: now + 1200 + Math.random() * 2500, lastSpeaker: null };
    W.groups[id] = g;
    ids.forEach((pid, i) => {
      const p = people[pid];
      p.mode = 'group';
      p.groupId = id;
      const s = slotPos(g, i);
      p.x = s.x;
      p.y = s.y;
    });
    return g;
  };
  makeGroup(rest.slice(0, 3).map((m) => m.id), { x: 238, y: 332 });
  if (rest.length > 3) makeGroup(rest.slice(3, 5).map((m) => m.id), { x: 322, y: 760 });
  if (rest[5]) {
    const p = people[rest[5].id];
    p.mode = 'idle';
    p.x = 590;
    p.y = 548;
    p.idleEmoji = '📖';
  }
  rest.slice(6).forEach((m, i) => {
    const p = people[m.id];
    const starts = [
      { x: 500, y: 650 },
      { x: 430, y: 560 },
      { x: 520, y: 720 }
    ];
    Object.assign(p, starts[i % 3]);
  });
  if (late) {
    const p = people[late.id];
    p.mode = 'offstage';
    p.x = 370;
    p.y = 1030;
  }
  W.lateId = late ? late.id : null;
  W.lateAt = now + 5500;
  W.nextEvent = now + 7000;
  return W;
};

function LivingRoom({ course, avatarPreset, voiceMode, synthVoice, teaches, level, exitRef, onExit }) {
  const code = course.code;
  const lines = ROOM_LINES[code];
  const members = useMemo(() => ROSTER.filter((p) => p.native === code || p.learning[code]), [code]);
  const viewRef = useRef(null);
  const W = useRef(null);
  if (!W.current) W.current = initWorld(members);
  const [, setFrame] = useState(0);
  const [transcript, setTranscript] = useState([]);
  const [toast, setToastMsg] = useState(null);
  const [muted, setMuted] = useState(false);
  const [voice, setVoice] = useState(voiceMode);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState(true);
  const busyRef = useRef(false);
  const keys = useRef({});
  const toastTimer = useRef(null);
  const talked = useRef(new Set());
  const startedAt = useRef(Date.now());
  const meCursor = useRef(0);
  const transcriptRef = useRef(null);
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const teachRef = useRef(teaches);
  teachRef.current = teaches;

  const toastIt = (msg) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2300);
  };
  const floater = (x, y, text) => W.current.floaters.push({ x, y, text, born: performance.now() });

  const myGroup = () => (W.current.me.groupId ? W.current.groups[W.current.me.groupId] : null);

  const dissolveIfNeeded = (g) => {
    const W_ = W.current;
    const npcs = npcIds(g);
    const hasMe = g.members.includes('me');
    if (npcs.length === 0 || (!hasMe && npcs.length < 2)) {
      npcs.forEach((id) => {
        const p = W_.people[id];
        p.mode = 'wander';
        p.groupId = null;
        const t = randomOpenPoint();
        p.tx = t.x;
        p.ty = t.y;
      });
      if (hasMe) {
        W_.me.groupId = null;
        toastIt('Conversation ended');
        setTranscript([]);
      }
      delete W_.groups[g.id];
      return true;
    }
    recomputePhase(g, W_.me);
    return false;
  };

  const addToGroup = (g, pid) => {
    const W_ = W.current;
    if (g.members.includes(pid)) return;
    g.members.push(pid);
    if (pid === 'me') {
      W_.me.groupId = g.id;
    } else {
      const p = W_.people[pid];
      p.mode = 'group';
      p.groupId = g.id;
      p.joinGid = null;
    }
    recomputePhase(g, W_.me);
  };

  const removeFromGroup = (g, pid) => {
    const W_ = W.current;
    g.members = g.members.filter((m) => m !== pid);
    if (pid === 'me') W_.me.groupId = null;
    else {
      const p = W_.people[pid];
      p.groupId = null;
      p.mode = 'wander';
      const t = randomOpenPoint();
      p.tx = t.x;
      p.ty = t.y;
      p.nextWander = performance.now() + 4000;
    }
    dissolveIfNeeded(g);
  };

  const sayNpc = (p, text, mine, teach = false) => {
    const now = performance.now();
    p.bubble = { text, until: now + (mine ? 4200 : 3200), mine, teach };
    if (mine) {
      setTranscript((t) => [...t.slice(-12), { id: now + Math.random(), who: p.name, color: p.ring, text, teach }]);
      busyRef.current = true;
      setBusy(true);
      speakLine(text, { lang: course.speechLang, ...p.voice }).then(() => {
        busyRef.current = false;
        setBusy(false);
      });
    }
  };

  // ---- player actions -------------------------------------------------------
  const sayHi = (pid) => {
    const W_ = W.current;
    const p = W_.people[pid];
    const me = W_.me;
    playDuoSound('connect');
    const id = `g${++W_.gid}`;
    const g = { id, anchor: { x: (me.x + p.x) / 2, y: (me.y + p.y) / 2 }, members: [], phase: 0, nextTalk: performance.now() + 700, lastSpeaker: null, greet: true };
    W_.groups[id] = g;
    addToGroup(g, pid);
    addToGroup(g, 'me');
    talked.current.add(pid);
    setTranscript([]);
    floater(p.x, p.y - 40, '👋');
  };
  const joinGroup = (gid) => {
    const g = W.current.groups[gid];
    if (!g) return;
    playDuoSound('connect');
    addToGroup(g, 'me');
    npcIds(g).forEach((id) => talked.current.add(id));
    g.nextTalk = performance.now() + 700;
    g.greet = true;
    setTranscript([]);
    floater(W.current.me.x, W.current.me.y - 40, '👋');
  };
  const invite = (pid) => {
    const W_ = W.current;
    const g = myGroup();
    if (!g) return;
    const p = W_.people[pid];
    if (p.groupId) {
      const old = W_.groups[p.groupId];
      if (old) {
        old.members = old.members.filter((m) => m !== pid);
        dissolveIfNeeded(old);
      }
    }
    playDuoSound('pop');
    p.mode = 'joining';
    p.groupId = null;
    p.joinGid = g.id;
    floater(p.x, p.y - 40, '💬');
  };
  const mergeWith = (gid) => {
    const W_ = W.current;
    const mine = myGroup();
    const other = W_.groups[gid];
    if (!mine || !other) return;
    playDuoSound('match');
    mine.anchor = { x: (mine.anchor.x + other.anchor.x) / 2, y: (mine.anchor.y + other.anchor.y) / 2 };
    npcIds(other).forEach((id) => {
      addToGroup(mine, id);
      talked.current.add(id);
    });
    delete W_.groups[gid];
    recomputePhase(mine, W_.me);
    floater(mine.anchor.x, mine.anchor.y - 60, 'Groups merged!');
    toastIt('Groups merged');
    mine.nextTalk = performance.now() + 900;
    mine.greet = true;
  };
  const leave = (auto = false) => {
    const g = myGroup();
    if (!g) return;
    playDuoSound('hangup');
    floater(W.current.me.x, W.current.me.y - 40, 'Left');
    removeFromGroup(g, 'me');
    setTranscript([]);
    toastIt(auto ? 'You walked away from the conversation' : 'You left the conversation');
  };

  const userSay = async (line) => {
    const g = myGroup();
    if (!g) {
      toastIt('Walk up to someone first');
      return;
    }
    if (muted) {
      toastIt('Your mic is muted');
      return;
    }
    if (busyRef.current) return;
    playDuoSound('pop');
    busyRef.current = true;
    setBusy(true);
    const now = performance.now();
    const me = W.current.me;
    me.bubble = { text: line.say, until: now + 3800, mine: true };
    setTranscript((t) => [...t.slice(-12), { id: now, who: 'You', me: true, text: line.say, voice: voiceRef.current }]);
    if (voiceRef.current === 'synthetic') {
      await speakLine(line.say, { lang: course.speechLang, pitch: synthVoice.pitch, rate: synthVoice.rate });
    } else {
      await sleep(1100);
    }
    busyRef.current = false;
    setBusy(false);
    const g2 = myGroup();
    if (g2) {
      g2.nextTalk = performance.now() + 500;
      g2.lastSpeaker = 'me';
    }
  };
  const speakNext = () => {
    const line = lines.me[meCursor.current % lines.me.length];
    meCursor.current += 1;
    userSay(line);
  };

  // ---- simulation loop ----------------------------------------------------------
  useEffect(() => {
    let raf;
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const W_ = W.current;
      const me = W_.me;

      // player movement (keys or tap target)
      const k = keys.current;
      let kx = (k.right ? 1 : 0) - (k.left ? 1 : 0);
      let ky = (k.down ? 1 : 0) - (k.up ? 1 : 0);
      me.moving = false;
      if (kx || ky) {
        const l = Math.hypot(kx, ky);
        me.path = null;
        me.moving = tryMove(me, (kx / l) * PLAYER_SPEED * dt, (ky / l) * PLAYER_SPEED * dt);
      } else if (me.path && me.path.length) {
        const wp = me.path[0];
        const dx = wp.x - me.x;
        const dy = wp.y - me.y;
        const d = Math.hypot(dx, dy);
        if (d < 4) me.path.shift();
        else {
          const s = Math.min(d, PLAYER_SPEED * dt);
          me.moving = tryMove(me, (dx / d) * s, (dy / d) * s);
          if (!me.moving) me.path = null;
        }
      }

      // late arrival walks in through the door
      if (W_.lateId && now > W_.lateAt) {
        const p = W_.people[W_.lateId];
        p.mode = 'enter';
        p.tx = 370;
        p.ty = 880;
        W_.lateId = null;
        floater(370, 900, `${p.name} arrived`);
      }

      // NPC movement
      Object.values(W_.people).forEach((p) => {
        let target = null;
        let speed = NPC_SPEED;
        let free = false;
        if (p.mode === 'group') {
          const g = W_.groups[p.groupId];
          if (!g) {
            p.mode = 'wander';
            p.groupId = null;
          } else {
            const idx = npcIds(g).indexOf(p.id);
            target = slotPos(g, idx);
            free = true;
          }
        } else if (p.mode === 'joining') {
          const g = W_.groups[p.joinGid];
          if (!g) {
            p.mode = 'wander';
            p.joinGid = null;
          } else {
            target = g.anchor;
            speed = 95;
            free = true;
            if (dist(p, g.anchor) < slotRadius(g.members.length + 1) + 10) {
              addToGroup(g, p.id);
              floater(p.x, p.y - 40, 'Joined');
              if (g.members.includes('me')) {
                playDuoSound('pop');
                toastIt(`${p.name} joined your conversation`);
                talked.current.add(p.id);
                g.nextTalk = now + 600;
                g.greetBy = p.id;
              }
            }
          }
        } else if (p.mode === 'wander' || p.mode === 'enter') {
          if (p.tx == null || now > p.nextWander + 12000) {
            const t = randomOpenPoint();
            p.tx = t.x;
            p.ty = t.y;
            p.nextWander = now + 3000 + Math.random() * 4000;
          }
          target = { x: p.tx, y: p.ty };
          if (p.mode === 'enter') free = true;
        }
        p.moving = false;
        if (target) {
          const dx = target.x - p.x;
          const dy = target.y - p.y;
          const d = Math.hypot(dx, dy);
          if (d > 2) {
            const s = Math.min(d, speed * dt);
            if (free) {
              p.x += (dx / d) * s;
              p.y += (dy / d) * s;
              p.moving = s > 0.3;
            } else {
              p.moving = tryMove(p, (dx / d) * s, (dy / d) * s);
              if (!p.moving) p.tx = null;
            }
          } else if (p.mode === 'enter') {
            p.mode = 'wander';
            p.tx = null;
          } else if (p.mode === 'wander' && now > p.nextWander) {
            p.tx = null;
          }
        }
        if (p.bubble && now > p.bubble.until) p.bubble = null;
      });
      if (me.bubble && now > me.bubble.until) me.bubble = null;

      // conversations
      Object.values(W_.groups).forEach((g) => {
        const mine = g.members.includes('me');
        if (now < g.nextTalk) return;
        if (mine && busyRef.current) {
          g.nextTalk = now + 500;
          return;
        }
        const npcs = npcIds(g);
        if (!npcs.length) return;
        let speakerId = g.greetBy && npcs.includes(g.greetBy) ? g.greetBy : pick(npcs.filter((id) => id !== g.lastSpeaker).length ? npcs.filter((id) => id !== g.lastSpeaker) : npcs);
        const p = W_.people[speakerId];
        let text;
        let teach = false;
        if (mine && (g.greet || g.greetBy)) text = pick(lines.greet);
        else if (mine && p.learning.EN && teachRef.current.includes('EN') && Math.random() < 0.35) {
          text = pick(lines.teach);
          teach = true;
        } else text = pick(lines.chat);
        g.greet = false;
        g.greetBy = null;
        g.lastSpeaker = speakerId;
        sayNpc(p, text, mine, teach);
        g.nextTalk = now + (mine ? 5200 + Math.random() * 2500 : 3000 + Math.random() * 3500);
      });

      // walking out of range = leaving
      const g = myGroup();
      if (g && dist(me, g.anchor) > LEAVE_R) leave(true);

      // ambient events: people join, merge and drift apart
      if (now > W_.nextEvent) {
        W_.nextEvent = now + 6500 + Math.random() * 5000;
        const freeNpcs = Object.values(W_.people).filter((p) => p.mode === 'wander' || p.mode === 'idle');
        const npcGroups = Object.values(W_.groups).filter((x) => !x.members.includes('me'));
        const mg = myGroup();
        const r = Math.random();
        if (mg && mg.members.length < 5 && freeNpcs.length && r < 0.55) {
          const p = pick(freeNpcs);
          p.mode = 'joining';
          p.joinGid = mg.id;
        } else if (freeNpcs.length && npcGroups.length && r < 0.8) {
          const p = pick(freeNpcs);
          p.mode = 'joining';
          p.joinGid = pick(npcGroups).id;
        } else {
          const big = npcGroups.filter((x) => x.members.length >= 3);
          if (big.length) {
            const gg = pick(big);
            const id = pick(npcIds(gg));
            const p = W_.people[id];
            floater(p.x, p.y - 40, '👋 Bye!');
            removeFromGroup(gg, id);
          }
        }
      }

      W_.floaters = W_.floaters.filter((f) => now - f.born < 1800);

      // camera follows the player
      const panelH = myGroup() ? 318 : 200;
      const midY = (112 + (VIEW_H - panelH)) / 2;
      const cx = Math.max(-20, Math.min(WORLD_W - VIEW_W + 20, me.x - VIEW_W / 2));
      const cy = Math.max(-110, Math.min(WORLD_H - VIEW_H + panelH + 10, me.y - midY));
      W_.cam.x += (cx - W_.cam.x) * 0.12;
      W_.cam.y += (cy - W_.cam.y) * 0.12;

      setFrame((f) => (f + 1) % 1000000);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      stopSpeech();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keyboard movement (arrow keys / WASD) + space to act
  const actionRef = useRef(null);
  useEffect(() => {
    const map = { arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down', arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right' };
    const down = (e) => {
      if (e.target && e.target.tagName === 'INPUT') return;
      const k = map[e.key.toLowerCase()];
      if (k) {
        keys.current[k] = true;
        setHint(false);
        e.preventDefault();
      } else if (e.key === ' ' && actionRef.current) {
        e.preventDefault();
        actionRef.current();
      }
    };
    const up = (e) => {
      if (e.key === ' ' && e.target && e.target.tagName === 'BUTTON') e.preventDefault();
      const k = map[e.key.toLowerCase()];
      if (k) keys.current[k] = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useEffect(() => {
    if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [transcript]);

  const exit = () => {
    stopSpeech();
    playDuoSound('hangup');
    onExit({ people: talked.current.size, seconds: Math.round((Date.now() - startedAt.current) / 1000) });
  };
  exitRef.current = exit;

  const onTap = (e) => {
    const el = viewRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = rect.width / VIEW_W;
    const W_ = W.current;
    const x = (e.clientX - rect.left) / ratio + W_.cam.x;
    const y = (e.clientY - rect.top) / ratio + W_.cam.y;
    W_.me.path = findPath(W_.me, { x: Math.max(20, Math.min(WORLD_W - 20, x)), y: Math.max(20, Math.min(WORLD_H - 20, y)) });
    W_.tap = { x, y, born: performance.now() };
    setHint(false);
  };
  const walkTo = (p) => {
    const W_ = W.current;
    // stand just outside the person (or their group circle), on a walkable spot
    const g = p.groupId && W_.groups[p.groupId];
    const c = g ? g.anchor : p;
    const rr = g ? slotRadius(g.members.length) + 34 : 50;
    let spot = null;
    const base = Math.atan2(W_.me.y - c.y, W_.me.x - c.x);
    for (let k = 0; k < 16 && !spot; k++) {
      const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8);
      const q = { x: c.x + Math.cos(a) * rr, y: c.y + Math.sin(a) * rr };
      if (!blocked(q.x, q.y, 18)) spot = q;
    }
    W_.me.path = findPath(W_.me, spot || { x: c.x, y: c.y + rr });
    setHint(false);
    playDuoSound('pop');
  };

  // ---- derived state for rendering ---------------------------------------------
  const W_ = W.current;
  const me = W_.me;
  const now = performance.now();
  const mg = myGroup();
  const people = Object.values(W_.people).filter((p) => p.mode !== 'offstage');
  let nearest = null;
  people.forEach((p) => {
    if (p.mode === 'enter') return;
    if (mg && (mg.members.includes(p.id) || p.joinGid === mg.id)) return;
    const d = dist(me, p);
    if (d < NEAR_R && (!nearest || d < nearest.d)) nearest = { p, d };
  });
  let nearby = null;
  if (nearest) {
    const p = nearest.p;
    const g = p.groupId && W_.groups[p.groupId] && !W_.groups[p.groupId].members.includes('me') ? W_.groups[p.groupId] : null;
    nearby = g ? { type: 'group', g, people: npcIds(g).map((id) => W_.people[id]) } : { type: 'person', p, people: [p] };
  }
  let primary = null;
  if (nearby) {
    if (!mg && nearby.type === 'person') primary = { label: 'Say hi', run: () => sayHi(nearby.p.id) };
    else if (!mg) primary = { label: 'Join in', run: () => joinGroup(nearby.g.id) };
    else if (nearby.type === 'person') primary = { label: `Invite ${nearby.p.name}`, run: () => invite(nearby.p.id) };
    else primary = { label: 'Merge groups', run: () => mergeWith(nearby.g.id) };
  }
  actionRef.current = primary ? primary.run : null;

  const roleOf = (p) =>
    p.native === code
      ? { label: 'Native', color: '#B38600', bg: '#FFF4CC' }
      : (() => {
          const lv = LEVELS.find((l) => l.id === p.learning[code]);
          return { label: lv.label, color: lv.color, bg: '#F7F7F7' };
        })();
  const canHelp = (p) => Object.keys(p.learning).filter((l) => teaches.includes(l));
  const goodMatch = (p) => p.native === code && canHelp(p).length > 0;

  const myLevel = LEVELS.find((l) => l.id === level);
  const sorted = [...people].sort((a, b) => goodMatch(b) - goodMatch(a));

  const token = (p, isMe = false) => {
    const speaking = !!(p.bubble && now < p.bubble.until);
    const inMine = mg && (isMe || mg.members.includes(p.id));
    const ring = isMe ? C.macaw : p.ring;
    const bob = p.moving ? Math.abs(Math.sin(now / 90)) * -3 : 0;
    return (
      <div key={isMe ? 'me' : p.id} style={{ position: 'absolute', left: p.x - 23, top: p.y - 23 + bob, width: 46, height: 46, zIndex: Math.round(p.y) + 10 }}>
        <div style={{ position: 'absolute', left: 5, top: 38, width: 36, height: 12, borderRadius: '50%', background: 'rgba(60,35,20,.22)' }} />
        {speaking && <div className="speak-ring" style={{ position: 'absolute', inset: -6, borderRadius: '50%', border: `3px solid ${inMine ? C.feather : 'rgba(255,255,255,.8)'}` }} />}
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', overflow: 'hidden', border: `3px solid ${ring}`, background: '#fff', boxShadow: '0 3px 0 rgba(0,0,0,.15)' }}>
          {isMe ? <PeerAvatarSVG preset={avatarPreset} isSpeaking={speaking} viewBox={HEAD_CROP} /> : <AvatarArt person={p} isSpeaking={speaking} crop />}
        </div>
        {!isMe && goodMatch(p) && (
          <div style={{ position: 'absolute', right: -6, top: -6, width: 20, height: 20, borderRadius: 10, background: C.bee, border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Star className="w-3 h-3" fill="#fff" color="#fff" />
          </div>
        )}
        {p.idleEmoji && p.mode === 'idle' && <div style={{ position: 'absolute', left: -12, top: -8, fontSize: 16 }}>{p.idleEmoji}</div>}
        <div
          style={{
            position: 'absolute',
            top: 50,
            left: '50%',
            transform: 'translateX(-50%)',
            whiteSpace: 'nowrap',
            fontSize: 11,
            fontWeight: 900,
            padding: '1px 7px',
            borderRadius: 8,
            background: isMe ? C.macaw : 'rgba(255,255,255,.95)',
            color: isMe ? '#fff' : C.eel,
            boxShadow: '0 2px 0 rgba(0,0,0,.1)'
          }}
        >
          {isMe ? 'You' : p.name}
          {!isMe && <span style={{ marginLeft: 3 }}>{p.native === code ? LANGS[code].flag : ''}</span>}
        </div>
      </div>
    );
  };

  const bubble = (p, isMe = false) => {
    if (!p.bubble || now > p.bubble.until) return null;
    const { main } = splitSub(p.bubble.text);
    const mine = p.bubble.mine;
    return (
      <div key={`b-${isMe ? 'me' : p.id}`} style={{ position: 'absolute', left: p.x, top: p.y - 34, transform: 'translate(-50%, -100%)', zIndex: 5000 }}>
      <div
        className="pop-in"
        style={{
          maxWidth: 170,
          width: 'max-content',
          padding: '6px 9px',
          borderRadius: 14,
          background: '#fff',
          border: `2px solid ${p.bubble.teach ? C.bee : mine ? C.blueJay : C.swan}`,
          fontSize: 12,
          fontWeight: 800,
          lineHeight: 1.25,
          color: C.eel,
          opacity: mine ? 1 : 0.6,
          boxShadow: '0 3px 0 rgba(0,0,0,.08)'
        }}
      >
        <div style={{ display: '-webkit-box', WebkitLineClamp: mine ? 3 : 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{main}</div>
      </div>
      </div>
    );
  };

  const groupCircle = (g) => {
    const mine = g.members.includes('me');
    const r = slotRadius(g.members.length) + 30;
    return (
      <div
        key={`gc-${g.id}`}
        style={{
          position: 'absolute',
          left: g.anchor.x - r,
          top: g.anchor.y - r,
          width: r * 2,
          height: r * 2,
          borderRadius: '50%',
          background: mine ? 'rgba(88,204,2,.16)' : 'rgba(255,255,255,.22)',
          border: `3px dashed ${mine ? 'rgba(88,167,0,.6)' : 'rgba(255,255,255,.75)'}`,
          transition: 'all .4s ease',
          zIndex: 2
        }}
      />
    );
  };

  const capsule = (text, color, bg) => (
    <span style={{ fontSize: 11, fontWeight: 900, color, background: bg, padding: '2px 7px', borderRadius: 8, whiteSpace: 'nowrap' }}>{text}</span>
  );

  const personCard = (p) => {
    const role = roleOf(p);
    const helps = canHelp(p);
    return (
      <div key={p.id} className="flex items-center gap-2.5">
        <div style={{ width: 44, height: 44, borderRadius: 22, overflow: 'hidden', border: `3px solid ${p.ring}`, flexShrink: 0 }}>
          <AvatarArt person={p} crop />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="flex items-center gap-1.5">
            <span style={{ fontSize: 16, fontWeight: 900, color: C.eel }}>{p.name}</span>
            {capsule(p.native === code ? `${LANGS[code].flag} Native` : role.label, role.color, role.bg)}
          </div>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.wolf, marginTop: 1 }}>
            {helps.length ? (
              <span style={{ color: '#B38600' }}>
                ★ Learning {helps.map((l) => `${LANGS[l].flag} ${LANGS[l].name}`).join(', ')} · you can help
              </span>
            ) : (
              `Speaks ${LANGS[p.native].flag} ${LANGS[p.native].name}`
            )}
          </div>
        </div>
      </div>
    );
  };

  // ---- render --------------------------------------------------------------------
  const tapAge = W_.tap ? now - W_.tap.born : 9999;
  const myNpcs = mg ? npcIds(mg).map((id) => W_.people[id]) : [];
  const joiningMine = mg ? people.filter((p) => p.mode === 'joining' && p.joinGid === mg.id) : [];

  return (
    <div className="absolute inset-0 fade-in" style={{ zIndex: 30, background: '#2E2018' }}>
      <div ref={viewRef} onPointerDown={onTap} style={{ position: 'absolute', inset: 0, overflow: 'hidden', cursor: 'pointer', touchAction: 'none' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: WORLD_W, height: WORLD_H, transform: `translate(${-W_.cam.x}px, ${-W_.cam.y}px)` }}>
          <RoomArt />
          {Object.values(W_.groups).map(groupCircle)}
          <div
            style={{
              position: 'absolute',
              left: me.x - NEAR_R,
              top: me.y - NEAR_R,
              width: NEAR_R * 2,
              height: NEAR_R * 2,
              borderRadius: '50%',
              border: `2px dashed ${nearby ? 'rgba(28,176,246,.8)' : 'rgba(28,176,246,.35)'}`,
              background: nearby ? 'rgba(28,176,246,.08)' : 'transparent',
              zIndex: 3,
              pointerEvents: 'none'
            }}
          />
          {tapAge < 600 && (
            <div
              style={{
                position: 'absolute',
                left: W_.tap.x - 14,
                top: W_.tap.y - 8,
                width: 28,
                height: 16,
                borderRadius: '50%',
                border: `3px solid ${C.macaw}`,
                opacity: 1 - tapAge / 600,
                transform: `scale(${1 + tapAge / 600})`,
                zIndex: 4
              }}
            />
          )}
          {people.map((p) => token(p))}
          {token(me, true)}
          {people.map((p) => bubble(p))}
          {bubble(me, true)}
          {W_.floaters.map((f, i) => {
            const age = (now - f.born) / 1800;
            return (
              <div
                key={`f-${i}-${f.born}`}
                style={{
                  position: 'absolute',
                  left: f.x,
                  top: f.y - age * 40,
                  transform: 'translateX(-50%)',
                  opacity: 1 - age,
                  zIndex: 6000,
                  fontSize: 13,
                  fontWeight: 900,
                  color: '#fff',
                  textShadow: '0 2px 0 rgba(0,0,0,.35)',
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none'
                }}
              >
                {f.text}
              </div>
            );
          })}
        </div>
      </div>

      {/* Top HUD */}
      <div className="absolute inset-x-0 flex items-start justify-between gap-2" style={{ top: 56, padding: '0 14px', zIndex: 40, pointerEvents: 'none' }}>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={exit}
          aria-label="Leave room"
          className="duo-btn duo-white flex items-center justify-center"
          style={{ width: 44, height: 44, color: C.wolf, pointerEvents: 'auto', borderRadius: 14 }}
        >
          <X className="w-5 h-5" strokeWidth={3} />
        </button>
        <div className="flex-1 bg-white rounded-2xl px-3 py-1.5" style={{ border: `2px solid ${C.swan}`, boxShadow: `0 3px 0 ${C.swan}`, pointerEvents: 'auto' }} onPointerDown={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1.5" style={{ fontSize: 14, fontWeight: 900, color: C.eel }}>
            Cozy Living Room
            <span className="super-chip">SUPER</span>
          </div>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.wolf }}>
            {LANGS[code].flag} {LANGS[code].name} · {people.length} people here · you're {myLevel.label}
          </div>
        </div>
      </div>

      {hint && (
        <div className="absolute rise-in" style={{ top: 116, left: 14, right: 14, zIndex: 40, pointerEvents: 'none' }}>
          <div className="mx-auto rounded-2xl px-3 py-2 text-white text-center" style={{ background: 'rgba(19,31,36,.85)', fontSize: 13, fontWeight: 800 }}>
            Tap the floor to walk. Get close to someone to start talking.
          </div>
        </div>
      )}

      {toast && (
        <div className="absolute inset-x-0 flex justify-center pointer-events-none" style={{ bottom: mg ? 336 : 216, zIndex: 60 }}>
          <div className="pop-in whitespace-nowrap text-white" style={{ background: C.eel, padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 900 }}>
            {toast}
          </div>
        </div>
      )}

      {/* Bottom panel */}
      <div
        className="absolute inset-x-0 bottom-0 bg-white"
        onPointerDown={(e) => e.stopPropagation()}
        style={{ zIndex: 50, borderRadius: '28px 28px 0 0', padding: '14px 16px 30px', boxShadow: '0 -6px 24px rgba(0,0,0,.18)' }}
      >
        {!mg && !nearby && (
          <div>
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.06em', textTransform: 'uppercase', color: C.hare }}>Who's here</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#B38600' }}>★ good match for you</span>
            </div>
            <div className="flex gap-2.5 overflow-x-auto no-scrollbar mt-2 -mx-4 px-4 pb-1">
              {sorted.map((p) => (
                <button
                  key={p.id}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    walkTo(p);
                  }}
                  className="shrink-0 flex flex-col items-center gap-1"
                  style={{ width: 58 }}
                >
                  <div style={{ position: 'relative', width: 50, height: 50 }}>
                    <div style={{ width: 50, height: 50, borderRadius: 25, overflow: 'hidden', border: `3px solid ${p.ring}` }}>
                      <AvatarArt person={p} crop />
                    </div>
                    {goodMatch(p) && (
                      <span style={{ position: 'absolute', right: -3, top: -3, width: 18, height: 18, borderRadius: 9, background: C.bee, border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Star className="w-2.5 h-2.5" fill="#fff" color="#fff" />
                      </span>
                    )}
                    {p.groupId && <span style={{ position: 'absolute', left: -3, bottom: -2, fontSize: 12 }}>💬</span>}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 900, color: C.eel }}>{p.name}</span>
                </button>
              ))}
            </div>
            <p style={{ fontSize: 12, fontWeight: 700, color: C.wolf, marginTop: 6 }}>Tap someone to walk over, or tap the floor.</p>
          </div>
        )}

        {!mg && nearby && (
          <div className="rise-in" key={nearby.type === 'group' ? nearby.g.id : nearby.p.id}>
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.06em', textTransform: 'uppercase', color: C.hare }}>
              {nearby.type === 'group' ? `Conversation · ${nearby.people.length} people` : 'Nearby'}
            </div>
            <div className="mt-2 space-y-2">{nearby.people.slice(0, 2).map(personCard)}</div>
            {nearby.people.length > 2 && <div style={{ fontSize: 12, fontWeight: 800, color: C.wolf, marginTop: 4 }}>+{nearby.people.length - 2} more</div>}
            <button className="duo-btn duo-green w-full mt-3 flex items-center justify-center gap-2" style={{ height: 50, fontSize: 15 }} onClick={primary.run}>
              <MessageCircle className="w-5 h-5" strokeWidth={3} /> {primary.label}
            </button>
          </div>
        )}

        {mg && (
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                {myNpcs.map((p, i) => {
                  const speaking = !!(p.bubble && now < p.bubble.until);
                  return (
                    <div
                      key={p.id}
                      title={p.name}
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 17,
                        overflow: 'hidden',
                        border: `3px solid ${speaking ? C.feather : '#fff'}`,
                        marginLeft: i ? -8 : 0,
                        boxShadow: `0 0 0 2px ${speaking ? C.seaSponge : C.swan}`,
                        background: '#fff',
                        zIndex: 10 - i
                      }}
                    >
                      <AvatarArt person={p} crop />
                    </div>
                  );
                })}
                <span style={{ fontSize: 14, fontWeight: 900, color: C.eel, marginLeft: 10 }}>
                  {myNpcs.length === 1 ? `You & ${myNpcs[0].name}` : `You + ${myNpcs.length} people`}
                </span>
              </div>
              <span className="flex items-center gap-1" style={{ fontSize: 11, fontWeight: 900, color: C.featherDark }}>
                <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: C.feather }} /> LIVE
              </span>
            </div>
            {joiningMine.length > 0 && (
              <div style={{ fontSize: 12, fontWeight: 800, color: C.macaw, marginTop: 4 }}>{joiningMine.map((p) => p.name).join(', ')} is walking over…</div>
            )}

            <div ref={transcriptRef} className="no-scrollbar space-y-1.5" style={{ height: 96, overflowY: 'auto', marginTop: 8 }}>
              {transcript.length === 0 && <div style={{ fontSize: 13, fontWeight: 700, color: C.hare, paddingTop: 30, textAlign: 'center' }}>Say hello!</div>}
              {transcript.map((l) => {
                const { main, sub } = splitSub(l.text);
                return (
                  <div key={l.id} className="rise-in" style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, color: C.eel }}>
                    <span style={{ fontWeight: 900, color: l.me ? C.macaw : l.color }}>{l.who}: </span>
                    {main}
                    {sub && <span style={{ color: C.hare }}> — {sub}</span>}
                    {l.teach && <span style={{ marginLeft: 6 }}>{capsule('★ You can help!', '#B38600', '#FFF4CC')}</span>}
                  </div>
                );
              })}
            </div>

            {nearby && primary && (
              <div className="flex items-center gap-2 mt-2 p-2 rounded-xl" style={{ background: C.iguana, border: `2px solid ${C.blueJay}` }}>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 800, color: C.humpback }}>
                  {nearby.type === 'group' ? `${nearby.people.map((p) => p.name).join(', ')} are nearby` : `${nearby.p.name} is nearby`}
                </span>
                <button className="duo-btn duo-blue px-3" style={{ height: 34, fontSize: 12, borderRadius: 12 }} onClick={primary.run}>
                  {primary.label}
                </button>
              </div>
            )}

            <div className="flex gap-2 overflow-x-auto no-scrollbar mt-2 -mx-4 px-4 pb-1">
              {lines.me.map((l) => (
                <button
                  key={l.label}
                  disabled={busy}
                  onClick={() => userSay(l)}
                  className="shrink-0 rounded-xl border-2"
                  style={{ padding: '6px 10px', fontSize: 12, fontWeight: 800, borderColor: C.swan, boxShadow: `0 3px 0 ${C.swan}`, color: busy ? C.hare : C.eel, background: '#fff' }}
                >
                  {l.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 mt-3">
              <button
                className={`duo-btn flex items-center justify-center ${muted ? 'duo-red' : 'duo-white'}`}
                style={{ width: 48, height: 48, color: muted ? '#fff' : C.eel }}
                onClick={() => {
                  playDuoSound('pop');
                  setMuted((m) => !m);
                }}
                aria-label={muted ? 'Unmute' : 'Mute'}
              >
                {muted ? <MicOff className="w-5 h-5" strokeWidth={2.5} /> : <Mic className="w-5 h-5" strokeWidth={2.5} />}
              </button>
              <button
                className="duo-btn duo-white flex items-center justify-center"
                style={{
                  width: 48,
                  height: 48,
                  color: voice === 'synthetic' ? C.macaw : C.eel,
                  background: voice === 'synthetic' ? C.iguana : '#fff',
                  borderColor: voice === 'synthetic' ? C.blueJay : C.swan,
                  boxShadow: `0 4px 0 ${voice === 'synthetic' ? C.blueJay : C.swan}`
                }}
                onClick={() => {
                  const next = voice === 'synthetic' ? 'real' : 'synthetic';
                  setVoice(next);
                  playDuoSound('pop');
                  toastIt(next === 'real' ? 'Real voice on' : `Synthetic voice on · ${synthVoice.label}`);
                }}
                aria-label="Switch voice"
              >
                <AudioLines className="w-5 h-5" strokeWidth={2.5} />
              </button>
              <button className={`duo-btn flex-1 flex items-center justify-center gap-2 ${busy ? 'duo-disabled' : 'duo-green'}`} style={{ height: 48, fontSize: 14 }} disabled={busy} onClick={speakNext}>
                <Mic className="w-5 h-5" strokeWidth={3} /> Speak
              </button>
              <button className="duo-btn duo-red flex items-center justify-center gap-1.5 px-3" style={{ height: 48, fontSize: 13 }} onClick={() => leave(false)}>
                <PhoneOff className="w-5 h-5" strokeWidth={2.5} /> Leave
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ==========================================================================
   APP
   ========================================================================== */
export default function App() {
  // Navigation
  const [courseIdx, setCourseIdx] = useState(0);
  const [tab, setTab] = useState('connect'); // learn | connect | safety | profile
  const [panelOpen, setPanelOpen] = useState(true);
  const [scale, setScale] = useState(1);

  // Call identity (the privacy defaults)
  const [avatarPreset, setAvatarPreset] = useState(2);
  const [faceVisible, setFaceVisible] = useState(false); // face hidden by default
  const [voiceMode, setVoiceMode] = useState('synthetic'); // 'synthetic' | 'real'
  const [synthVoiceId, setSynthVoiceId] = useState('warm');
  const [sheet, setSheet] = useState(null); // null | 'precall' | 'edit'

  // Call flow
  const [phase, setPhase] = useState('idle'); // idle | ringing | matching | matched | call | recap
  const [mode, setMode] = useState(null); // 'lily' | 'peer'
  const [peerIdx, setPeerIdx] = useState(0);
  const [matchStep, setMatchStep] = useState(0);
  const [isSkip, setIsSkip] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState([]);
  const [partnerSpeaking, setPartnerSpeaking] = useState(false);
  const [meSpeaking, setMeSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [input, setInput] = useState('');
  const [stats, setStats] = useState({ turns: 0, phrases: 0, blocked: 0 });
  const [rating, setRating] = useState(null);
  const [toast, setToast] = useState(null);

  // Connect Rooms (Super)
  const [subscribed, setSubscribed] = useState(false);
  const [roomStep, setRoomStep] = useState(null); // null | 'paywall' | 'setup'
  const [inRoom, setInRoom] = useState(false);
  const [roomLevel, setRoomLevel] = useState('intermediate');
  const [roomTeaches, setRoomTeaches] = useState(['EN', 'KO']);
  const roomExitRef = useRef(null);

  const course = COURSES[courseIdx];
  const peer = course.peers[peerIdx % course.peers.length];
  const synthVoice = SYNTH_VOICES.find((v) => v.id === synthVoiceId);
  const inCallFlow = ['ringing', 'matching', 'matched', 'call', 'recap'].includes(phase);

  const callToken = useRef(0);
  const topicCursor = useRef(0);
  const timers = useRef([]);
  const toastTimer = useRef(null);
  const transcriptRef = useRef(null);

  // ---- helpers -------------------------------------------------------------
  const later = (fn, ms) => {
    const id = setTimeout(fn, ms);
    timers.current.push(id);
    return id;
  };
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  };
  const pushLine = (line) => setTranscript((t) => [...t, { id: Date.now() + Math.random(), ...line }]);
  const partnerVoice = () =>
    mode === 'lily' ? { pitch: 0.8, rate: 0.95 } : peer.voice || { pitch: 1, rate: 1 };
  const topics = () => (mode === 'lily' ? course.lilyTopics : peer.topics);
  const nextTopic = () => {
    const list = topics();
    const t = list[topicCursor.current % list.length];
    topicCursor.current += 1;
    return t;
  };

  // ---- responsive phone scaling -------------------------------------------
  useEffect(() => {
    const fit = () => {
      const byH = (window.innerHeight - 40) / PHONE_H;
      const byW = (window.innerWidth - 24) / PHONE_W;
      setScale(Math.min(1, byH, byW));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  // Load TTS voices early (Chrome populates asynchronously)
  useEffect(() => {
    try {
      window.speechSynthesis && window.speechSynthesis.getVoices();
    } catch (e) {}
  }, []);

  // ---- call timer ------------------------------------------------------------
  useEffect(() => {
    if (phase !== 'call') return undefined;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // keep transcript scrolled to newest line
  useEffect(() => {
    if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [transcript, listening]);

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // ---- partner line -----------------------------------------------------------
  const partnerSays = async (text, tip, token, who = mode) => {
    pushLine({ who: 'them', text, tip });
    if (tip) setStats((s) => ({ ...s, phrases: s.phrases + 1 }));
    setPartnerSpeaking(true);
    const voice = who === 'lily' ? { pitch: 0.8, rate: 0.95 } : partnerVoice();
    await speakLine(text, { lang: course.speechLang, ...voice });
    if (callToken.current === token) setPartnerSpeaking(false);
  };

  // ---- start flows -------------------------------------------------------------
  const resetCall = () => {
    clearTimers();
    stopSpeech();
    setTranscript([]);
    setSeconds(0);
    setStats({ turns: 0, phrases: 0, blocked: 0 });
    setPartnerSpeaking(false);
    setMeSpeaking(false);
    setListening(false);
    setBusy(false);
    setMuted(false);
    setKeyboardOpen(false);
    setRating(null);
    topicCursor.current = 0;
  };

  const startLily = () => {
    resetCall();
    const token = ++callToken.current;
    setSheet(null);
    setMode('lily');
    setPhase('ringing');
    playDuoSound('ring');
    later(() => playDuoSound('ring'), 1100);
    later(() => {
      if (callToken.current !== token) return;
      playDuoSound('connect');
      setPhase('call');
      later(() => partnerSays(course.lilyGreeting, null, token, 'lily'), 450);
    }, 2000);
  };

  const runMatching = (nextIdx, skip) => {
    const token = ++callToken.current;
    setMode('peer');
    setIsSkip(skip);
    setPeerIdx(nextIdx);
    setMatchStep(0);
    setPhase('matching');
    const step = skip ? 280 : 520;
    [1, 2, 3, 4].forEach((n) =>
      later(() => {
        if (callToken.current === token) setMatchStep(n);
      }, step * n)
    );
    later(() => {
      if (callToken.current !== token) return;
      playDuoSound('match');
      setPhase('matched');
    }, step * 4 + 450);
    later(() => {
      if (callToken.current !== token) return;
      playDuoSound('connect');
      setPhase('call');
      const p = course.peers[nextIdx % course.peers.length];
      later(() => {
        if (callToken.current !== token) return;
        pushLine({ who: 'them', text: p.greeting });
        setPartnerSpeaking(true);
        speakLine(p.greeting, { lang: course.speechLang, ...(p.voice || {}) }).then(() => {
          if (callToken.current === token) setPartnerSpeaking(false);
        });
      }, 450);
    }, step * 4 + 2100);
  };

  const startPeerMatch = () => {
    resetCall();
    setSheet(null);
    runMatching(0, false);
  };

  const nextPartner = () => {
    if (phase !== 'call' || mode !== 'peer') return;
    stopSpeech();
    clearTimers();
    setTranscript([]);
    setSeconds(0);
    setPartnerSpeaking(false);
    setMeSpeaking(false);
    setBusy(false);
    topicCursor.current = 0;
    playDuoSound('pop');
    runMatching((peerIdx + 1) % course.peers.length, true);
  };

  const hangUp = () => {
    if (!inCallFlow || phase === 'recap') return;
    playDuoSound('hangup');
    setToast(null);
    callToken.current += 1;
    clearTimers();
    stopSpeech();
    setPartnerSpeaking(false);
    setMeSpeaking(false);
    setListening(false);
    setBusy(false);
    if (phase === 'call' && stats.turns > 0) setPhase('recap');
    else {
      setPhase('idle');
      setMode(null);
    }
  };

  const closeRecap = () => {
    playDuoSound('pop');
    setPhase('idle');
    setMode(null);
  };

  // ---- the user speaks -----------------------------------------------------------
  const userSays = async (text, topic) => {
    if (phase !== 'call') return;
    if (muted) {
      showToast('Your mic is muted');
      return;
    }
    const token = callToken.current;

    // Duo Guardian: catch personal info before it reaches a real person
    if (mode === 'peer') {
      const redaction = redactPII(text);
      if (redaction) {
        playDuoSound('block');
        pushLine({ who: 'me', segments: redaction.segments });
        pushLine({
          who: 'guard',
          text: `Duo Guardian muted ${redaction.count === 1 ? 'personal info' : `${redaction.count} pieces of personal info`} before ${peer.name} could hear it.`
        });
        setStats((s) => ({ ...s, blocked: s.blocked + redaction.count }));
        showToast('Personal info blocked');
        return;
      }
    }

    if (busy) return;
    playDuoSound('pop');
    setBusy(true);
    pushLine({ who: 'me', text, voice: mode === 'peer' ? voiceMode : null });
    setStats((s) => ({ ...s, turns: s.turns + 1 }));
    setMeSpeaking(true);
    if (mode === 'peer' && voiceMode === 'synthetic') {
      // Demo what the partner hears: your words in the synthetic voice
      await speakLine(text, { lang: course.speechLang, pitch: synthVoice.pitch, rate: synthVoice.rate });
    } else {
      await sleep(900);
    }
    if (callToken.current !== token) return;
    setMeSpeaking(false);
    await sleep(350);
    if (callToken.current !== token) return;
    const t = topic || nextTopic();
    await partnerSays(t.reply, t.tip, token);
    if (callToken.current === token) setBusy(false);
  };

  const onTopicChip = (t) => {
    if (busy) return;
    topicCursor.current += 1;
    userSays(t.userSay, t);
  };

  const onSpeakPress = () => {
    if (phase !== 'call' || busy || listening) return;
    if (muted) {
      showToast('Your mic is muted');
      return;
    }
    playDuoSound('pop');
    const scripted = nextTopic();
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const finishWith = (heard) => {
      setListening(false);
      userSays(heard || scripted.userSay, scripted);
    };
    if (SpeechRec) {
      try {
        const rec = new SpeechRec();
        rec.lang = course.speechLang;
        rec.interimResults = false;
        let handled = false;
        const done = (heard) => {
          if (handled) return;
          handled = true;
          finishWith(heard);
        };
        rec.onresult = (e) => done(e.results[0][0].transcript);
        rec.onerror = () => done(null);
        rec.onend = () => done(null);
        setListening(true);
        rec.start();
        later(() => {
          try {
            rec.stop();
          } catch (e) {}
        }, 4500);
        return;
      } catch (e) {
        // fall through to simulated capture
      }
    }
    setListening(true);
    later(() => finishWith(null), 1100);
  };

  const onTypedSubmit = (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput('');
    userSays(text);
  };

  const triggerGuardianDemo = () => {
    if (phase !== 'call' || mode !== 'peer') {
      showToast('Start a call with a real person first');
      return;
    }
    userSays(course.guardDemo);
  };

  const toggleVoiceInCall = () => {
    const next = voiceMode === 'synthetic' ? 'real' : 'synthetic';
    setVoiceMode(next);
    playDuoSound('pop');
    showToast(next === 'real' ? `${peer.name} now hears your real voice` : `Synthetic voice on · ${synthVoice.label}`);
  };

  const previewVoice = (v) => {
    playDuoSound('pop');
    speakLine(course.voicePreview, { lang: course.speechLang, pitch: v.pitch, rate: v.rate });
  };

  const switchCourse = (idx) => {
    if (inCallFlow || inRoom) return;
    playDuoSound('pop');
    setCourseIdx(idx);
    setPeerIdx(0);
  };

  // ---- presenter keyboard shortcuts ---------------------------------------------
  const keyRef = useRef({});
  // ---- Connect Rooms flow ----------------------------------------------------------
  const openRooms = () => {
    if (phase !== 'idle' || inRoom) return;
    playDuoSound('pop');
    setTab('connect');
    setSheet(null);
    setRoomStep(subscribed ? 'setup' : 'paywall');
  };
  const startTrial = () => {
    playDuoSound('match');
    setSubscribed(true);
    setRoomStep('setup');
    showToast('Welcome to Super!');
  };
  const enterRoom = () => {
    playDuoSound('connect');
    setRoomStep(null);
    setInRoom(true);
  };
  const exitRoom = ({ people, seconds }) => {
    setInRoom(false);
    roomExitRef.current = null;
    showToast(people ? `You talked with ${people} ${people === 1 ? 'person' : 'people'} · ${fmt(seconds)}` : 'See you next time!');
  };

  keyRef.current = { phase, mode, sheet, startLily, startPeerMatch, hangUp, nextPartner, triggerGuardianDemo, switchCourse, closeRecap, inRoom, roomStep, openRooms };
  useEffect(() => {
    const onKey = (e) => {
      const k = keyRef.current;
      const key = e.key.toLowerCase();
      const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
      if (typing && key !== 'escape') return;
      if (k.inRoom) {
        if (key === 'escape' && roomExitRef.current) roomExitRef.current();
        else if (key === 'h') setPanelOpen((o) => !o);
        return;
      }
      if (key === 'escape') {
        if (k.roomStep) setRoomStep(null);
        else if (k.sheet) setSheet(null);
        else if (k.phase === 'recap') k.closeRecap();
        else k.hangUp();
      } else if (key === 'l' && k.phase === 'idle' && !k.roomStep) k.startLily();
      else if (key === 'p' && k.phase === 'idle') {
        playDuoSound('pop');
        setTab('connect');
        setSheet('precall');
      } else if (key === 'r' && k.phase === 'idle') k.openRooms();
      else if (key === 'u') {
        setSubscribed(false);
        showToast('Paywall reset');
      } else if (key === 'g') k.triggerGuardianDemo();
      else if (key === 'n') k.nextPartner();
      else if (key === 'h') setPanelOpen((o) => !o);
      else if (['1', '2', '3'].includes(key) && k.phase === 'idle') k.switchCourse(Number(key) - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const goTab = (t) => {
    playDuoSound('pop');
    setTab(t);
  };

  /* ========================================================================
     RENDER: SCREENS
     ======================================================================== */
  const darkStatus = phase === 'matching' || phase === 'matched' || phase === 'ringing' || inRoom;

  const StatusBar = () => (
    <div
      className="absolute top-0 inset-x-0 h-[50px] z-[60] flex items-center justify-between px-8 pointer-events-none"
      style={{ color: darkStatus ? '#fff' : '#000' }}
    >
      <span className="text-[15px] font-extrabold tracking-tight">9:41</span>
      <div className="absolute left-1/2 -translate-x-1/2 top-[11px] w-[120px] h-[34px] rounded-full bg-black" />
      <span className="flex items-center gap-1.5">
        <Signal className="w-4 h-4" strokeWidth={2.75} />
        <Wifi className="w-4 h-4" strokeWidth={2.75} />
        <BatteryFull className="w-6 h-6" strokeWidth={2} />
      </span>
    </div>
  );

  const TopStats = () => (
    <header className="pt-[54px] px-4 pb-2.5 flex items-center justify-between bg-white border-b-2 shrink-0" style={{ borderColor: C.swan }}>
      <button
        onClick={() => switchCourse((courseIdx + 1) % COURSES.length)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-xl hover:bg-[#F7F7F7] transition"
        title="Switch course"
      >
        <span className="text-[22px] leading-none">{course.flag}</span>
      </button>
      <span className="flex items-center gap-1 font-black text-[15px]" style={{ color: C.fox }}>
        <Flame className="w-5 h-5" fill={C.fox} strokeWidth={0} /> 365
      </span>
      <span className="flex items-center gap-1 font-black text-[15px]" style={{ color: C.macaw }}>
        <Gem className="w-5 h-5" fill={C.macaw} strokeWidth={0} /> 1,420
      </span>
      <span className="flex items-center gap-1 font-black text-[15px]" style={{ color: C.cardinal }}>
        <Heart className="w-5 h-5" fill={C.cardinal} strokeWidth={0} /> 5
      </span>
    </header>
  );

  const NavBar = () => {
    const items = [
      { id: 'learn', icon: Home, label: 'Learn' },
      { id: 'connect', icon: Users, label: 'Connect', dot: true },
      { id: 'safety', icon: Shield, label: 'Safety' },
      { id: 'profile', icon: User, label: 'Profile' }
    ];
    return (
      <nav className="px-3 pt-2 pb-7 border-t-2 bg-white flex items-center justify-around shrink-0" style={{ borderColor: C.swan }}>
        {items.map(({ id, icon: Icon, label, dot }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => goTab(id)}
              aria-label={label}
              className="relative w-[64px] h-[48px] rounded-xl flex flex-col items-center justify-center gap-0.5 border-2 transition"
              style={{
                background: active ? C.iguana : 'transparent',
                borderColor: active ? C.blueJay : 'transparent',
                color: active ? C.macaw : C.hare
              }}
            >
              <Icon className="w-6 h-6" strokeWidth={2.5} />
              <span className="text-[10px] font-black uppercase tracking-wide">{label}</span>
              {dot && !active && <span className="absolute top-1 right-3 w-2.5 h-2.5 rounded-full border-2 border-white" style={{ background: C.cardinal }} />}
            </button>
          );
        })}
      </nav>
    );
  };

  const IdentitySummary = ({ compact }) => (
    <div className={`duo-card ${compact ? 'p-3' : 'p-3.5'}`}>
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0" style={{ background: AVATAR_BG[avatarPreset] }}>
          <PeerAvatarSVG preset={avatarPreset} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-black uppercase tracking-wider" style={{ color: C.hare }}>
            How others see &amp; hear you
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1">
            <span
              className="inline-flex items-center gap-1 text-[12px] font-extrabold px-2 py-0.5 rounded-lg"
              style={{ background: faceVisible ? '#FFF0D9' : C.seaSponge, color: faceVisible ? '#CC7800' : C.featherDark }}
            >
              {faceVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              {faceVisible ? 'Face visible' : 'Face hidden'}
            </span>
            <span
              className="inline-flex items-center gap-1 text-[12px] font-extrabold px-2 py-0.5 rounded-lg"
              style={{ background: C.iguana, color: C.macawDark }}
            >
              <AudioLines className="w-3.5 h-3.5" />
              {voiceMode === 'synthetic' ? `Synthetic · ${synthVoice.label}` : 'Real voice'}
            </span>
          </div>
        </div>
        <button
          onClick={() => {
            playDuoSound('pop');
            setSheet('edit');
          }}
          className="text-[13px] font-black uppercase tracking-wide px-1"
          style={{ color: C.macaw }}
        >
          Edit
        </button>
      </div>
    </div>
  );

  const ConnectTab = () => (
    <div className="px-4 pt-4 pb-6 space-y-4">
      <div className="rounded-2xl p-4 text-white relative overflow-hidden" style={{ background: C.feather, boxShadow: `0 4px 0 ${C.featherDark}` }}>
        <div className="text-[12px] font-black uppercase tracking-wider opacity-90">{course.name} · Speaking practice</div>
        <h1 className="text-[22px] font-black leading-tight mt-0.5">Duolingo Connect</h1>
        <p className="text-[14px] font-bold opacity-95 mt-1 pr-6 leading-snug">Talk with Lily or a real learner. Your avatar does the talking.</p>
      </div>

      {/* Option 1 — Lily */}
      <div className="duo-card duo-card-press p-4" onClick={startLily}>
        <div className="flex items-center gap-3.5">
          <div className="w-[76px] h-[76px] rounded-2xl overflow-hidden shrink-0 border-2" style={{ borderColor: '#E6DEFF' }}>
            <LilyAvatarSVG isCardIcon />
          </div>
          <div className="flex-1 min-w-0">
            <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wider" style={{ color: C.beetle }}>
              <Bot className="w-3.5 h-3.5" /> AI · Always available
            </span>
            <h2 className="text-[19px] font-black leading-tight mt-0.5" style={{ color: C.eel }}>
              Talk with Lily
            </h2>
            <p className="text-[13px] font-bold leading-snug mt-0.5" style={{ color: C.wolf }}>
              Low-pressure practice. Real slang, natural speed, no judgment.
            </p>
          </div>
        </div>
        <button
          className="duo-btn duo-purple w-full mt-4 py-3 text-[14px]"
          onClick={(e) => {
            e.stopPropagation();
            startLily();
          }}
        >
          Call Lily
        </button>
      </div>

      {/* Option 2 — Real person */}
      <div
        className="duo-card duo-card-press p-4"
        onClick={() => {
          playDuoSound('pop');
          setSheet('precall');
        }}
      >
        <div className="flex items-center gap-3.5">
          <div className="relative w-[76px] h-[76px] shrink-0">
            <div className="absolute left-0 top-0 w-[54px] h-[54px] rounded-xl overflow-hidden border-2 border-white" style={{ background: AVATAR_BG[0] }}>
              <PeerAvatarSVG preset={0} />
            </div>
            <div className="absolute right-0 bottom-0 w-[54px] h-[54px] rounded-xl overflow-hidden border-2 border-white" style={{ background: AVATAR_BG[1] }}>
              <PeerAvatarSVG preset={1} />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider" style={{ color: C.featherDark }}>
              <span className="relative flex w-2 h-2">
                <span className="absolute inline-flex w-full h-full rounded-full opacity-75 animate-ping" style={{ background: C.feather }} />
                <span className="relative inline-flex w-2 h-2 rounded-full" style={{ background: C.feather }} />
              </span>
              42,810 learners online
            </span>
            <h2 className="text-[19px] font-black leading-tight mt-0.5" style={{ color: C.eel }}>
              Talk with a real person
            </h2>
            <p className="text-[13px] font-bold leading-snug mt-0.5" style={{ color: C.wolf }}>
              Get matched with a learner or native speaker. Your face stays hidden.
            </p>
          </div>
        </div>
        <button
          className="duo-btn duo-green w-full mt-4 py-3 text-[14px]"
          onClick={(e) => {
            e.stopPropagation();
            playDuoSound('pop');
            setSheet('precall');
          }}
        >
          Find a partner
        </button>
      </div>

      {/* Option 3 — Rooms (Super) */}
      <div className="duo-card duo-card-press p-4" onClick={openRooms}>
        <div className="relative rounded-xl overflow-hidden" style={{ height: 112, background: '#EBCB9F' }}>
          <svg width="100%" height="100%" viewBox="0 0 300 112" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0 }}>
            <rect width="300" height="112" fill="#EBCB9F" />
            {[0, 1, 2, 3, 4].map((i) => (
              <line key={i} x1="0" y1={i * 24 + 12} x2="300" y2={i * 24 + 12} stroke="#D9AE7B" strokeWidth="2" />
            ))}
            <rect x="40" y="14" width="190" height="84" rx="18" fill="#BDEB9B" />
            <rect x="70" y="80" width="130" height="26" rx="10" fill="#1CB0F6" />
            <rect x="70" y="96" width="130" height="10" rx="5" fill="#1899D6" />
            <rect x="112" y="34" width="50" height="22" rx="8" fill="#B07A4F" />
            <circle cx="262" cy="30" r="16" fill="#58CC02" />
            <circle cx="262" cy="34" r="12" fill="#C46A3A" />
            <circle cx="250" cy="90" r="40" fill="#FFE9A8" opacity=".5" />
            <circle cx="104" cy="48" r="44" fill="none" stroke="rgba(88,167,0,.55)" strokeWidth="3" strokeDasharray="6 6" />
          </svg>
          {[
            { p: ROSTER[0], x: 70, y: 18 },
            { p: ROSTER[3], x: 108, y: 44 },
            { p: ROSTER[5], x: 56, y: 56 },
            { p: ROSTER[6], x: 214, y: 50 }
          ].map(({ p, x, y }) => (
            <div key={p.id} style={{ position: 'absolute', left: x, top: y, width: 34, height: 34, borderRadius: 17, overflow: 'hidden', border: `3px solid ${p.ring}`, background: '#fff' }}>
              <AvatarArt person={p} crop />
            </div>
          ))}
          <div style={{ position: 'absolute', left: 230, top: 18, background: '#fff', borderRadius: 10, padding: '2px 7px', fontSize: 11, fontWeight: 900, color: C.eel, border: `2px solid ${C.swan}` }}>¡Hola!</div>
          <span className="super-chip" style={{ position: 'absolute', left: 8, top: 8 }}>
            SUPER
          </span>
        </div>
        <div className="mt-3">
          <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wider" style={{ color: C.humpback }}>
            <Users className="w-3.5 h-3.5" /> New · Group practice
          </span>
          <h2 className="text-[19px] font-black leading-tight mt-0.5" style={{ color: C.eel }}>
            Join a room
          </h2>
          <p className="text-[13px] font-bold leading-snug mt-0.5" style={{ color: C.wolf }}>
            Walk around a cozy living room and drop into conversations — one-on-one or in a group.
          </p>
        </div>
        <button
          className="duo-btn duo-super w-full mt-4 py-3 text-[14px] flex items-center justify-center gap-2"
          onClick={(e) => {
            e.stopPropagation();
            openRooms();
          }}
        >
          {!subscribed && <Lock className="w-4 h-4" strokeWidth={3} />} {subscribed ? 'Enter a room' : 'Unlock with Super'}
        </button>
      </div>

      {IdentitySummary({})}

      <button
        onClick={() => goTab('safety')}
        className="w-full flex items-center gap-3 p-3 rounded-2xl border-2 text-left transition hover:brightness-[0.98]"
        style={{ background: C.iguana, borderColor: C.blueJay }}
      >
        <ShieldCheck className="w-6 h-6 shrink-0" style={{ color: C.macaw }} strokeWidth={2.5} />
        <span className="flex-1 text-[13px] font-extrabold leading-snug" style={{ color: C.humpback }}>
          Age-verified matching and real-time personal-info protection on every call.
        </span>
        <ChevronRight className="w-5 h-5 shrink-0" style={{ color: C.macaw }} />
      </button>
    </div>
  );

  const LearnTab = () => {
    const nodes = [
      { x: 0, kind: 'done', icon: Check },
      { x: -56, kind: 'done', icon: Star },
      { x: -24, kind: 'connect', icon: Mic },
      { x: 40, kind: 'locked', icon: Lock },
      { x: 10, kind: 'locked', icon: BookOpen }
    ];
    return (
      <div className="pb-6">
        <div className="mx-4 mt-4 rounded-2xl p-4 text-white flex items-center justify-between" style={{ background: C.feather, boxShadow: `0 4px 0 ${C.featherDark}` }}>
          <div>
            <div className="text-[12px] font-black uppercase tracking-wider opacity-90">Section 2, Unit 4</div>
            <div className="text-[18px] font-black leading-tight">Order at a café</div>
          </div>
          <span className="flex items-center gap-1.5 border-2 border-white/40 rounded-xl px-2.5 py-2 text-[12px] font-black uppercase">
            <BookOpen className="w-4 h-4" /> Guidebook
          </span>
        </div>
        <div className="flex flex-col items-center gap-5 pt-10">
          {nodes.map((n, i) => {
            const Icon = n.icon;
            const colors =
              n.kind === 'done'
                ? { bg: C.feather, sh: C.featherDark, fg: '#fff' }
                : n.kind === 'connect'
                  ? { bg: C.beetle, sh: C.beetleDark, fg: '#fff' }
                  : { bg: C.swan, sh: '#CECECE', fg: C.hare };
            return (
              <div key={i} className="relative" style={{ transform: `translateX(${n.x}px)`, marginTop: n.kind === 'connect' ? 36 : 0 }}>
                {n.kind === 'connect' && (
                  <div className="absolute -top-12 left-1/2 -translate-x-1/2">
                    <div
                      className="floaty whitespace-nowrap bg-white border-2 rounded-xl px-3 py-1.5 text-[13px] font-black uppercase"
                      style={{ borderColor: C.swan, color: C.beetle }}
                    >
                      Practice live
                    </div>
                  </div>
                )}
                <button
                  onClick={() => {
                    if (n.kind === 'connect') goTab('connect');
                    else if (n.kind === 'done') showToast('Lesson complete');
                    else showToast('Finish the lessons above to unlock');
                  }}
                  className="duo-btn rounded-full flex items-center justify-center"
                  style={{
                    width: 70,
                    height: 64,
                    borderRadius: '50%',
                    background: colors.bg,
                    boxShadow: `0 7px 0 ${colors.sh}`,
                    color: colors.fg
                  }}
                >
                  <Icon className="w-7 h-7" strokeWidth={3} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const SafetyTab = () => {
    const items = [
      { icon: Users, bg: C.seaSponge, fg: C.featherDark, title: 'Age-verified matching', body: 'Adults, teens and kids are matched in separate pools. Minors never land in an adult call.' },
      { icon: EyeOff, bg: '#F3E5FF', fg: C.beetleDark, title: 'Face hidden by default', body: 'Your Duolingo avatar talks for you. Camera stays off unless you turn it on.' },
      { icon: AudioLines, bg: C.iguana, fg: C.macawDark, title: 'Your voice, your choice', body: 'Use your real voice or a synthetic one. Switch anytime, even mid-call.' },
      { icon: ShieldAlert, bg: '#FFE5E5', fg: C.cardinalDark, title: 'Personal info filter', body: 'Phone numbers, addresses and social handles are muted in real time before your partner hears them.' },
      { icon: Flag, bg: '#FFF4CC', fg: '#B38600', title: 'One-tap report & block', body: 'End the call and report in one step. Reported users are reviewed by our safety team.' }
    ];
    return (
      <div className="px-4 pt-4 pb-6 space-y-3">
        <div className="rounded-2xl p-4 text-white" style={{ background: C.macaw, boxShadow: `0 4px 0 ${C.macawDark}` }}>
          <div className="text-[12px] font-black uppercase tracking-wider opacity-90">Duo Guardian</div>
          <h2 className="text-[20px] font-black leading-tight mt-0.5">Safe by design</h2>
          <p className="text-[14px] font-bold opacity-95 mt-1 leading-snug">Talking to strangers is the biggest barrier. Here's how we remove it.</p>
        </div>
        {items.map(({ icon, bg, fg, title, body }) => (
          <div key={title} className="duo-card p-3.5 flex items-start gap-3">
            <IconTile icon={icon} bg={bg} fg={fg} />
            <div>
              <h3 className="text-[15px] font-black" style={{ color: C.eel }}>
                {title}
              </h3>
              <p className="text-[13px] font-bold leading-snug mt-0.5" style={{ color: C.wolf }}>
                {body}
              </p>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const ProfileTab = () => (
    <div className="px-4 pt-4 pb-6 space-y-4">
      <div className="flex items-center gap-4">
        <div className="w-24 h-24 rounded-3xl overflow-hidden border-2" style={{ borderColor: C.swan, background: AVATAR_BG[avatarPreset] }}>
          <PeerAvatarSVG preset={avatarPreset} />
        </div>
        <div>
          <div className="text-[22px] font-black" style={{ color: C.eel }}>
            Ansu
          </div>
          <div className="text-[14px] font-bold" style={{ color: C.wolf }}>
            Learning {course.name} · Joined 2024
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[
          { icon: Flame, color: C.fox, value: '365', label: 'Day streak' },
          { icon: Users, color: C.feather, value: '28', label: 'Live calls' },
          { icon: Sparkles, color: C.beetle, value: '42', label: 'Phrases learned' },
          { icon: Clock, color: C.macaw, value: '3h 12m', label: 'Time speaking' }
        ].map(({ icon: Icon, color, value, label }) => (
          <div key={label} className="duo-card p-3 flex items-center gap-2.5">
            <Icon className="w-6 h-6" style={{ color }} strokeWidth={2.75} />
            <div>
              <div className="text-[17px] font-black leading-none" style={{ color: C.eel }}>
                {value}
              </div>
              <div className="text-[12px] font-bold mt-0.5" style={{ color: C.hare }}>
                {label}
              </div>
            </div>
          </div>
        ))}
      </div>
      {IdentitySummary({})}
    </div>
  );

  /* ---- Pre-call identity sheet ---------------------------------------------- */
  const IdentitySheet = () => (
    <div className="absolute inset-0 z-40 flex flex-col justify-end fade-in" style={{ background: 'rgba(0,0,0,.45)' }} onClick={() => setSheet(null)}>
      <div className="slide-up bg-white rounded-t-[28px] px-5 pt-3 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1.5 rounded-full mx-auto mb-3" style={{ background: C.swan }} />
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-[22px] font-black leading-tight" style={{ color: C.eel }}>
              {sheet === 'precall' ? 'Before you connect' : 'Your call identity'}
            </h2>
            <p className="text-[14px] font-bold mt-0.5" style={{ color: C.wolf }}>
              Choose how your partner sees and hears you.
            </p>
          </div>
          <button onClick={() => setSheet(null)} aria-label="Close" className="p-1 -mr-1">
            <X className="w-6 h-6" style={{ color: C.hare }} strokeWidth={3} />
          </button>
        </div>

        {/* Avatar picker */}
        <div className="flex items-center gap-4 mt-4">
          <div className="w-[88px] h-[100px] rounded-2xl overflow-hidden border-2 shrink-0" style={{ borderColor: C.swan, background: AVATAR_BG[avatarPreset] }}>
            <PeerAvatarSVG preset={avatarPreset} />
          </div>
          <div className="flex-1">
            <div className="text-[12px] font-black uppercase tracking-wider" style={{ color: C.hare }}>
              Your avatar
            </div>
            <div className="flex gap-2 mt-1.5">
              {[0, 1, 2].map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    playDuoSound('pop');
                    setAvatarPreset(p);
                  }}
                  className="w-[52px] h-[52px] rounded-xl overflow-hidden border-2 transition"
                  style={{
                    borderColor: avatarPreset === p ? C.macaw : C.swan,
                    boxShadow: avatarPreset === p ? `0 0 0 2px ${C.iguana}` : 'none',
                    background: AVATAR_BG[p]
                  }}
                  aria-label={`Avatar ${p + 1}`}
                >
                  <PeerAvatarSVG preset={p} />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Face toggle */}
        <div className="flex items-center gap-3 mt-5 p-3 rounded-2xl border-2" style={{ borderColor: C.swan }}>
          <IconTile icon={faceVisible ? Video : EyeOff} bg={faceVisible ? '#FFF0D9' : C.seaSponge} fg={faceVisible ? C.fox : C.featherDark} size={40} />
          <div className="flex-1">
            <div className="text-[15px] font-black" style={{ color: C.eel }}>
              Show my face
            </div>
            <div className="text-[12px] font-bold leading-snug" style={{ color: faceVisible ? '#CC7800' : C.wolf }}>
              {faceVisible ? 'Your partner will see your camera.' : 'Off — your avatar talks for you.'}
            </div>
          </div>
          <Toggle
            on={faceVisible}
            label="Show my face"
            onChange={(v) => {
              playDuoSound('pop');
              setFaceVisible(v);
            }}
          />
        </div>

        {/* Voice choice */}
        <div className="mt-4">
          <div className="text-[12px] font-black uppercase tracking-wider" style={{ color: C.hare }}>
            Your voice
          </div>
          <div className="grid grid-cols-2 gap-2 mt-1.5">
            {[
              { id: 'synthetic', label: 'Synthetic', sub: 'Disguises your voice' },
              { id: 'real', label: 'My real voice', sub: 'Sounds like you' }
            ].map((o) => {
              const active = voiceMode === o.id;
              return (
                <button
                  key={o.id}
                  onClick={() => {
                    playDuoSound('pop');
                    setVoiceMode(o.id);
                  }}
                  className="text-left p-3 rounded-2xl border-2 transition"
                  style={{
                    borderColor: active ? C.blueJay : C.swan,
                    background: active ? C.iguana : '#fff',
                    boxShadow: `0 4px 0 ${active ? C.blueJay : C.swan}`
                  }}
                >
                  <div className="text-[15px] font-black" style={{ color: active ? C.macawDark : C.eel }}>
                    {o.label}
                  </div>
                  <div className="text-[12px] font-bold" style={{ color: active ? C.macaw : C.wolf }}>
                    {o.sub}
                  </div>
                </button>
              );
            })}
          </div>
          {voiceMode === 'synthetic' && (
            <div className="flex gap-2 mt-3 rise-in">
              {SYNTH_VOICES.map((v) => {
                const active = synthVoiceId === v.id;
                return (
                  <button
                    key={v.id}
                    onClick={() => {
                      setSynthVoiceId(v.id);
                      previewVoice(v);
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border-2 text-[13px] font-black transition"
                    style={{
                      borderColor: active ? C.macaw : C.swan,
                      color: active ? C.macaw : C.wolf,
                      background: active ? C.iguana : '#fff'
                    }}
                  >
                    <Play className="w-3.5 h-3.5" fill="currentColor" /> {v.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {sheet === 'precall' ? (
          <>
            <div className="flex items-center gap-2 mt-5 text-[12px] font-bold" style={{ color: C.wolf }}>
              <ShieldCheck className="w-4 h-4 shrink-0" style={{ color: C.feather }} />
              You'll be matched with verified adults (18+) learning or speaking {course.name}.
            </div>
            <button className="duo-btn duo-green w-full mt-3 py-3.5 text-[15px]" onClick={startPeerMatch}>
              Find a partner
            </button>
          </>
        ) : (
          <button
            className="duo-btn duo-blue w-full mt-5 py-3.5 text-[15px]"
            onClick={() => {
              playDuoSound('pop');
              setSheet(null);
            }}
          >
            Save
          </button>
        )}
      </div>
    </div>
  );

  /* ---- Rooms: paywall --------------------------------------------------------- */
  const PaywallSheet = () => (
    <div className="absolute inset-0 z-40 flex flex-col justify-end fade-in" style={{ background: 'rgba(0,0,0,.5)' }} onClick={() => setRoomStep(null)}>
      <div className="slide-up rounded-t-[28px] px-5 pt-3 pb-8 text-white relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #0C1F3F 0%, #1B1446 100%)' }} onClick={(e) => e.stopPropagation()}>
        <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full super-grad" style={{ opacity: 0.25, filter: 'blur(30px)' }} />
        <div className="w-10 h-1.5 rounded-full mx-auto mb-4 bg-white/25" />
        <button onClick={() => setRoomStep(null)} aria-label="Close" className="absolute top-4 right-4 p-1">
          <X className="w-6 h-6 text-white/60" strokeWidth={3} />
        </button>
        <div className="text-[13px] font-black tracking-[0.2em] super-text">SUPER DUOLINGO</div>
        <h2 className="text-[26px] font-black leading-tight mt-1">Practice in live rooms</h2>
        <p className="text-[15px] font-bold mt-1.5 leading-snug" style={{ color: '#B9C7E6' }}>
          Hang out with learners and native speakers in a cozy shared space. Walk up, say hi, talk.
        </p>
        <div className="mt-5 space-y-3">
          {[
            ['Unlimited live rooms', 'Drop into one-on-one or group conversations'],
            ['Find the right people', 'Matched by language, level and what you can teach'],
            ['Same safety, always', 'Avatars, voice choice and the personal-info filter']
          ].map(([t, sub]) => (
            <div key={t} className="flex items-start gap-3">
              <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 super-grad">
                <Check className="w-4 h-4 text-white" strokeWidth={4} />
              </span>
              <div>
                <div className="text-[15px] font-black">{t}</div>
                <div className="text-[13px] font-bold" style={{ color: '#8FA3C8' }}>
                  {sub}
                </div>
              </div>
            </div>
          ))}
        </div>
        <button className="duo-btn w-full mt-6 py-3.5 text-[15px]" style={{ background: '#fff', color: '#1B1446', boxShadow: '0 4px 0 #9AA8D6' }} onClick={startTrial}>
          Try 1 week for free
        </button>
        <button className="w-full mt-3 text-[13px] font-black uppercase tracking-wide" style={{ color: '#8FA3C8' }} onClick={() => setRoomStep(null)}>
          No thanks
        </button>
      </div>
    </div>
  );

  /* ---- Rooms: setup ----------------------------------------------------------- */
  const RoomSetupSheet = () => {
    const teachOptions = ['EN', 'KO', 'ES', 'JA', 'ZH', 'FR'].filter((l) => l !== course.code);
    const roomCount = ROSTER.filter((p) => p.native === course.code || p.learning[course.code]).length;
    return (
      <div className="absolute inset-0 z-40 flex flex-col justify-end fade-in" style={{ background: 'rgba(0,0,0,.45)' }} onClick={() => setRoomStep(null)}>
        <div className="slide-up bg-white rounded-t-[28px] px-5 pt-3 pb-8" onClick={(e) => e.stopPropagation()}>
          <div className="w-10 h-1.5 rounded-full mx-auto mb-3" style={{ background: C.swan }} />
          <div className="flex items-start justify-between">
            <div>
              <span className="super-chip">SUPER</span>
              <h2 className="text-[22px] font-black leading-tight mt-1.5" style={{ color: C.eel }}>
                Set up your room profile
              </h2>
              <p className="text-[14px] font-bold mt-0.5" style={{ color: C.wolf }}>
                We'll put you with people who fit.
              </p>
            </div>
            <button onClick={() => setRoomStep(null)} aria-label="Close" className="p-1 -mr-1">
              <X className="w-6 h-6" style={{ color: C.hare }} strokeWidth={3} />
            </button>
          </div>

          <div className="mt-4 text-[12px] font-black uppercase tracking-wider" style={{ color: C.hare }}>
            I'm practicing
          </div>
          <div className="grid grid-cols-3 gap-2 mt-1.5">
            {COURSES.map((c, i) => {
              const active = courseIdx === i;
              return (
                <button
                  key={c.code}
                  onClick={() => switchCourse(i)}
                  className="py-2 rounded-xl border-2 flex flex-col items-center"
                  style={{ borderColor: active ? C.blueJay : C.swan, background: active ? C.iguana : '#fff', boxShadow: `0 3px 0 ${active ? C.blueJay : C.swan}` }}
                >
                  <span className="text-[22px] leading-none">{c.flag}</span>
                  <span className="text-[13px] font-black mt-1" style={{ color: active ? C.macawDark : C.eel }}>
                    {c.name}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 text-[12px] font-black uppercase tracking-wider" style={{ color: C.hare }}>
            My level
          </div>
          <div className="space-y-2 mt-1.5">
            {LEVELS.map((lv) => {
              const active = roomLevel === lv.id;
              return (
                <button
                  key={lv.id}
                  onClick={() => {
                    playDuoSound('pop');
                    setRoomLevel(lv.id);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl border-2 text-left"
                  style={{ borderColor: active ? C.blueJay : C.swan, background: active ? C.iguana : '#fff', boxShadow: `0 3px 0 ${active ? C.blueJay : C.swan}` }}
                >
                  <span className="flex items-end gap-[3px]" style={{ height: 18 }}>
                    {[1, 2, 3].map((b) => (
                      <span key={b} style={{ width: 5, height: 6 + b * 4, borderRadius: 3, background: b <= lv.bars ? lv.color : C.swan }} />
                    ))}
                  </span>
                  <span className="flex-1">
                    <span className="block text-[15px] font-black" style={{ color: active ? C.macawDark : C.eel }}>
                      {lv.label}
                    </span>
                    <span className="block text-[12px] font-bold" style={{ color: C.wolf }}>
                      {lv.sub}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 text-[12px] font-black uppercase tracking-wider" style={{ color: C.hare }}>
            I can help others with
          </div>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {teachOptions.map((l) => {
              const active = roomTeaches.includes(l);
              return (
                <button
                  key={l}
                  onClick={() => {
                    playDuoSound('pop');
                    setRoomTeaches((t) => (t.includes(l) ? t.filter((x) => x !== l) : [...t, l]));
                  }}
                  className="px-3 py-1.5 rounded-xl border-2 text-[13px] font-black flex items-center gap-1.5"
                  style={{ borderColor: active ? C.feather : C.swan, background: active ? C.seaSponge : '#fff', color: active ? C.featherDark : C.wolf }}
                >
                  {active && <Check className="w-3.5 h-3.5" strokeWidth={4} />}
                  {LANGS[l].flag} {LANGS[l].name}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 mt-4 text-[12px] font-bold" style={{ color: C.wolf }}>
            <ShieldCheck className="w-4 h-4 shrink-0" style={{ color: C.feather }} />
            {faceVisible ? 'Face visible' : 'Face hidden'} · {voiceMode === 'synthetic' ? `Synthetic voice (${synthVoice.label})` : 'Real voice'} ·
            <button
              className="font-black uppercase"
              style={{ color: C.macaw }}
              onClick={() => {
                setRoomStep(null);
                setSheet('edit');
              }}
            >
              Edit
            </button>
          </div>
          <button className="duo-btn duo-green w-full mt-3 py-3.5 text-[15px]" onClick={enterRoom}>
            Enter the living room · {roomCount} here
          </button>
        </div>
      </div>
    );
  };

  /* ---- Ringing (Lily) --------------------------------------------------------- */
  const RingingScreen = () => (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center text-white fade-in" style={{ background: 'linear-gradient(180deg,#3B2266 0%,#1E1236 100%)' }}>
      <div className="relative w-36 h-36">
        <span className="absolute inset-0 rounded-[40px] ring-pulse" style={{ background: C.beetle }} />
        <span className="absolute inset-0 rounded-[40px] ring-pulse" style={{ background: C.beetle, animationDelay: '.9s' }} />
        <div className="relative w-36 h-36 rounded-[40px] overflow-hidden border-4 border-white">
          <LilyAvatarSVG isCardIcon />
        </div>
      </div>
      <h2 className="text-[26px] font-black mt-8">Lily</h2>
      <p className="text-[15px] font-bold opacity-80 mt-1">Calling…</p>
      <button className="duo-btn duo-red mt-16 w-[72px] h-[72px] !rounded-full flex items-center justify-center" onClick={hangUp} aria-label="Cancel call">
        <PhoneOff className="w-8 h-8" strokeWidth={2.5} />
      </button>
    </div>
  );

  /* ---- Matching -------------------------------------------------------------- */
  const MatchingScreen = () => {
    const steps = [
      `${course.flag} ${course.name} speakers`,
      'Similar speaking level',
      'Verified adults (18+)',
      voiceMode === 'synthetic' ? 'Avatar + synthetic voice on' : 'Avatar on · real voice'
    ];
    const matched = phase === 'matched';
    return (
      <div className="absolute inset-0 z-30 flex flex-col items-center text-white fade-in px-6" style={{ background: C.night }}>
        <div className="mt-[140px] relative w-40 h-40 flex items-center justify-center">
          {!matched && (
            <>
              <span className="absolute inset-0 rounded-full ring-pulse" style={{ background: C.feather }} />
              <span className="absolute inset-0 rounded-full ring-pulse" style={{ background: C.feather, animationDelay: '.6s' }} />
              <span className="absolute inset-0 rounded-full ring-pulse" style={{ background: C.feather, animationDelay: '1.2s' }} />
            </>
          )}
          {matched ? (
            <div className="flex items-center pop-in">
              <div className="w-28 h-32 rounded-3xl overflow-hidden border-4 border-white -rotate-6 relative z-10" style={{ background: AVATAR_BG[avatarPreset] }}>
                <PeerAvatarSVG preset={avatarPreset} />
              </div>
              <div className="w-28 h-32 rounded-3xl overflow-hidden border-4 -ml-5 rotate-6" style={{ borderColor: C.feather, background: AVATAR_BG[peer.preset] }}>
                <PeerAvatarSVG preset={peer.preset} />
              </div>
            </div>
          ) : (
            <div className="relative w-28 h-32 rounded-3xl overflow-hidden border-4 border-white" style={{ background: AVATAR_BG[avatarPreset] }}>
              <PeerAvatarSVG preset={avatarPreset} />
            </div>
          )}
        </div>

        {matched ? (
          <div className="text-center mt-10 rise-in">
            <div className="text-[13px] font-black uppercase tracking-widest" style={{ color: C.mask }}>
              It's a match
            </div>
            <h2 className="text-[28px] font-black mt-1">Say hi to {peer.name}!</h2>
            <p className="text-[15px] font-bold mt-1" style={{ color: '#8FA3AD' }}>
              {peer.country} · {peer.level}
            </p>
            <p className="text-[13px] font-bold mt-6 flex items-center justify-center gap-2" style={{ color: '#8FA3AD' }}>
              <span className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: C.feather, borderTopColor: 'transparent' }} />
              Connecting…
            </p>
          </div>
        ) : (
          <>
            <h2 className="text-[24px] font-black mt-12 text-center">{isSkip ? 'Finding someone new…' : 'Finding your partner…'}</h2>
            <div className="mt-6 w-full max-w-[280px] space-y-2.5">
              {steps.map((s, i) => {
                const done = matchStep > i;
                return (
                  <div
                    key={s}
                    className="flex items-center gap-3 px-3.5 py-2.5 rounded-2xl border-2 transition-all"
                    style={{
                      borderColor: done ? C.nightBorder : 'transparent',
                      background: done ? C.nightCard : 'transparent',
                      opacity: done ? 1 : 0.35
                    }}
                  >
                    <span className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: done ? C.feather : C.nightBorder }}>
                      <Check className="w-4 h-4 text-white" strokeWidth={4} />
                    </span>
                    <span className="text-[14px] font-extrabold">{s}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <button className="duo-btn duo-ghost-dark absolute bottom-12 left-6 right-6 py-3.5 text-[15px]" onClick={hangUp}>
          Cancel
        </button>
      </div>
    );
  };

  /* ---- In-call ------------------------------------------------------------------ */
  const CallScreen = () => {
    const isLily = mode === 'lily';
    const stageBg = isLily ? '#E6DEFF' : AVATAR_BG[peer.preset];
    const chipList = isLily ? course.lilyTopics : peer.topics;
    return (
      <div className="absolute inset-0 z-30 flex flex-col fade-in" style={{ background: stageBg }}>
        {/* Partner avatar stage */}
        <div className="absolute inset-x-0 top-[96px] h-[400px] flex items-center justify-center pointer-events-none">
          <div className="w-full h-full">
            {isLily ? (
              <LilyAvatarSVG isSpeaking={partnerSpeaking} isEyeRolling={partnerSpeaking} />
            ) : (
              <PeerAvatarSVG preset={peer.preset} isSpeaking={partnerSpeaking} />
            )}
          </div>
        </div>

        {/* Top HUD */}
        <div className="relative z-10 pt-[58px] px-4 flex items-start justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 bg-white rounded-full pl-2.5 pr-3 py-1.5 border-2" style={{ borderColor: 'rgba(0,0,0,.06)' }}>
              <span className="w-2 h-2 rounded-full" style={{ background: C.cardinal }} />
              <span className="text-[13px] font-black tabular-nums" style={{ color: C.eel }}>
                {fmt(seconds)}
              </span>
              <EqBars active={partnerSpeaking} />
            </div>
            <div className="bg-white/95 rounded-2xl px-3 py-2 border-2" style={{ borderColor: 'rgba(0,0,0,.06)' }}>
              <div className="text-[16px] font-black leading-tight flex items-center gap-1.5" style={{ color: C.eel }}>
                {isLily ? 'Lily' : peer.name}
                {isLily ? (
                  <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded-md text-white" style={{ background: C.beetle }}>
                    AI
                  </span>
                ) : (
                  <ShieldCheck className="w-4 h-4" style={{ color: C.feather }} strokeWidth={3} />
                )}
              </div>
              <div className="text-[12px] font-bold" style={{ color: C.wolf }}>
                {isLily ? `${course.flag} ${course.name} · Duolingo Max` : `${peer.country} · Verified 18+`}
              </div>
            </div>
            {!isLily && (
              <button className="duo-btn duo-white px-3 py-1.5 text-[12px] flex items-center gap-1.5 !rounded-xl" onClick={nextPartner}>
                <SkipForward className="w-4 h-4" strokeWidth={3} /> Next
              </button>
            )}
          </div>

        </div>

        {/* Bottom panel */}
        <div className="mt-auto relative z-10 bg-white rounded-t-[28px] pt-3 pb-8 px-4" style={{ boxShadow: '0 -6px 24px rgba(0,0,0,.08)' }}>
          {/* Self view — small, bottom-right corner, sits just above the panel */}
          <div
            className="absolute rounded-2xl overflow-hidden border-white shadow-lg"
            style={{
              right: 16,
              bottom: 'calc(100% + 12px)',
              width: 76,
              borderWidth: 3,
              borderStyle: 'solid',
              background: faceVisible ? '#2A3A42' : AVATAR_BG[avatarPreset]
            }}
          >
            <div className="relative" style={{ height: 84 }}>
              {faceVisible ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-white">
                  <Video className="w-6 h-6" />
                  <span className="font-black uppercase mt-1" style={{ fontSize: 9 }}>Camera on</span>
                </div>
              ) : (
                <PeerAvatarSVG preset={avatarPreset} isSpeaking={meSpeaking} />
              )}
              {muted && (
                <span className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: C.cardinal }}>
                  <MicOff className="w-3 h-3 text-white" strokeWidth={3} />
                </span>
              )}
            </div>
            <div className="bg-white px-1 py-0.5 flex items-center justify-center gap-1 font-black uppercase" style={{ color: C.wolf, fontSize: 9 }}>
              {!isLily && voiceMode === 'synthetic' ? (
                <>
                  <AudioLines className="w-3 h-3" style={{ color: C.macaw }} /> {synthVoice.label}
                </>
              ) : (
                <>
                  <Mic className="w-3 h-3" /> {isLily ? 'You' : 'Real voice'}
                </>
              )}
            </div>
          </div>

          {/* Transcript */}
          <div ref={transcriptRef} className="h-[150px] overflow-y-auto no-scrollbar space-y-2 pr-0.5">
            {transcript.map((line) => {
              if (line.who === 'guard') {
                return (
                  <div key={line.id} className="rise-in flex items-start gap-2 p-2.5 rounded-xl border-2" style={{ background: '#FFF0F0', borderColor: '#FFC9C9' }}>
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" style={{ color: C.cardinal }} strokeWidth={2.75} />
                    <span className="text-[12px] font-extrabold leading-snug" style={{ color: C.cardinalDark }}>
                      {line.text}
                    </span>
                  </div>
                );
              }
              const me = line.who === 'me';
              const { main, sub } = line.text ? splitSub(line.text) : { main: null, sub: null };
              return (
                <div key={line.id} className={`rise-in flex flex-col ${me ? 'items-end' : 'items-start'}`}>
                  <div
                    className="max-w-[86%] px-3 py-2 rounded-2xl border-2 text-[14px] font-bold leading-snug"
                    style={
                      me
                        ? { background: C.iguana, borderColor: C.blueJay, color: C.humpback, borderBottomRightRadius: 6 }
                        : { background: C.polar, borderColor: C.swan, color: C.eel, borderBottomLeftRadius: 6 }
                    }
                  >
                    {line.segments ? <RedactedText segments={line.segments} /> : main}
                    {sub && (
                      <div className="text-[12px] font-bold mt-0.5" style={{ color: me ? C.macaw : C.wolf }}>
                        {sub}
                      </div>
                    )}
                  </div>
                  {me && line.voice === 'synthetic' && (
                    <span className="text-[10px] font-black uppercase mt-0.5 flex items-center gap-1" style={{ color: C.hare }}>
                      <AudioLines className="w-3 h-3" /> Sent in synthetic voice
                    </span>
                  )}
                  {line.tip && (
                    <span className="mt-1 inline-flex items-start gap-1 text-[12px] font-extrabold px-2 py-1 rounded-lg max-w-[86%]" style={{ background: '#FFF4CC', color: '#A37A00' }}>
                      <Sparkles className="w-3.5 h-3.5 shrink-0 mt-[1px]" /> {line.tip}
                    </span>
                  )}
                </div>
              );
            })}
            {listening && (
              <div className="flex justify-end">
                <div className="px-3 py-2 rounded-2xl border-2 text-[14px] font-black flex items-center gap-1.5" style={{ background: C.iguana, borderColor: C.blueJay, color: C.macaw }}>
                  Listening
                  <span className="dot">•</span>
                  <span className="dot" style={{ animationDelay: '.2s' }}>
                    •
                  </span>
                  <span className="dot" style={{ animationDelay: '.4s' }}>
                    •
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Suggestions */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar mt-3 -mx-4 px-4 pb-1">
            {chipList.map((t) => (
              <button
                key={t.label}
                disabled={busy}
                onClick={() => onTopicChip(t)}
                className="shrink-0 px-3 py-2 rounded-xl border-2 text-[13px] font-extrabold transition"
                style={{
                  borderColor: C.swan,
                  boxShadow: `0 3px 0 ${C.swan}`,
                  color: busy ? C.hare : C.eel,
                  background: '#fff'
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {keyboardOpen && (
            <form onSubmit={onTypedSubmit} className="flex gap-2 mt-3 rise-in">
              <input
                autoFocus
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`Type in ${course.name}…`}
                className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl border-2 text-[14px] font-bold outline-none"
                style={{ borderColor: C.swan, background: C.polar, color: C.eel }}
                onFocus={(e) => (e.target.style.borderColor = C.blueJay)}
                onBlur={(e) => (e.target.style.borderColor = C.swan)}
              />
              <button type="submit" className="duo-btn duo-blue px-3.5 !rounded-xl flex items-center" aria-label="Send">
                <Send className="w-5 h-5" />
              </button>
            </form>
          )}

          {/* Controls */}
          <div className="flex items-center gap-2.5 mt-4">
            <button
              className={`duo-btn w-[52px] h-[52px] flex items-center justify-center ${muted ? 'duo-red' : 'duo-white'}`}
              style={muted ? {} : { color: C.eel }}
              onClick={() => {
                playDuoSound('pop');
                setMuted((m) => !m);
              }}
              aria-label={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? <MicOff className="w-6 h-6" strokeWidth={2.5} /> : <Mic className="w-6 h-6" strokeWidth={2.5} />}
            </button>
            {!isLily && (
              <button
                className="duo-btn duo-white w-[52px] h-[52px] flex items-center justify-center"
                style={{
                  color: voiceMode === 'synthetic' ? C.macaw : C.eel,
                  background: voiceMode === 'synthetic' ? C.iguana : '#fff',
                  borderColor: voiceMode === 'synthetic' ? C.blueJay : C.swan,
                  boxShadow: `0 4px 0 ${voiceMode === 'synthetic' ? C.blueJay : C.swan}`
                }}
                onClick={toggleVoiceInCall}
                aria-label="Switch voice"
                title={voiceMode === 'synthetic' ? 'Synthetic voice on — tap for real voice' : 'Real voice — tap for synthetic'}
              >
                <AudioLines className="w-6 h-6" strokeWidth={2.5} />
              </button>
            )}
            <button
              className={`duo-btn flex-1 h-[52px] text-[15px] flex items-center justify-center gap-2 ${busy || listening ? 'duo-disabled' : 'duo-green'}`}
              disabled={busy || listening}
              onClick={onSpeakPress}
            >
              <Mic className="w-5 h-5" strokeWidth={3} />
              {listening ? 'Listening' : 'Speak'}
            </button>
            <button
              className="duo-btn duo-white w-[52px] h-[52px] flex items-center justify-center"
              style={{ color: keyboardOpen ? C.macaw : C.eel }}
              onClick={() => {
                playDuoSound('pop');
                setKeyboardOpen((k) => !k);
              }}
              aria-label="Type instead"
            >
              <Keyboard className="w-6 h-6" strokeWidth={2.5} />
            </button>
            <button className="duo-btn duo-red w-[52px] h-[52px] flex items-center justify-center" onClick={hangUp} aria-label="End call">
              <PhoneOff className="w-6 h-6" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  /* ---- Recap ------------------------------------------------------------------- */
  const RecapScreen = () => {
    const isLily = mode === 'lily';
    const tiles = [
      { label: 'Time', value: fmt(seconds), color: C.macaw, icon: Clock },
      { label: 'Turns', value: stats.turns, color: C.feather, icon: MessageCircle },
      { label: 'New phrases', value: stats.phrases, color: C.bee, icon: Sparkles }
    ];
    return (
      <div className="absolute inset-0 z-30 bg-white flex flex-col items-center px-6 fade-in">
        <div className="mt-[110px] relative">
          <div className="w-36 h-40 rounded-[32px] overflow-hidden border-4 pop-in" style={{ borderColor: isLily ? C.beetle : C.feather, background: isLily ? '#E6DEFF' : AVATAR_BG[peer.preset] }}>
            {isLily ? <LilyAvatarSVG isCardIcon /> : <PeerAvatarSVG preset={peer.preset} />}
          </div>
        </div>
        <h2 className="text-[28px] font-black mt-6 text-center" style={{ color: C.bee, textShadow: `0 2px 0 ${C.beeDark}33` }}>
          Great conversation!
        </h2>
        <p className="text-[15px] font-bold mt-1 text-center" style={{ color: C.wolf }}>
          You talked with {isLily ? 'Lily' : peer.name} in {course.name}.
        </p>

        <div className="grid grid-cols-3 gap-2.5 w-full mt-7">
          {tiles.map(({ label, value, color, icon: Icon }, i) => (
            <div key={label} className="rounded-2xl overflow-hidden border-2 pop-in" style={{ borderColor: color, background: color, animationDelay: `${0.1 + i * 0.1}s` }}>
              <div className="text-[11px] font-black uppercase tracking-wider text-white text-center py-1">{label}</div>
              <div className="bg-white rounded-xl m-0.5 py-2.5 flex items-center justify-center gap-1.5">
                <Icon className="w-5 h-5" style={{ color }} strokeWidth={3} />
                <span className="text-[18px] font-black" style={{ color }}>
                  {value}
                </span>
              </div>
            </div>
          ))}
        </div>

        {!isLily && (
          <div className="w-full mt-6 duo-card p-3.5">
            <div className="text-[15px] font-black" style={{ color: C.eel }}>
              How was your call with {peer.name}?
            </div>
            <div className="flex gap-2 mt-2.5">
              {[
                { id: 'up', icon: ThumbsUp, label: 'Good' },
                { id: 'down', icon: ThumbsDown, label: 'Not great' }
              ].map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  onClick={() => {
                    playDuoSound('pop');
                    setRating(id);
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border-2 text-[13px] font-black"
                  style={{
                    borderColor: rating === id ? C.blueJay : C.swan,
                    background: rating === id ? C.iguana : '#fff',
                    color: rating === id ? C.macaw : C.wolf
                  }}
                >
                  <Icon className="w-4 h-4" strokeWidth={2.75} /> {label}
                </button>
              ))}
            </div>
            <button
              className="mt-2.5 w-full flex items-center justify-center gap-1.5 text-[12px] font-black uppercase tracking-wide"
              style={{ color: C.cardinal }}
              onClick={() => showToast(`${peer.name} reported and blocked`)}
            >
              <Flag className="w-3.5 h-3.5" strokeWidth={3} /> Report &amp; block
            </button>
          </div>
        )}

        <button className="duo-btn duo-green absolute bottom-12 left-6 right-6 py-3.5 text-[15px]" onClick={closeRecap}>
          Continue
        </button>
      </div>
    );
  };

  /* ========================================================================
     RENDER: PRESENTER PANEL + PHONE
     ======================================================================== */
  const PresenterPanel = () => (
    <aside className="w-full max-w-[390px] lg:w-[380px] shrink-0 text-white rounded-3xl p-6 border-2" style={{ background: C.nightCard, borderColor: C.nightBorder }}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full" style={{ background: C.feather }}>
          Group 2 · Prototype
        </span>
        <button onClick={() => setPanelOpen(false)} className="text-[12px] font-black uppercase tracking-wide flex items-center gap-1" style={{ color: '#8FA3AD' }}>
          Hide <span className="px-1.5 rounded border" style={{ borderColor: C.nightBorder }}>H</span>
        </button>
      </div>

      <h1 className="text-[30px] font-black leading-tight mt-4">Duolingo Connect</h1>
      <p className="text-[15px] font-bold mt-1.5 leading-snug" style={{ color: '#B9C7CE' }}>
        Real speaking practice, without the fear of talking to strangers.
      </p>

      <div className="mt-5 p-4 rounded-2xl border-2" style={{ background: C.night, borderColor: C.nightBorder }}>
        <div className="text-[11px] font-black uppercase tracking-widest" style={{ color: C.bee }}>
          The problem
        </div>
        <p className="text-[13px] font-bold leading-relaxed mt-1.5" style={{ color: '#D5DEE2' }}>
          Scripted drills don't build conversational fluency, and learners have no safe way to practice with real people. 18–24-year-olds are Duolingo's
          largest group (31%) — and the most likely to want live practice.
        </p>
      </div>

      <div className="mt-5">
        <div className="text-[11px] font-black uppercase tracking-widest" style={{ color: C.mask }}>
          How it works
        </div>
        <ol className="mt-2 space-y-2.5">
          {[
            ['Tap Connect', 'Pick Lily (AI), a real learner, or a room.'],
            ['Your avatar speaks for you', 'Face hidden by default.'],
            ['Your voice, your call', 'Real or synthetic — switch anytime.']
          ].map(([t, s], i) => (
            <li key={t} className="flex gap-3">
              <span className="w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-black shrink-0" style={{ background: C.nightBorder }}>
                {i + 1}
              </span>
              <span>
                <span className="block text-[14px] font-black leading-tight">{t}</span>
                <span className="block text-[13px] font-bold" style={{ color: '#8FA3AD' }}>
                  {s}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-6 pt-5 border-t-2" style={{ borderColor: C.nightBorder }}>
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-black uppercase tracking-widest" style={{ color: C.blueJay }}>
            Demo controls
          </div>
          <div className="flex gap-1">
            {COURSES.map((c, i) => (
              <button
                key={c.code}
                disabled={inCallFlow || inRoom}
                onClick={() => switchCourse(i)}
                className="px-2 py-1 rounded-lg text-[12px] font-black transition disabled:opacity-40"
                style={{ background: courseIdx === i ? C.macaw : C.night, color: '#fff' }}
                title={`${c.name} (${i + 1})`}
              >
                {c.flag} {c.code}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5 mt-3">
          {[
            { label: 'Call Lily', key: 'L', cls: 'duo-purple', on: startLily, disabled: phase !== 'idle' || inRoom },
            {
              label: 'Real person',
              key: 'P',
              cls: 'duo-green',
              on: () => {
                playDuoSound('pop');
                setTab('connect');
                setSheet('precall');
              },
              disabled: phase !== 'idle' || inRoom
            },
            { label: 'Safety filter', key: 'G', cls: 'duo-red', on: triggerGuardianDemo, disabled: !(phase === 'call' && mode === 'peer') },
            { label: 'Join a room', key: 'R', cls: 'duo-super', on: openRooms, disabled: phase !== 'idle' || inRoom },
            {
              label: subscribed ? 'Reset paywall' : 'Paywall on',
              key: 'U',
              cls: 'duo-ghost-dark',
              on: () => {
                setSubscribed(false);
                showToast('Paywall reset');
              },
              disabled: !subscribed || inRoom
            },
            {
              label: inRoom ? 'Leave room' : 'End call',
              key: 'Esc',
              cls: 'duo-ghost-dark',
              on: () => (inRoom ? roomExitRef.current && roomExitRef.current() : hangUp()),
              disabled: !(inRoom || (inCallFlow && phase !== 'recap'))
            }
          ].map(({ label, key, cls, on, disabled }) => (
            <button key={label} disabled={disabled} onClick={on} className={`duo-btn ${cls} py-2.5 text-[12px] flex items-center justify-center gap-2 disabled:opacity-35`}>
              {label}
              <span className="text-[10px] px-1.5 py-[1px] rounded-md bg-black/20 normal-case">{key}</span>
            </button>
          ))}
        </div>
        <p className="text-[12px] font-bold mt-3 leading-snug" style={{ color: '#8FA3AD' }}>
          In a room: tap the floor (or use arrow keys) to walk, Space to say hi / join / merge. People join, merge and drift apart on their own.
        </p>
      </div>
    </aside>
  );

  return (
    <div className="duo-font min-h-screen w-full flex flex-col lg:flex-row items-center justify-center gap-8 p-5 overflow-x-hidden" style={{ background: C.night }}>
      <style>{STYLES}</style>

      {panelOpen && PresenterPanel()}

      {/* Phone */}
      <div style={{ width: PHONE_W * scale, height: PHONE_H * scale }} className="shrink-0 relative">
        <div
          className="absolute top-0 left-0 rounded-[56px] p-[11px]"
          style={{
            width: PHONE_W,
            height: PHONE_H,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            background: '#0B1114',
            boxShadow: '0 0 0 2px #2B3A41, 0 30px 80px rgba(0,0,0,.55)'
          }}
        >
          <div className="relative w-full h-full rounded-[46px] overflow-hidden flex flex-col" style={{ clipPath: 'inset(0 round 46px)', isolation: 'isolate', background: phase === 'matching' || phase === 'matched' ? C.night : phase === 'ringing' ? '#2B1A4D' : '#fff' }}>
            {StatusBar()}
            {TopStats()}
            <main className="flex-1 overflow-y-auto no-scrollbar bg-white">
              {tab === 'connect' && ConnectTab()}
              {tab === 'learn' && LearnTab()}
              {tab === 'safety' && SafetyTab()}
              {tab === 'profile' && ProfileTab()}
            </main>
            {NavBar()}

            {sheet && IdentitySheet()}
            {roomStep === 'paywall' && PaywallSheet()}
            {roomStep === 'setup' && RoomSetupSheet()}
            {inRoom && (
              <LivingRoom
                key={course.code}
                course={course}
                avatarPreset={avatarPreset}
                voiceMode={voiceMode}
                synthVoice={synthVoice}
                teaches={roomTeaches}
                level={roomLevel}
                exitRef={roomExitRef}
                onExit={exitRoom}
              />
            )}
            {phase === 'ringing' && RingingScreen()}
            {(phase === 'matching' || phase === 'matched') && MatchingScreen()}
            {phase === 'call' && CallScreen()}
            {phase === 'recap' && RecapScreen()}

            {toast && (
              <div className={`absolute inset-x-0 flex justify-center pointer-events-none ${phase === 'call' ? 'bottom-[330px]' : 'top-[58px]'}`} style={{ zIndex: 70 }}>
                <div className="pop-in whitespace-nowrap px-4 py-2 rounded-full text-[13px] font-black text-white shadow-xl" style={{ background: C.eel }}>
                  {toast}
                </div>
              </div>
            )}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-[134px] h-[5px] rounded-full z-[70] pointer-events-none" style={{ background: inCallFlow && phase !== 'recap' && phase !== 'call' ? '#fff' : '#000' }} />
          </div>
        </div>
      </div>

      {!panelOpen && (
        <button
          onClick={() => setPanelOpen(true)}
          className="fixed bottom-4 left-4 text-[12px] font-black uppercase tracking-wide px-3 py-2 rounded-xl border-2"
          style={{ color: '#8FA3AD', borderColor: C.nightBorder, background: C.nightCard }}
        >
          Presenter panel (H)
        </button>
      )}
    </div>
  );
}
