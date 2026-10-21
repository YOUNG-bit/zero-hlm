const fullFiles = new Map();
const pending = new Map();
const MAX_BYTES = 48 * 1024 * 1024;
let storedBytes = 0;
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
function retain(url, file) {
  if (file.bytes.byteLength > MAX_BYTES) return;
  if (fullFiles.has(url)) { storedBytes -= fullFiles.get(url).bytes.byteLength; fullFiles.delete(url); }
  while (storedBytes + file.bytes.byteLength > MAX_BYTES && fullFiles.size) {
    const key = fullFiles.keys().next().value;
    storedBytes -= fullFiles.get(key).bytes.byteLength;
    fullFiles.delete(key);
  }
  fullFiles.set(url, file);
  storedBytes += file.bytes.byteLength;
}
function sliceResponse(file, range) {
  const size = file.bytes.byteLength;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) return new Response(null, {status:416, headers:{'Content-Range':`bytes */${size}`}});
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (start > end || start >= size) return new Response(null, {status:416, headers:{'Content-Range':`bytes */${size}`}});
  return new Response(file.bytes.slice(start, end + 1), {status:206, headers:{
    'Content-Type':file.type, 'Accept-Ranges':'bytes',
    'Content-Range':`bytes ${start}-${end}/${size}`, 'Content-Length':String(end-start+1),
    'Cache-Control':'no-store'
  }});
}
async function serveRange(request) {
  const key = request.url;
  const range = request.headers.get('Range');
  let file = fullFiles.get(key);
  if (file) { fullFiles.delete(key); fullFiles.set(key,file); return sliceResponse(file,range); }
  if (pending.has(key)) return sliceResponse(await pending.get(key),range);
  const response = await fetch(request);
  if (response.status !== 200 || !/^(video\/|application\/octet-stream)/i.test(response.headers.get('Content-Type') || '')) return response;
  const loading = response.arrayBuffer().then(bytes => {
    const result = {bytes, type:response.headers.get('Content-Type') || 'video/mp4'};
    retain(key,result);
    return result;
  });
  pending.set(key,loading);
  try { return sliceResponse(await loading,range); }
  finally { if (pending.get(key) === loading) pending.delete(key); }
}
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.endsWith('.mp4') || !request.headers.has('Range')) return;
  event.respondWith(serveRange(request));
});
