// Takes a gameplay screenshot through the Chrome DevTools Protocol.
// The plain --screenshot flag snaps right after load, before the game
// has time to run. Usage: node scripts/screenshot.js <url> <waitMs> <out>
const [url, waitMs, out] = process.argv.slice(2);

const port = process.env.CDP_PORT || '9222';
const targets = await (await fetch(`http://localhost:${port}/json`)).json();
const page = targets.find((t) => t.type === 'page');
if (!page) throw new Error('no page target found');

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve) => { ws.onopen = resolve; });

let nextId = 1;
const pending = new Map();
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
};

function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await send('Page.enable');
await send('Page.navigate', { url });
await new Promise((r) => setTimeout(r, 2000));
await new Promise((r) => setTimeout(r, Number(waitMs)));
const shot = await send('Page.captureScreenshot', { format: 'png' });
const { writeFile } = await import('node:fs/promises');
await writeFile(out, Buffer.from(shot.result.data, 'base64'));
console.log('wrote ' + out);
ws.close();
process.exit(0);
