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
} else {
  await startServer();
}

async function startServer() {
  await mkdir(cacheDir, { recursive: true });

  const server = http.createServer(async (req, res) => {
    try {
      if (!['GET', 'PUT', 'DELETE'].includes(req.method)) {
        res.setHeader('Allow', 'GET, PUT, DELETE');
        return sendError(res, 405, 'Method not allowed');
      }

      const match = /^\/(\d{3})$/.exec(
        new URL(req.url, 'http://localhost').pathname
      );

      if (!match) {
        return sendError(res, 404, 'Invalid image path');
      }

      const code = Number(match[1]);

      if (code < 100 || code > 599) {
        return sendError(res, 404, 'Invalid status code');
      }

      const file = join(cacheDir, `${code}.jpg`);

      if (req.method === 'GET') {
        let image;

        try {
          image = await readFile(file);
          res.setHeader('X-Cache', 'HIT');
        } catch (error) {
          if (error.code !== 'ENOENT') {
            throw error;
          }

          try {
            const response = await superagent
              .get(`https://http.cat/${code}`)
              .buffer(true);

            image = response.body;

            if (!Buffer.isBuffer(image) || image.length === 0) {
              return sendError(res, 404, 'Image not found');
            }

            await writeFile(file, image);
            res.setHeader('X-Cache', 'MISS');
          } catch (error) {
            if (res.headersSent) {
              throw error;
            }

            console.error(
              'Помилка отримання зображення:',
              error.message
            );

            return sendError(res, 404, 'Image not found');
          }
        }

        res.writeHead(200, {
          'Content-Type': 'image/jpeg'
        });

        return res.end(image);
      }

      if (req.method === 'PUT') {
        const chunks = [];

        for await (const chunk of req) {
          chunks.push(chunk);
        }

        const image = Buffer.concat(chunks);

        if (image.length === 0) {
          return sendError(res, 400, 'Empty request body');
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
            return sendError(res, 404, 'Image not found in cache');
          }

          throw error;
        }

        res.writeHead(200);
        return res.end('Image deleted');
      }
    } catch (error) {
      console.error('Помилка сервера:', error.message);

      if (!res.headersSent) {
        return sendError(res, 500, 'Internal server error');
      }

      res.destroy();
    }
  });

  server.listen(port, host);

  console.log(`Проксі-сервер запущено: http://${host}:${port}`);
}

function sendError(res, status, message) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8'
  });

  res.end(message);
}
