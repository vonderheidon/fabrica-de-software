import { copyFileSync, mkdirSync, readdirSync, cpSync } from 'node:fs';

const source = new URL('../apps/controller/src/modules/storage/migrations/', import.meta.url);
const target = new URL('../dist/apps/controller/src/modules/storage/migrations/', import.meta.url);
mkdirSync(target, { recursive: true });
for (const name of readdirSync(source).filter((file) => file.endsWith('.sql'))) {
  copyFileSync(new URL(name, source), new URL(name, target));
}

const roles = new URL('../resources/roles/', import.meta.url);
const distributedRoles = new URL('../dist/resources/roles/', import.meta.url);
mkdirSync(distributedRoles, { recursive: true });
for (const name of ['implementer.v1.json', 'reviewer.v1.json']) {
  copyFileSync(new URL(name, roles), new URL(name, distributedRoles));
}
cpSync(new URL('../resources/templates/', import.meta.url), new URL('../dist/resources/templates/', import.meta.url), { recursive: true });
