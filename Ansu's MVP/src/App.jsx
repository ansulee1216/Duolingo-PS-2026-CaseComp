import React, { useState, useEffect, useRef } from 'react';
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

const PeerAvatarSVG = ({ preset = 0, isSpeaking = false }) => {
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
      <svg className="w-full h-full select-none" viewBox="0 0 280 320" fill="none">
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
      <svg className="w-full h-full select-none" viewBox="0 0 280 320" fill="none">
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
    <svg className="w-full h-full select-none" viewBox="0 0 280 320" fill="none">
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
    if (inCallFlow) return;
    playDuoSound('pop');
    setCourseIdx(idx);
    setPeerIdx(0);
  };

  // ---- presenter keyboard shortcuts ---------------------------------------------
  const keyRef = useRef({});
  keyRef.current = { phase, mode, sheet, startLily, startPeerMatch, hangUp, nextPartner, triggerGuardianDemo, switchCourse, closeRecap };
  useEffect(() => {
    const onKey = (e) => {
      const k = keyRef.current;
      const key = e.key.toLowerCase();
      const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
      if (typing && key !== 'escape') return;
      if (key === 'escape') {
        if (k.sheet) setSheet(null);
        else if (k.phase === 'recap') k.closeRecap();
        else k.hangUp();
      } else if (key === 'l' && k.phase === 'idle') k.startLily();
      else if (key === 'p' && k.phase === 'idle') {
        playDuoSound('pop');
        setTab('connect');
        setSheet('precall');
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
  const darkStatus = phase === 'matching' || phase === 'matched' || phase === 'ringing';

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
            ['Tap Connect', 'Pick Lily (AI) or a real learner.'],
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
                disabled={inCallFlow}
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
            { label: 'Call Lily', key: 'L', cls: 'duo-purple', on: startLily, disabled: phase !== 'idle' },
            {
              label: 'Real person',
              key: 'P',
              cls: 'duo-green',
              on: () => {
                playDuoSound('pop');
                setTab('connect');
                setSheet('precall');
              },
              disabled: phase !== 'idle'
            },
            { label: 'Safety filter', key: 'G', cls: 'duo-red', on: triggerGuardianDemo, disabled: !(phase === 'call' && mode === 'peer') },
            { label: 'End call', key: 'Esc', cls: 'duo-ghost-dark', on: hangUp, disabled: !inCallFlow || phase === 'recap' }
          ].map(({ label, key, cls, on, disabled }) => (
            <button key={label} disabled={disabled} onClick={on} className={`duo-btn ${cls} py-2.5 text-[12px] flex items-center justify-center gap-2 disabled:opacity-35`}>
              {label}
              <span className="text-[10px] px-1.5 py-[1px] rounded-md bg-black/20 normal-case">{key}</span>
            </button>
          ))}
        </div>
        <p className="text-[12px] font-bold mt-3 leading-snug" style={{ color: '#8FA3AD' }}>
          In a real-person call, tap a suggestion or Speak. With synthetic voice on, you'll hear your line the way your partner hears it.
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
            {phase === 'ringing' && RingingScreen()}
            {(phase === 'matching' || phase === 'matched') && MatchingScreen()}
            {phase === 'call' && CallScreen()}
            {phase === 'recap' && RecapScreen()}

            {toast && (
              <div className={`absolute ${phase === 'call' ? 'bottom-[330px]' : 'top-[58px]'} left-1/2 -translate-x-1/2 z-[70] pop-in whitespace-nowrap px-4 py-2 rounded-full text-[13px] font-black text-white shadow-xl`} style={{ background: C.eel }}>
                {toast}
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
