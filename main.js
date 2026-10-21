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