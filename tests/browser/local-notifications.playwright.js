async (page) => {
  const output = 'C:/Users/jeffe/Documents/Apps/nova-fabrica-software/.playwright-mcp/sprint039';
  const origin = 'http://127.0.0.1:4310';
  const result = { controlled: {}, native: {}, errors: [] };
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const context = await page.context().browser().newContext();
  await context.grantPermissions(['notifications'], { origin });
  await context.addInitScript(() => {
    window.nativeObservations = [];
    const Native = window.Notification;
    window.Notification = class extends Native {
      constructor(...args) { super(...args); for (const type of ['show', 'error', 'click']) this.addEventListener(type, () => window.nativeObservations.push(type)); }
    };
  });
  const native = await context.newPage();
  await native.goto(origin + '/#principal/configuracao');
  await native.getByRole('button', { name: 'Ativar notificações', exact: true }).click();
  await native.evaluate(() => fetch('/proof/event'));
  await native.waitForTimeout(11000);
  result.native = await native.evaluate(async () => ({ supported: 'Notification' in window, permission: Notification.permission, observations: window.nativeObservations, backend: await (await fetch('/proof/state')).json() }));
  await context.close();

  const controlled = await page.context().browser().newContext();
  await controlled.addInitScript(() => {
    window.presentations = [];
    window.Notification = class {
      static permission = 'granted';
      static requestPermission = async () => 'granted';
      constructor(title, options) { this.title = title; this.options = options; window.presentations.push(this); setTimeout(() => this.onshow?.(), 10); }
      close() { this.onclose?.(); }
    };
  });
  const a = await controlled.newPage();
  a.on('pageerror', error => result.errors.push(error.message));
  await a.goto(origin + '/#principal/configuracao');
  await a.getByRole('button', { name: 'Ativar notificações', exact: true }).click();
  const b = await controlled.newPage();
  b.on('pageerror', error => result.errors.push(error.message));
  await b.goto(origin + '/#principal/configuracao');
  await b.getByRole('button', { name: 'Desativar notificações', exact: true }).waitFor();
  await a.waitForTimeout(500);
  const event = await a.evaluate(async () => (await fetch('/proof/event')).json());
  await a.waitForTimeout(800);
  const total = async () => (await a.evaluate(() => window.presentations.length)) + (await b.evaluate(() => window.presentations.length));
  assert(await total() === 1, 'two tabs must present once');
  const replay = async p => p.evaluate(seq => {
    window.dispatchEvent(new CustomEvent('factory-controller-event', { detail: { seq, event_type: 'question-raised' } }));
    window.dispatchEvent(new Event('factory-controller-resync'));
  }, event.seq);
  await replay(a); await replay(b); await a.waitForTimeout(500);
  assert(await total() === 1, 'SSE replay and resync must not repeat');
  const winner = await a.evaluate(() => window.presentations.length) ? a : b;
  await winner.evaluate(() => window.presentations[0].onclick());
  assert(winner.url().includes('attemptId=00000000-0000-4000-8000-000000000001&dialog=detail'), 'click destination');
  await winner.goto(origin + '/#principal/configuracao');
  await winner.reload();
  await winner.getByRole('button', { name: 'Desativar notificações', exact: true }).waitFor();
  await a.waitForTimeout(500);
  assert(await total() === 0, 'reload must not repeat');
  await a.evaluate(() => fetch('/proof/event?kind=attempt.icr-completed'));
  await a.waitForTimeout(800);
  assert(await total() === 1, 'different event must remain eligible');
  await a.setViewportSize({ width: 1440, height: 1000 });
  await a.screenshot({ path: output + '/wide.png', fullPage: true });
  await a.setViewportSize({ width: 390, height: 640 });
  await a.screenshot({ path: output + '/narrow.png', fullPage: true });
  assert(await a.evaluate(() => document.documentElement.scrollWidth === innerWidth), 'narrow overflow');
  result.controlled = { twoTabs: true, replay: true, resync: true, reload: true, differentEvent: true, localClick: true, narrow: true, backend: await a.evaluate(async () => (await fetch('/proof/state')).json()) };
  await controlled.close();
  const denied = await page.context().browser().newContext();
  await denied.addInitScript(() => { window.Notification = class { static permission = 'denied'; }; });
  const d = await denied.newPage(); await d.goto(origin + '/#principal/configuracao');
  await d.getByText('Permissão negada.', { exact: false }).waitFor();
  assert(await d.getByRole('button', { name: 'Ativar notificações', exact: true }).isDisabled(), 'denied state');
  result.controlled.denied = true;
  await denied.close();
  assert(result.errors.length === 0, 'page errors');
  return result;
}
