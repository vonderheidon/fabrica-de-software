import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

export function installAssets(app: FastifyInstance, webRoot: string) {
  if (!existsSync(resolve(webRoot, 'index.html'))) return;
  app.register(async assets => {
    assets.addHook('onRoute', route => {
      route.config = { ...route.config, publicAsset: true };
    });
    assets.addHook('onSend', async (request, reply) => {
      if ((reply.statusCode >= 200 && reply.statusCode < 300) || reply.statusCode === 304) {
        const route = request.routeOptions.url;
        if (route === '/favicon.ico') reply.header('Content-Type', 'image/vnd.microsoft.icon');
        reply.header('Cache-Control', route === '/' || route?.endsWith('/index.html') ? 'no-store' : 'public, max-age=31536000, immutable');
      }
    });
    await assets.register(fastifyStatic, {
      root: webRoot,
      prefix: '/',
      wildcard: false,
      globIgnore: ['assets/**'],
      cacheControl: false,
      index: ['index.html'],
      dotfiles: 'ignore',
    });
    await assets.register(fastifyStatic, {
      root: resolve(webRoot, 'assets'),
      prefix: '/assets/',
      decorateReply: false,
      wildcard: true,
      cacheControl: false,
      index: false,
      dotfiles: 'ignore',
    });
  });
}
