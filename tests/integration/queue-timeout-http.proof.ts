import Fastify from 'fastify';
import { setTimeout } from 'node:timers/promises';
import { expect, it } from 'vitest';
import { installQueueRoutes } from '../../apps/controller/src/http/routes/queue.js';
import { createQueue, type Projects } from '../../apps/controller/src/modules/projects/index.js';
import { attemptFixture } from '../fixtures/attempt.js';

it('returns a cold queue observation after the global socket inactivity limit', async () => {
  const f = await attemptFixture();
  await f.pipeline.close();
  const queue = createQueue({ storage: f.storage, github: f.github, workspaces: f.workspaces });
  const result = await queue.read({});
  const app = Fastify({ connectionTimeout: 30 });
  const projects = { getQueue: async () => { await setTimeout(100); return result; } } as unknown as Projects;
  installQueueRoutes(app, projects);
  try {
    const origin = await app.listen({ port: 0, host: '127.0.0.1' });
    const response = await fetch(`${origin}/api/v1/queue`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ complete: true, account: { login: 'test-user' } });
  } finally {
    await app.close();
    await f.close();
  }
});
