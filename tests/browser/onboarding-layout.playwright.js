async (page) => {
  const origin = new URL(page.url()).origin;
  const evidence = `.cache/sprint043/onboarding-layout-${Date.now()}`;
  const observations = [];
  const mutations = [];
  const observeRequest = request => {
    if (new URL(request.url()).pathname.startsWith('/api/v1/') && request.method() !== 'GET' && !request.url().endsWith('/session')) mutations.push(request.method() + ' ' + new URL(request.url()).pathname);
  };
  page.on('request', observeRequest);
  try {
    await page.goto(`${origin}/#principal/dashboard?dialog=initial-setup`);
    await page.reload();
    await page.locator('.onboarding-footer').waitFor();
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 640 }, { width: 312, height: 512 }]) {
      await page.setViewportSize(viewport);
      await page.getByRole('button', { name: 'Fechar por enquanto', exact: true }).focus();
      await page.keyboard.press('Tab');
      const result = await page.locator('.initial-setup-dialog').evaluate(dialog => {
        const bounds = dialog.getBoundingClientRect();
        const buttons = [...dialog.querySelectorAll('.onboarding-footer button')].map(button => {
          const box = button.getBoundingClientRect();
          return { label: button.textContent, inside: box.left >= bounds.left && box.right <= bounds.right && box.top >= 0 && box.bottom <= innerHeight };
        });
        return { width: dialog.clientWidth, scrollWidth: dialog.scrollWidth, pageFits: document.documentElement.scrollWidth <= innerWidth,
          focusInside: dialog.contains(document.activeElement), buttons };
      });
      const screenshot = `${evidence}/${viewport.width}x${viewport.height}.png`;
      await page.screenshot({ path: screenshot });
      observations.push({ viewport, ...result, screenshot });
      if (result.scrollWidth > result.width + 1 || !result.pageFits) throw new Error(`Wizard horizontal overflow at ${viewport.width}: ${JSON.stringify(result)}`);
      if (!result.focusInside || result.buttons.some(button => !button.inside)) throw new Error(`Wizard actions or keyboard focus outside bounds: ${JSON.stringify(result)}`);
    }
    if (mutations.length) throw new Error('Unexpected mutations: ' + JSON.stringify(mutations));
    return { passed: true, observations, mutations, limits: 'Effective viewports and keyboard focus; not native Chrome or Windows zoom.' };
  } finally { page.off('request', observeRequest); }
}
