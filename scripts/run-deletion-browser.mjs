import { appendFile, copyFile, lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const artifacts = resolve(root, '.playwright-mcp', `deletion-terminal-${Date.now()}`);
await mkdir(artifacts, { recursive: true });
const scriptPath = resolve(root, 'tests/browser/project-deletion-regressions.playwright.js');
await copyFile(scriptPath, resolve(artifacts, 'journey.playwright.js'));
await copyFile(fileURLToPath(import.meta.url), resolve(artifacts, 'runner.mjs'));
await copyFile(resolve(root, 'tests/browser/verify-project-deletion-filesystem.ps1'), resolve(artifacts, 'verify-project-deletion-filesystem.ps1'));
await writeFile(resolve(artifacts, 'steps.jsonl'), '');
const journey = new Script(`(${await readFile(scriptPath, 'utf8')})`, { filename: scriptPath }).runInThisContext();
let browser;
let logWrites = Promise.resolve();
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  context.setDefaultTimeout(30_000);
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4310');
  const result = await journey(page, {
    artifacts,
    onStep(entry) {
      console.log(`Etapa ${entry.step}: ${entry.action}`);
      logWrites = logWrites.then(() => appendFile(resolve(artifacts, 'steps.jsonl'), `${JSON.stringify(entry)}\n`));
    },
  });
  if (!result.passed || !/^deletion-ui-\d+-[a-z0-9]+$/.test(result.run) || result.fixtures.length !== 3) {
    throw new Error('Expected three verified local fixtures');
  }
  for (const fixture of result.fixtures) {
    const directory = resolve(fixture.directory);
    if (dirname(directory).toLowerCase() !== resolve(result.projectsRoot).toLowerCase()
      || basename(directory) !== fixture.relative || !fixture.relative.startsWith(`${result.run}-`)) {
      throw new Error('Fixture is outside this run and its projects root');
    }
    try {
      await lstat(directory);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    throw new Error(`A temporary directory remains: ${fixture.relative}`);
  }
  await writeFile(resolve(artifacts, 'filesystem.json'), JSON.stringify({ passed: true, checkedDirectories: result.fixtures.length, run: result.run }, null, 2));
  console.log(`Jornadas aprovadas: ${result.scenarios.length}. Pastas temporárias removidas.`);
} catch (error) {
  await writeFile(resolve(artifacts, 'failure.txt'), String(error));
  console.error(String(error));
  process.exitCode = 1;
} finally {
  await logWrites;
  await browser?.close();
  console.log(`Evidências: ${artifacts}`);
}
