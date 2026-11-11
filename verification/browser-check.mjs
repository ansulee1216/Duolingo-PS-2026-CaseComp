import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const tonePath = join(tmpdir(), 'character-chat-' + randomUUID() + '.wav');
const samples = 48000 * 2;
const wave = Buffer.alloc(44 + samples * 2);
wave.write('RIFF');
wave.writeUInt32LE(wave.length - 8, 4);
wave.write('WAVEfmt ', 8);
wave.writeUInt32LE(16, 16);
wave.writeUInt16LE(1, 20);
wave.writeUInt16LE(1, 22);
wave.writeUInt32LE(48000, 24);
wave.writeUInt32LE(96000, 28);
wave.writeUInt16LE(2, 32);
wave.writeUInt16LE(16, 34);
wave.write('data', 36);
wave.writeUInt32LE(samples * 2, 40);
for (let i = 0; i < samples; i++) {
  const sample = Math.round(9000 * Math.sin(i * 2 * Math.PI * 440 / 48000));
  wave.writeInt16LE(sample, 44 + i * 2);
}
await writeFile(tonePath, wave);
const server = spawn(process.execPath, ['server.js'], {
  env: { ...process.env, PORT: '3001', ROUND_SECONDS: '12' },
  stdio: 'pipe',
});
await new Promise(resolve => server.stdout.once('data', resolve));
let browser;
const results = [];
async function pass(label, action) {
  await action();
  results.push(label);
  console.log('PASS ' + label);
}
try {
  browser = await chromium.launch({
    channel: 'chrome', headless: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-audio-capture=' + tonePath, '--autoplay-policy=no-user-gesture-required'],
  });
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({
    viewport: { width: 390, height: 844 }, permissions: ['microphone'],
  })));
  const [a, b] = await Promise.all(contexts.map(context => context.newPage()));
  const errorsPage = await contexts[0].newPage();
  await pass('Permission denied, missing microphone and busy microphone messages', async () => {
    for (const name of ['NotAllowedError', 'NotFoundError', 'NotReadableError']) {
      await errorsPage.goto('http://localhost:3001');
      await errorsPage.evaluate(name => {
        navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Test microphone error', name); };
      }, name);
      await errorsPage.click('#find');
      await errorsPage.locator('#error').waitFor({ state: 'visible' });
      const message = await errorsPage.locator('#error').textContent();
      const expected = {
        NotAllowedError: /permission was denied/,
        NotFoundError: /No microphone found/,
        NotReadableError: /busy or unavailable/,
      }[name];
      assert.match(message, expected);
      assert.equal(await errorsPage.locator('#find').isEnabled(), true);
    }
    await errorsPage.close();
  });
  for (const page of [a, b]) {
    page.on('pageerror', cause => console.error('PAGE ERROR', cause.message));
    await page.addInitScript(() => {
      const Peer = window.RTCPeerConnection;
      window.peers = [];
      window.RTCPeerConnection = class extends Peer {
        constructor(...args) { super(...args); window.peers.push(this); }
      };
      const getMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      window.captured = [];
      navigator.mediaDevices.getUserMedia = async (...args) => {
        const stream = await getMedia(...args);
        window.captured.push(stream);
        return stream;
      };
      const Worklet = window.AudioWorkletNode;
      window.worklets = [];
      window.AudioWorkletNode = class extends Worklet {
        constructor(...args) { super(...args); window.worklets.push(this); }
      };
    });
    await page.goto('http://localhost:3001');
  }
  await a.screenshot({ path: 'verification/lobby.png', fullPage: true });
  await pass('Waiting and cancellation release microphone', async () => {
    await a.click('#find');
    await a.getByText('Waiting for a partner…', { exact: true }).waitFor();
    await a.click('#cancel');
    assert.equal(await a.evaluate(() => captured[0].getTracks()[0].readyState), 'ended');
  });
  await pass('Automatic matching and private complementary roles', async () => {
    await a.click('#find');
    await a.getByText('Waiting for a partner…', { exact: true }).waitFor();
    await b.click('[data-character="Zari"]');
    await b.click('#find');
    for (const page of [a, b]) await page.getByText('Connected · both voices filtered', { exact: true }).waitFor();
    assert.match(await a.locator('#role').textContent(), /home by 8/);
    assert.match(await b.locator('#role').textContent(), /after 7/);
  });
  await pass('Two-way received audio and processed-only sending', async () => {
    for (const page of [a, b]) {
      await page.waitForFunction(async () => {
        const stats = [...(await peers.at(-1).getStats()).values()];
        return stats.some(stat => stat.type === 'inbound-rtp' && stat.kind === 'audio' && stat.totalAudioEnergy > 0);
      });
      assert.equal(await page.evaluate(() => peers.at(-1).getSenders()[0].track.id === captured.at(-1).getAudioTracks()[0].id), false);
      assert.equal(await page.evaluate(() => worklets.length > 0), true);
    }
  });
  await pass('Voice effect shifts a 440 Hz signal to both character pitches', async () => {
    for (const [page, ratio] of [[a, .82], [b, 1.22]]) {
      const frequency = await page.evaluate(async ratio => {
        const context = worklets.at(-1).context;
        const oscillator = context.createOscillator();
        oscillator.frequency.value = 440;
        const effect = new AudioWorkletNode(context, 'character-voice', {
          outputChannelCount: [1], processorOptions: { ratio },
        });
        const meter = context.createAnalyser();
        meter.fftSize = 8192;
        const silence = context.createGain();
        silence.gain.value = 0;
        oscillator.connect(effect).connect(meter).connect(silence).connect(context.destination);
        oscillator.start();
        await new Promise(resolve => setTimeout(resolve, 500));
        const bins = new Float32Array(meter.frequencyBinCount);
        meter.getFloatFrequencyData(bins);
        const peak = bins.indexOf(Math.max(...bins));
        oscillator.stop();
        effect.disconnect();
        silence.disconnect();
        return peak * context.sampleRate / meter.fftSize;
      }, ratio);
      assert.ok(Math.abs(frequency - 440 * ratio) < 25, 'Measured pitch ' + frequency);
    }
  });
  await pass('Shared timer, optional hints, repeat request, mute and unmute', async () => {
    await a.waitForFunction(() => document.getElementById('timer').textContent !== '3:00');
    assert.equal(await a.locator('#timer').textContent(), await b.locator('#timer').textContent());
    await a.click('#help');
    assert.equal(await a.locator('#hints').isVisible(), true);
    assert.equal(await b.locator('#hints').isVisible(), false);
    await a.click('#repeat');
    await b.getByText('↺ Your partner asks — could you say that again?', { exact: true }).waitFor();
    await a.click('#mute');
    assert.equal(await a.evaluate(() => peers.at(-1).getSenders()[0].track.enabled), false);
    await a.click('#mute');
    assert.equal(await a.evaluate(() => peers.at(-1).getSenders()[0].track.enabled), true);
    await a.bringToFront();
    await a.waitForFunction(() => document.getElementById('partner').classList.contains('speaking'));
    await a.screenshot({ path: 'verification/call.png', fullPage: true });
  });
  await pass('Timer expiry, XP recap, microphone release and phrase persistence', async () => {
    for (const page of [a, b]) {
      await page.locator('#recap').waitFor({ state: 'visible', timeout: 20000 });
      assert.match(await page.locator('#xp').textContent(), /15 XP/);
      assert.equal(await page.evaluate(() => captured.at(-1).getTracks()[0].readyState), 'ended');
    }
    await a.click('#save');
    await a.reload();
    assert.equal(await a.evaluate(() => localStorage.getItem('character-chat-phrase')), 'saved');
  });
  await pass('Rematch, early leave and partner notification', async () => {
    await a.click('#find');
    await b.click('#again');
    for (const page of [a, b]) await page.getByText('Connected · both voices filtered', { exact: true }).waitFor();
    await a.click('#leave');
    await b.locator('#recap').waitFor({ state: 'visible' });
    assert.equal(await b.evaluate(() => captured.at(-1).getTracks()[0].readyState), 'ended');
  });
  await pass('Voice processor failure closes call and releases mic', async () => {
    await a.click('#again');
    await b.click('#again');
    await a.getByText('Connected · both voices filtered', { exact: true }).waitFor();
    await a.evaluate(() => {
      const voice = worklets.findLast(node => typeof node.onprocessorerror === 'function');
      voice.onprocessorerror(new Event('processorerror'));
    });
    await a.getByText('Voice filter failed. The microphone is muted and the call has ended.', { exact: true }).waitFor();
    assert.equal(await a.evaluate(() => captured.at(-1).getTracks()[0].readyState), 'ended');
    await b.locator('#recap').waitFor({ state: 'visible' });
  });
  await pass('Dropped signaling connection fails closed', async () => {
    await a.click('#again');
    await b.click('#again');
    await a.getByText('Connected · both voices filtered', { exact: true }).waitFor();
    await contexts[0].setOffline(true);
    await a.locator('#recap').waitFor({ state: 'visible', timeout: 12000 });
    assert.equal(await a.evaluate(() => captured.at(-1).getTracks()[0].readyState), 'ended');
    await contexts[0].setOffline(false);
  });
  await pass('Missing processor heartbeat ends the call', async () => {
    await b.locator('#recap').waitFor({ state: 'visible', timeout: 15000 });
    await a.click('#again');
    await b.click('#again');
    await a.getByText('Connected · both voices filtered', { exact: true }).waitFor();
    await a.evaluate(() => { worklets.at(-1).port.onmessage = null; });
    await a.getByText('Voice filter stopped. The microphone is muted and the call has ended.', { exact: true }).waitFor();
    assert.equal(await a.evaluate(() => captured.at(-1).getTracks()[0].readyState), 'ended');
  });
  console.log(JSON.stringify({ passed: results }, null, 2));
} finally {
  await browser?.close();
  server.kill();
  await unlink(tonePath);
}
