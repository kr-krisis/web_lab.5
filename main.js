import http from 'node:http';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Command } from 'commander';
import superagent from 'superagent';

const program = new Command();

program
  .helpOption(false)
  .requiredOption('-h, --host <address>', 'адреса сервера')
  .requiredOption('-p, --port <number>', 'порт сервера', Number)
  .requiredOption('-c, --cache <path>', 'тека кешу');

program.parse(process.argv);

const { host, port, cache } = program.opts();
const cacheDir = resolve(cache);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Помилка: порт має бути числом від 1 до 65535.');
  process.exitCode = 1;
}

if (process.exitCode !== 1) {
  await startServer();
}

async function startServer() {
  await mkdir(cacheDir, { recursive: true });

  const server = http.createServer(async (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Proxy server is running');
  });

  server.listen(port, host);
  console.log(`Проксі-сервер запущено: http://${host}:${port}`);
}

const match = /^\/(\d{3})$/.exec(
  new URL(req.url, 'http://localhost').pathname
);

if (!match) {
  res.writeHead(404);
  return res.end('Invalid image path');
}

const code = Number(match[1]);

if (code < 100 || code > 599) {
  res.writeHead(404);
  return res.end('Invalid status code');
}

const file = join(cacheDir, `${code}.jpg`);

if (req.method === 'GET') {
  let image;

  try {
    image = await readFile(file);
    res.setHeader('X-Cache', 'HIT');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;

    try {
      const response = await superagent
        .get(`https://http.cat/${code}`)
        .buffer(true);

      image = response.body;

      if (!Buffer.isBuffer(image) || image.length === 0) {
        res.writeHead(404);
        return res.end('Image not found');
      }

      await writeFile(file, image);
      res.setHeader('X-Cache', 'MISS');
    } catch {
      res.writeHead(404);
      return res.end('Image not found on http.cat');
    }
  }

  res.writeHead(200, { 'Content-Type': 'image/jpeg' });
  return res.end(image);
}

if (req.method === 'PUT') {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const image = Buffer.concat(chunks);

  if (image.length === 0) {
    res.writeHead(400);
    return res.end('Empty request body');
  }

  await writeFile(file, image);

  res.writeHead(201);
  return res.end('Image saved');
}

if (req.method === 'DELETE') {
  try {
    await unlink(file);
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.writeHead(404);
      return res.end('Image not found in cache');
    }

    throw error;
  }

  res.writeHead(200);
  return res.end('Image deleted');
}