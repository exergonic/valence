/**
 * A headless Edge (or Chrome) driven over the DevTools protocol: just enough to
 * use Valence the way a person does — load a page, run script in it, move and
 * click a real pointer, take a screenshot. No browser-automation dependency.
 *
 * Edge forks a tree of processes, and killing the launcher alone leaves them
 * running (280 after one day of README screenshots), so `close` asks the
 * browser to quit and then takes the whole tree.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = [
  process.env.VALENCE_BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter((p): p is string => !!p);

/** A free TCP port, so a stale browser holding an old one cannot answer. */
function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, () => {
      const port = (server.address() as { port: number }).port;
      server.close(() => resolve(port));
    });
  });
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function launchBrowser(width = 1600, height = 1000, scale = 1) {
  const executable = CANDIDATES.find((p) => existsSync(p));
  if (!executable) throw new Error('No Edge or Chrome found; set VALENCE_BROWSER to one');
  const port = await freePort();
  const profile = mkdtempSync(join(tmpdir(), 'valence-smoke-'));
  const proc = spawn(executable, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`, '--no-first-run', '--no-default-browser-check',
    '--ignore-gpu-blocklist', 'about:blank',
  ], { stdio: 'ignore' });

  let target: { webSocketDebuggerUrl: string } | undefined;
  for (let i = 0; i < 75 && !target; i++) {
    await sleep(200);
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((t: { type: string }) => t.type === 'page');
    } catch { /* not up yet */ }
  }
  if (!target) throw new Error('The browser never offered a page to drive');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let nextId = 0;
  const pending = new Map<number, (msg: any) => void>();
  /** Errors the page itself raised: uncaught exceptions and console.error. */
  const pageErrors: string[] = [];
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(String(e.data));
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)!(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      pageErrors.push(`exception: ${d.exception?.description?.split('\n')[0] ?? d.text}`);
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      pageErrors.push(`console.error: ${msg.params.args.map((a: any) => a.value ?? a.description).join(' ').slice(0, 200)}`);
    }
    // a dialog would freeze the page and every later call; note it and dismiss
    if (msg.method === 'Page.javascriptDialogOpening') {
      pageErrors.push(`dialog: ${msg.params.message}`);
      ws.send(JSON.stringify({ id: 0, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
    }
  });
  const send = (method: string, params: object = {}) => new Promise<any>((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, (msg) => (msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });

  /** Run `body` (the inside of an async function) in the page; its return value comes back. */
  const run = async (body: string) => {
    const r = await send('Runtime.evaluate', { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };

  const pointer = (type: string, x: number, y: number, extra: object = {}) =>
    send('Input.dispatchMouseEvent', { type, x, y, button: 'left', ...extra });

  return {
    pageErrors,
    run,
    async open(url: string) {
      await send('Page.navigate', { url });
      for (let i = 0; i < 300; i++) {
        await sleep(200);
        try {
          if (await run(`return document.readyState === 'complete' && !!window.jsmeApplet;`)) return;
        } catch { /* mid-navigation */ }
      }
      throw new Error(`${url} never finished loading`);
    },
    /** Move the pointer to (x, y) in small steps, as a hand does: the sketcher
     *  ignores a pointer that jumps. */
    async moveTo(x: number, y: number, from?: { x: number; y: number }) {
      const start = from ?? { x: x - 60, y: y - 60 };
      for (let i = 1; i <= 8; i++) {
        await pointer('mouseMoved', start.x + ((x - start.x) * i) / 8, start.y + ((y - start.y) * i) / 8);
        await sleep(20);
      }
    },
    async click(x: number, y: number) {
      await pointer('mousePressed', x, y, { clickCount: 1, buttons: 1 });
      await pointer('mouseReleased', x, y, { clickCount: 1 });
    },
    /** A PNG of part of the page, as a data URL. */
    async capture(clip: { x: number; y: number; width: number; height: number }): Promise<string> {
      const r = await send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 } });
      return `data:image/png;base64,${r.data}`;
    },
    async screenshot(file: string) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(file, Buffer.from(r.data, 'base64'));
    },
    async close() {
      try { await Promise.race([send('Browser.close'), sleep(1500)]); } catch { /* already gone */ }
      try { ws.close(); } catch { /* already closed */ }
      if (process.platform === 'win32') spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
      else proc.kill('SIGKILL');
      await sleep(500);
      try { rmSync(profile, { recursive: true, force: true }); } catch { /* still locked: the OS temp cleaner will have it */ }
    },
  };
}

export type Browser = Awaited<ReturnType<typeof launchBrowser>>;
