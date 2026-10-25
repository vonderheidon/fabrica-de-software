async (page) => {
  const url=new URL(page.url()),params=new URLSearchParams(url.hash.split('?')[1]);
  const project=params.get('projectId'),layout=params.get('baselineLayout') ?? await page.evaluate(() => window.__deletionBaselineLayout);
  if(url.origin!=='http://127.0.0.1:4310'||!project||!['legacy','managed'].includes(layout)) throw new Error('Open the disposable baseline project URL first');
  const config=page.locator('[data-dialog="project-configuration"]');
  const previewStart=await page.evaluate(()=>performance.now());
  await config.getByRole('button',{name:'Excluir definitivamente',exact:true}).click();
  const dialog=page.locator('.project-deletion-dialog');
  await page.waitForFunction(()=>{const node=document.querySelector('.project-deletion-dialog button.danger-button');return node&&!node.disabled;});
  const previewReady=await page.evaluate(()=>performance.now());
  const targets=(await dialog.locator('.project-deletion-targets li span, .project-deletion-location:has(small) > span').allTextContents()).flatMap(text=>text.split('\n'));
  if(!targets.length||targets.some(path=>!path.replaceAll('\\','/').includes('/.cache/deletion-baseline/fixtures/run-'))) throw new Error('Non-fixture deletion target');
  await dialog.evaluate(node=>{
    performance.clearResourceTimings();performance.setResourceTimingBufferSize(5000);
    window.__deletionBaseline={click_ms:null,submitting_dom_ms:null,accepted_dom_ms:null,submitting_raf_ms:null,accepted_raf_ms:null,raf_intervals:[]};
    let previous=null;const loop=now=>{const m=window.__deletionBaseline;if(previous!==null)m.raf_intervals.push(now-previous);previous=now;if(!m.stop)requestAnimationFrame(loop);};requestAnimationFrame(loop);
    node.addEventListener('click',event=>{if(event.target.closest('button.danger-button'))window.__deletionBaseline.click_ms=performance.now();},true);
    const observer=new MutationObserver(()=>{
      const m=window.__deletionBaseline,text=node.querySelector('[role="status"]')?.textContent||'';
      if(m.click_ms===null)return;
      if(text.includes('Enviando')&&m.submitting_dom_ms===null){m.submitting_dom_ms=performance.now();requestAnimationFrame(frame=>{m.submitting_raf_frame_ms=frame;m.submitting_raf_ms=performance.now();});}
      if((text.includes('Exclusão aceita')||text.includes('Exclusão em andamento')||text.includes('Exclusão concluída'))&&m.accepted_dom_ms===null){m.accepted_dom_ms=performance.now();requestAnimationFrame(frame=>{m.accepted_raf_frame_ms=frame;m.accepted_raf_ms=performance.now();});}
    });observer.observe(node,{childList:true,subtree:true,characterData:true});
  });
  const responsePromise=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname===`/api/v1/projects/${project}/deletion`,{timeout:120000});
  await dialog.getByRole('button',{name:'Excluir definitivamente',exact:true}).click();
  const response=await responsePromise;if(response.status()!==202)throw new Error('Deletion was not accepted: '+response.status());
  const accepted=await response.json();
  await page.waitForFunction(()=>window.__deletionBaseline.accepted_raf_ms!==null);
  await page.waitForTimeout(2000);
  const measurements=await page.evaluate(()=>{
    const m=window.__deletionBaseline;m.stop=true;
    const request=performance.getEntriesByType('resource').filter(entry=>entry.name.endsWith('/deletion')&&entry.startTime>=m.click_ms).at(-1);
    const ordered=m.raf_intervals.sort((a,b)=>a-b);
    return {click_to_submitting_dom_ms:m.submitting_dom_ms-m.click_ms,click_to_submitting_raf_ms:m.submitting_raf_ms-m.click_ms,
      click_to_submitting_raf_frame_ms:m.submitting_raf_frame_ms-m.click_ms,click_to_accepted_raf_frame_ms:m.accepted_raf_frame_ms-m.click_ms,
      raf_clock:'performance.now at callback observation; raw frame timestamps retained separately',
      click_to_response_end_ms:request?request.responseEnd-m.click_ms:null,click_to_accepted_dom_ms:m.accepted_dom_ms-m.click_ms,
      click_to_accepted_raf_ms:m.accepted_raf_ms-m.click_ms,raf_samples:ordered.length,raf_p95_ms:ordered[Math.ceil(ordered.length*.95)-1],raf_max_ms:ordered.at(-1),
      browser:navigator.userAgent,viewport:{inner_width:innerWidth,inner_height:innerHeight,device_pixel_ratio:devicePixelRatio,visibility:document.visibilityState},assets:[...document.querySelectorAll('script[src]')].map(node=>node.src)};
  });
  const screenshot=`.cache/deletion-baseline/ui-${layout}.png`;await page.screenshot({path:screenshot,fullPage:true});
  return {operation_id:accepted.operation_id,layout,project_id:project,targets:targets.length,preview_open_to_enabled_ms:previewReady-previewStart,...measurements,screenshot,
    scope:'Real compiled UI, real fixture HTTP/SQLite and Windows adapter. DOM and rAF are rendering proxies, not exact screen-paint timestamps; one run per layout, not a population p95.'};
}
