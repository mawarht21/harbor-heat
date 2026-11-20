// HARBOR HEAT local server.
//
// A deliberately small static file server for the whole repository root.
// Serving the root (rather than only game/) lets the README's screenshots
// and the game's own files share one origin during development:
//
//   node serve.ts --port 8080
//   http://localhost:8080/game/
//
// Node's standard library is enough: resolve the request path, reject
// anything that escapes the repository, stream the file with a browser
// MIME type, and send no-store so edited game modules are never stale.

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(fileURLToPath(new URL('.', import.meta.url)));
const argumentsList = process.argv.slice(2);
const portFlagIndex = argumentsList.indexOf('--port');
const requestedPort = portFlagIndex === -1 ? 8080 : Number(argumentsList[portFlagIndex + 1]);
const port = Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort < 65536
  ? requestedPort
  : 8080;

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
};

function sendText(response: any, status: number, text: string) {
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  response.end(text);
}

const server = createServer((request, response) => {
  const requestUrl = new URL(request.url ?? '/', 'http://localhost');
  let pathname: string;
  try {
    pathname = decodeURIComponent(requestUrl.pathname);
  } catch {
    sendText(response, 400, 'bad request');
    return;
  }

  if (pathname === '/') pathname = '/game/';
  if (pathname.endsWith('/')) pathname += 'index.html';

  const relativePath = normalize(pathname).replace(/^[/\\]+/, '');
  const filePath = resolve(join(repositoryRoot, relativePath));
  if (filePath !== repositoryRoot && !filePath.startsWith(repositoryRoot + sep)) {
    sendText(response, 403, 'forbidden');
    return;
  }

  let fileSize: number;
  try {
    const stats = statSync(filePath);
    if (!stats.isFile()) throw new Error('not a regular file');
    fileSize = stats.size;
  } catch {
    sendText(response, 404, 'not found');
    return;
  }

  response.writeHead(200, {
    'content-type': MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    'content-length': fileSize,
    'cache-control': 'no-store',
  });
  createReadStream(filePath).pipe(response);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`HARBOR HEAT repository is on http://localhost:${port}/game/`);
});
