async (page) => {
  const check = (value,message) => { if (!value) throw new Error(message); };
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const aid=id(1),pid=id(2),did=id(3),prepId=id(4),origin='http://127.0.0.1:4310';
  const available={available:true},unavailable={available:false},measured={state:'unavailable',reason:'NOT_OBSERVED'};
  const profiles=['implementer','reviewer'].map((role,index)=>({id:id(20+index),revision:1,name:role,profile_type:role,executor:'maestri-omp',provider:'controlled',model:'controlled',effort:null,guidance:'',created_at_ms:1,updated_at_ms:1}));
  const time={format_version:1,polling_interval_ms:15000,passage_active_time_ms:1800000,question_ttl:{state:'not_configured'}};
  const policy={format_version:1,automatic_deletion:false};
  const settings={settings:{id:'local',installation_id:'sprint029-controlled',account_id:'account',projects_root:'projects',automation_enabled:false,revision:1,time_defaults:time,artifact_policy:policy},profiles,
    profile_counts:{all:2,implementer:1,reviewer:1},event_cursor:'1',onboarding:{suppressed:true,completed_at_ms:null,first_incomplete_step:null,prerequisites:[]},selection_capabilities:{},tool_preferences:{format_version:1,...Object.fromEntries(['git','maestri','omp','powershell'].map(key=>[key,{preferred_path:null,last_validated_at_ms:null}]))}};
  const configuration={source:{kind:'github',repository_id:'repo',repository_url:'https://github.com/example/project',location:null},base_branch:'main',default_delivery_mode:'icr',guidance:'',checks:[],correction_limit:3,automation_enabled:false};
  const preparation={id:prepId,project_id:pid,project_revision_id:id(5),revision:1,issue_id:'issue',delivery_mode:'icr',guidance:'',overrides:{},publication_target:null,
    effective_configuration:{configuration,implementer_profile:profiles[0],reviewer_profile:profiles[1],time_defaults:time,artifact_policy:policy,origins:{}},
    criteria_preview:{executable:true,criteria:[{id:'ac-1',text:'Preservar a versão aprovada',occurrence_index:1,explicit:true}],reasons:[]},prerequisites:[],effects_preview:[],issue:{id:'issue',number:29,title:'Entrega verificável',state:'OPEN',assignees:[{login:'operador'}]},base_sha:'a'.repeat(40),summary_hash:'a'.repeat(64),can_start:false};
  let mode='icr',outcome='icr_approved',revision=1,lose=false,failRefresh=false,failSave=false,adapted=false,legacy=false;
  const operations=new Map(),mutations=[],errors=[],captures=[];
  const measurements={active_time:measured,human_wait:measured,cost:measured,active_limit:{state:'not_configured'},question_ttl:{state:'not_configured'},active_limit_state:'unavailable',active_expired_at_ms:null,passages:[],pending_requirements:[]};
  const summary=()=>({attempt_id:aid,delivery_id:did,original_mode:'icr',authorized_mode:mode,review_state:adapted?'pending':'approved',outcome,content_identity:'b'.repeat(40),approved_ref:adapted?null:`refs/factory/deliveries/${did}`,code_location:'C:/trabalhos/tentativa',local_repository:mode==='icr'||legacy?null:'C:/projetos/entrega',branch_ref:mode==='icr'?null:'refs/heads/feat/29-entrega-verificavel',commit_sha:mode==='icr'?null:'c'.repeat(40),pull_request_url:mode==='pr'?'https://github.com/example/project/pull/29':null,checkout_updated:false,pending_effects:adapted?['local_commit']:[],limitations:adapted?['A adaptação aguarda checks e revisão da nova versão.']:legacy?['O histórico não informa o destino local do commit; consulte os registros antes de continuar.']:mode!=='icr'?['Commit confirmado em branch própria; o checkout do operador não foi atualizado.']:['Nenhum check configurado para esta versão; confira os critérios na revisão.'],criteria_satisfied:adapted?0:1,criteria_total:1,checks_succeeded:0,checks_total:0,resolved_findings:0,details_url:`/api/v1/deliveries/${did}`});
  const publication=()=>({mode,review_state:adapted?'pending':'approved',local_state:adapted?'pending':'completed',confirmed_effects:mode==='icr'?1:3,pending_effects:0,unknown_effects:0,
    commit:mode==='icr'?{state:'not_requested',sha:null,reason:null,operation_id:null,branch_ref:null,task_type:null,task_description:null}:{state:'confirmed',sha:'c'.repeat(40),reason:null,operation_id:id(8),branch_ref:'refs/heads/feat/29-entrega-verificavel',task_type:'feat',task_description:'Entrega verificável'},
    upgrades:adapted||mode==='pr'?[]:(mode==='icr'?['commit','pr']:['pr']).map(target=>({target_mode:target,summary_hash:'d'.repeat(64),additional_effects:[...(mode==='icr'?['local_commit']:[]),...(target==='pr'?['push','pull_request']:[])],publication_target:preparation.publication_target,capability:available})),
    push:{state:mode==='pr'?'confirmed':'not_requested',receipt:null,reason:null},pull_request:{state:mode==='pr'?'confirmed':'not_requested',receipt:mode==='pr'?{url:'https://github.com/example/project/pull/29'}:null,reason:null},complete_capability:unavailable,reconcile_capability:unavailable});
  const attempt=()=>({id:aid,project_id:pid,operation_id:id(6),passage_id:id(7),round:adapted?2:1,phase:adapted?'reviewing':'finished',result:adapted?null:'delivered',suspension:null,tracking:'tracked',diagnostic:null,result_receipt_id:null,delivery_id:did,revision,created_at_ms:1,updated_at_ms:1,event_cursor:'1',issue:{id:'issue',number:29,title:'Entrega verificável',url:'https://github.com/example/project/issues/29'},expected_account_id:'account',selected_delivery_id:did,selected_round:adapted?2:1,delivery_summary:summary(),publication:publication(),publication_target:preparation.publication_target,publication_target_hash:null,measurements,cleanup:'complete',authority:null,block:null,v3_details:null,details:null,capabilities:{cancel:unavailable,complete_publication:unavailable,reconcile_publication:unavailable,revalidate:unavailable}});
  if(page.url().startsWith(origin)) await page.evaluate(({aid})=>{
    const key='factory.uncertain-operations.v1',stored=JSON.parse(sessionStorage.getItem(key)||'[]');
    sessionStorage.setItem(key,JSON.stringify(stored.filter(item=>item.attemptId!==aid)));
    for(const name of Object.keys(localStorage)) if(name.startsWith('factory.preparation-reference.v1:')&&name.includes('sprint029-controlled')) localStorage.removeItem(name);
  },{aid});
  await page.goto('about:blank'); await page.unroute('**/api/v1/**');
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/v1/**',async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method();
    const reply=(json,status=200)=>route.fulfill({status,json,headers:{etag:`"${aid}:${revision}"`}});
    if(req.resourceType()==='eventsource') return route.fulfill({contentType:'text/event-stream',body:': controlled\n\n'});
    if(path==='/api/v1/session') return reply({csrf_token:'c'.repeat(43),instance_id:id(99)});
    if(method!=='GET') {
      const body=req.postDataJSON(); mutations.push({path,method,body,operation:req.headers()['idempotency-key']});
      if(path==='/api/v1/settings/selections') return reply({kind:'project_directory',state:'selected',path:'C:/destinos',observed_at_ms:1});
      if(path.endsWith('/preparations')) return reply({preparation,operation_id:req.headers()['idempotency-key'],event_cursor:'1',receipt:{revision:1,event_cursor:'1'}},201);
      if(path===`/api/v1/preparations/${prepId}`) {
        if(failSave) {failSave=false;return reply({code:'FIELD_INVALID',message:'Revise o destino.',request_id:'controlled'},422);}
        Object.assign(preparation,body.changes);preparation.revision++;preparation.summary_hash='b'.repeat(64);
        return reply({preparation,operation_id:req.headers()['idempotency-key'],event_cursor:'1',receipt:{revision:preparation.revision,event_cursor:'1'}});
      }
      if(path.endsWith('/publication/authorize-upgrade')) {
        const op=req.headers()['idempotency-key'];
        operations.set(op,{operation_id:op,kind:'publication.authorize-upgrade',resource:{type:'attempt',id:aid},state:lose?'unknown':'succeeded',request_id:'controlled'});
        if(lose) return route.abort('failed');
        mode=body.target_mode;outcome='complete';revision++;
        return reply({operation_id:op,resource:{type:'attempt',id:aid},status_url:`/api/v1/operations/${op}`,request_id:'controlled'},202);
      }
      throw new Error('Unexpected mutation '+path);
    }
    if(path==='/api/v1/settings') return reply(settings);
    if(path===`/api/v1/projects/${pid}`) return reply({project:{id:pid,name:'Projeto de entrega'},deletion:null});
    if(path.endsWith('/configuration')) return reply({configuration,deletion:null});
    if(path.endsWith('/issues')) return reply({items:[{id:'card',content_id:'issue',kind:'issue',executable:true,title:'Entrega verificável',reasons:[]}],completeness:'complete',prerequisites:[],diagnostics:[]});
    if(path===`/api/v1/preparations/${prepId}`) return reply({preparation,event_cursor:'1'});
    if(path.startsWith('/api/v1/operations/')) return reply(operations.get(path.split('/').at(-1)));
    if(path.endsWith('/resources')) return reply({entries:[],cleanup:'complete',event_cursor:'1'});
    if(path.endsWith('/diagnostics')) return reply({context:{scope:'attempt',id:aid},supported_checks:[],reports:[],diagnostics:[],event_cursor:'1'});
    if(path.endsWith('/producer-result')) return reply(null);
    if(path===`/api/v1/deliveries/${did}`) {
      if(failRefresh) return reply({code:'AUTHORITY_UNAVAILABLE',message:'Consulta indisponível.',request_id:'controlled'},503);
      return reply({delivery:{id:did,attempt_id:aid,producer_passage_id:id(7),round:adapted?2:1,capture_state:'captured',warnings:[],revision:1},verification:null,delivery_summary:summary(),attempt:attempt(),issue:attempt().issue,measurements,cleanup:'complete',authorizations:{captured_mode:'icr',authorized_mode:mode,requires_current_gate:true},publication:publication(),capabilities:{diff:available,complete_publication:unavailable,reconcile_publication:unavailable},details:null});
    }
    if(path===`/api/v1/attempts/${aid}`) {
      const section=url.searchParams.get('section');
      if(section==='target_selections') return reply({...attempt(),v3_details:{section,items:mode==='icr'?[]:[{state:'confirmed',local_path:'C:/destinos/entrega'}],has_more:false,next_cursor:null}});
      return reply({...attempt(),details:section?{section,items:[],has_more:false,next_cursor:null,event_cursor:'1'}:null});
    }
    if(path==='/api/v1/attempts') return reply({items:[attempt()],has_more:false,next_cursor:null,event_cursor:'1'});
    return reply({items:[],has_more:false,next_cursor:null,event_cursor:'1',prerequisites:[],diagnostics:[]});
  });
  const detailUrl=`${origin}/#principal/tentativas?dialog=detail&attemptId=${aid}`;
  const prepUrl=`${origin}/#principal/projetos?dialog=preparation&projectId=${pid}&issueId=issue`;
  const panel=page.getByRole('region',{name:'Entrega da versão selecionada'});
  async function shot(name){const path=`tests/browser/evidence/sprint029/${name}.png`;await page.screenshot({path,fullPage:true});captures.push(path);}
  await page.setViewportSize({width:1440,height:1000});await page.goto(prepUrl);await page.waitForLoadState('networkidle');
  await page.getByText('Salvar guarda o destino;', {exact:false}).waitFor();
  await page.getByRole('button',{name:'Selecionar pasta',exact:true}).click();
  await page.getByRole('textbox',{name:'Nome da nova pasta dentro deste local'}).fill('entrega');
  await page.getByRole('button',{name:'Planejar clonagem neste local'}).click();
  await page.waitForTimeout(650);
  check(preparation.publication_target?.selection.destination==='C:/destinos/entrega','target not saved');await shot('01-preparation-target');
  await page.reload();await page.waitForLoadState('networkidle');
  check(await page.getByRole('textbox',{name:'Caminho local',exact:true}).inputValue()==='C:/destinos/entrega','target lost on reload');
  failSave=true;await page.getByRole('button',{name:'Limpar destino salvo'}).click();await page.getByText('Não foi possível confirmar a preparação',{exact:true}).waitFor();
  check(preparation.publication_target!==null,'failed save changed server');await shot('02-failed-save');
  await page.getByRole('button',{name:'Selecionar pasta',exact:true}).click();await page.getByRole('button',{name:'Usar como clone existente',exact:true}).click();await page.waitForTimeout(650);
  check(preparation.publication_target?.selection.kind==='existing_clone','existing clone intent not saved');
  await page.getByRole('button',{name:'Limpar destino salvo',exact:true}).click();await page.waitForTimeout(650);check(preparation.publication_target===null,'clear did not persist');
  await page.getByRole('textbox',{name:'Nome da nova pasta dentro deste local'}).fill('entrega');await page.getByRole('button',{name:'Planejar clonagem neste local'}).click();await page.waitForTimeout(650);
  await page.goto(detailUrl);await panel.getByRole('heading',{name:'ICR aprovado',exact:true}).waitFor();await shot('03-icr-desktop');
  check(await panel.locator('input[type=checkbox]').count()===0,'redundant confirmation');
  await panel.getByRole('button',{name:'Integrar e criar commit',exact:true}).click();
  await panel.getByRole('heading',{name:'Entrega concluída',exact:true}).waitFor();await shot('04-commit');
  check(await panel.getByText('checkout do operador não foi atualizado',{exact:false}).count()===1,'checkout fact missing');
  await page.locator('summary').filter({hasText:'Destino da versão aprovada'}).click();
  await page.getByText('Branch feat/29-entrega-verificavel',{exact:true}).waitFor();
  await page.getByText('C:/destinos/entrega',{exact:true}).waitFor();await shot('04b-target-facts');
  await panel.getByRole('button',{name:'Publicar branch e abrir PR',exact:true}).click();await panel.getByRole('link',{name:'Ver PR',exact:true}).waitFor();await shot('05-pr');
  mode='commit';legacy=true;revision++;await page.getByRole('button',{name:'Atualizar tentativa',exact:true}).click();await panel.getByText('histórico não informa o destino local',{exact:false}).waitFor();await shot('06-legacy');
  adapted=true;outcome='pending';revision++;await page.getByRole('button',{name:'Atualizar tentativa',exact:true}).click();await panel.getByText('adaptação aguarda checks',{exact:false}).waitFor();await shot('07-adaptation');
  adapted=false;legacy=false;mode='icr';outcome='icr_approved';revision++;await page.getByRole('button',{name:'Atualizar tentativa',exact:true}).click();await panel.getByRole('heading',{name:'ICR aprovado',exact:true}).waitFor();
  failRefresh=true;await page.getByRole('button',{name:'Atualizar tentativa',exact:true}).click();await panel.getByText('Última consulta desta versão.',{exact:false}).waitFor();check(await panel.getByRole('button',{name:'Integrar e criar commit',exact:true}).isDisabled(),'stale publication enabled');await shot('08-refresh-failed');failRefresh=false;
  await page.getByRole('button',{name:'Atualizar tentativa',exact:true}).click();await page.waitForLoadState('networkidle');
  lose=true;const before=mutations.filter(x=>x.path.endsWith('/authorize-upgrade')).length;
  await panel.getByRole('button',{name:'Integrar e criar commit',exact:true}).click();await panel.getByRole('button',{name:'Consultar operação original',exact:true}).waitFor();
  await page.reload();await page.waitForLoadState('networkidle');await panel.getByRole('button',{name:'Consultar operação original',exact:true}).waitFor();
  check(mutations.filter(x=>x.path.endsWith('/authorize-upgrade')).length===before+1,'lost response replayed');await shot('09-lost-response-reopened');
  await page.setViewportSize({width:390,height:640});await panel.scrollIntoViewIfNeeded();await shot('10-narrow');
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'narrow page overflow');
  await page.setViewportSize({width:1100,height:480});await page.getByRole('button',{name:'Atualizar tentativa',exact:true}).scrollIntoViewIfNeeded();await shot('11-low');
  check(await page.getByRole('button',{name:'Atualizar tentativa',exact:true}).evaluate(node=>{const box=node.getBoundingClientRect();return box.top>=0&&box.bottom<=innerHeight;}),'footer action outside low viewport');
  const continuation_accessibility=[];
  for(const size of [{width:390,height:640},{width:1100,height:480}]) {
    await page.setViewportSize(size);const action=panel.getByRole('button',{name:'Integrar e criar commit',exact:true});
    await action.evaluate(node=>node.scrollIntoView({block:'center'}));
    const geometry=await action.evaluate(node=>{const box=node.getBoundingClientRect(),footer=document.querySelector('.attempt-detail .dialog-actions').getBoundingClientRect();return {top:box.top,bottom:box.bottom,footer_top:footer.top};});
    check(geometry.top>=0&&geometry.bottom<=geometry.footer_top,'continuation action occluded');
    continuation_accessibility.push({...size,...geometry});await shot(`12-continuation-${size.width}`);
  }
  check(errors.length===0,errors.join('\n'));check(mutations.every(x=>!x.path.endsWith('/publication/target')),'preparation emitted V01');
  return {passed:true,surface:'Playwright MCP, compiled UI, controlled HTTP',captures,continuation_accessibility,browser:await page.evaluate(()=>navigator.userAgent),assets:await page.locator('script[src]').evaluateAll(nodes=>nodes.map(node=>node.src)),mutations:mutations.map(x=>({path:x.path,method:x.method})),errors,states:['preparation','reload','save_failure','icr','commit','pr','legacy','adaptation','refresh_failure','lost_response','narrow','low']};
}
