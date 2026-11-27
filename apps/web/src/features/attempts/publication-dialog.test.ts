// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { HttpDeliveryDetail } from '#contracts';
import { PublicationDialog } from './PublicationDialog.js';
import { useDelivery } from './useDelivery.js';

const { read, send } = vi.hoisted(() => ({ read:vi.fn(),send:vi.fn() }));
vi.mock('../../api/http.js',async original => ({ ...await original<typeof import('../../api/http.js')>(),requestJson:read,requestJsonWithMetadata:send }));
const id = '00000000-0000-4000-8000-000000000001', version = '00000000-0000-4000-8000-000000000002';
const available = { available:true }, unavailable = { available:false };
function delivery(): HttpDeliveryDetail {
  return { delivery:{ id:version,capture_state:'captured',diagnostic:null },authorizations:{ captured_mode:'icr',authorized_mode:'icr' },
    publication:{ mode:'icr',review_state:'approved',local_state:'completed',confirmed_effects:1,pending_effects:0,unknown_effects:0,
      upgrades:[{ target_mode:'commit',summary_hash:'a'.repeat(64),additional_effects:['local_commit'],capability:available }] },
    capabilities:{ complete_publication:unavailable,reconcile_publication:unavailable },
    delivery_summary:{ attempt_id:id,delivery_id:version,original_mode:'icr',authorized_mode:'icr',review_state:'approved',outcome:'icr_approved',
      content_identity:'b'.repeat(40),approved_ref:'refs/factory/deliveries/'+version,code_location:'C:/work/attempt',local_repository:null,
      branch_ref:null,commit_sha:null,pull_request_url:null,checkout_updated:false,pending_effects:[],limitations:[],criteria_satisfied:2,criteria_total:2,
       resolved_findings:1,details_url:'/api/v1/deliveries/'+version } } as unknown as HttpDeliveryDetail;
}
let root: ReturnType<typeof createRoot> | null = null;
let container: HTMLDivElement;
const refresh = vi.fn();
async function mount(value = delivery(), current = true) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  if (!root) { container = document.createElement('div'); document.body.append(container); root = createRoot(container); }
  await act(async () => root!.render(createElement(PublicationDialog,{ projectId:id,attemptId:id,attemptEtag:'"attempt:1"',delivery:value,current,onRefresh:refresh })));
}
function button(label: string) { const node = [...container.querySelectorAll('button')].find(item => item.textContent === label); if (!node) throw new Error(label); return node; }
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = null; document.body.replaceChildren(); window.sessionStorage.clear(); vi.resetAllMocks(); vi.unstubAllGlobals(); });
function reads() { read.mockImplementation(async (path: string) => path.includes('/projects/') ? { deletion:null } : Promise.reject(new Error('Response lost'))); }

it('authorizes on one click, blocks a synchronous duplicate and presents 202 as acceptance',async () => {
  reads(); let release!: (value: unknown) => void;
  send.mockImplementation((_path: string, init: RequestInit) => new Promise(resolve => { release = () => resolve({ data:{ operation_id:(init.headers as Record<string,string>)['Idempotency-Key'] } }); }));
  await mount(); expect(container.querySelectorAll('input[type=checkbox]')).toHaveLength(0);
  expect(container.textContent).toContain('Critérios comprovados');
  expect(container.textContent).toContain('Revisão independente');
  expect(container.textContent).toContain('Referência fixa aprovada');
  expect(container.textContent).not.toContain('Checks aprovados');
  await act(async () => { button('Integrar e criar commit').click(); button('Integrar e criar commit').click(); });
  expect(send).toHaveBeenCalledOnce();
  expect(container.textContent).toContain('Enviando solicitação');
  expect(container.textContent).not.toContain('Sem confirmação');
  expect(container.querySelector('[role="status"][aria-busy="true"]')).not.toBeNull();
  expect(read.mock.calls.some(([path]) => String(path).includes('/operations/'))).toBe(false);
  expect(JSON.parse(send.mock.calls[0]![1].body)).toMatchObject({ authorized:true,authorized_additional_effects_hash:'a'.repeat(64),delivery_id:version });
  await act(async () => release({}));
  expect(container.textContent).not.toContain('Enviando solicitação'); expect(container.textContent).not.toContain('Entrega concluída');
  expect(button('Integrar e criar commit').disabled).toBe(true);
});

it('shows accepted work as in progress while automatically observing the original operation', async () => {
  read.mockImplementation(async (path: string) => path.includes('/projects/') ? { deletion: null } : { resource: { type: 'attempt', id }, state: 'running' });
  send.mockImplementation(async (_path: string, init: RequestInit) => ({ data: { operation_id: (init.headers as Record<string, string>)['Idempotency-Key'] } }));
  await mount();
  await act(async () => button('Integrar e criar commit').click());
  expect(container.textContent).toContain('Em andamento');
  expect(container.textContent).toContain('Acompanhando a operação automaticamente');
  expect(container.textContent).not.toContain('Resposta sem confirmação');
  expect(button('Integrar e criar commit').disabled).toBe(true);
});

it('retains an uncertain command across reopening without replaying the mutation',async () => {
  reads(); send.mockRejectedValue(new Error('Response lost')); await mount();
  await act(async () => button('Integrar e criar commit').click());
  const stored = JSON.parse(window.sessionStorage.getItem('factory.uncertain-operations.v1')!);
  expect(stored[0]).toMatchObject({ attemptId:id,deliveryId:version,kind:'delivery-publish' });
  await act(async () => root!.unmount()); root = null; await mount();
  expect(send).toHaveBeenCalledOnce(); expect(container.textContent).toContain('Consultar operação original');
  expect(button('Integrar e criar commit').disabled).toBe(true);
});

it('uses the consolidated outcome and disables effects for stale data',async () => {
  reads(); const value = delivery(); value.delivery_summary.outcome = 'partial'; value.delivery_summary.commit_sha = null;
  await mount(value,false); expect(container.querySelector('h3')?.textContent).toBe('Entrega parcial');
  expect(button('Integrar e criar commit').disabled).toBe(true); expect(container.textContent).toContain('Última consulta'); expect(send).not.toHaveBeenCalled();
});

it('does not attach an uncertain command from another version',async () => {
  reads(); window.sessionStorage.setItem('factory.uncertain-operations.v1',JSON.stringify([{ operationId:id,kind:'delivery-publish',recordedAt:1,attemptId:id,deliveryId:id }]));
  await mount(); expect(button('Integrar e criar commit').disabled).toBe(false);
  expect(read.mock.calls.every(([path]) => !String(path).includes('/operations/'))).toBe(true);
});

it('keeps the same version visible after refresh failure and discards it on selection change',async () => {
  const value = delivery(); send.mockResolvedValueOnce({ data:value });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true); container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  function Probe({ selected, reload }: { selected:string; reload:number }) { const state = useDelivery(selected,reload); return createElement('div',null,`${state.status}:${state.delivery?.delivery.id ?? 'none'}`); }
  await act(async () => root!.render(createElement(Probe,{ selected:version,reload:0 })));
  expect(container.textContent).toBe('ready:'+version);
  send.mockRejectedValue(new Error('offline'));
  await act(async () => root!.render(createElement(Probe,{ selected:version,reload:1 })));
  expect(container.textContent).toBe('error:'+version);
  await act(async () => root!.render(createElement(Probe,{ selected:id,reload:1 })));
  expect(container.textContent).toBe('error:none');
});

it('lists the files that block the commit in the Pasta do projeto and retries the commit on "Tentar de novo"',async () => {
  reads(); const value = delivery();
  value.publication = { ...value.publication,mode:'commit',commit:{ state:'failed_known',sha:null,reason:'PROJECT_FOLDER_DIRTY',operation_id:null,branch_ref:'refs/heads/main',task_type:'fix',task_description:'Corrigir',
    blocked:{ paths:['src/a.ts','b.txt'],path_count:2,expected_branch:null,current_branch:null } } } as typeof value.publication;
  value.authorizations = { captured_mode:'commit',authorized_mode:'commit' } as typeof value.authorizations;
  value.capabilities = { complete_publication:available,reconcile_publication:unavailable } as typeof value.capabilities;
  send.mockImplementation(async (_path: string, init: RequestInit) => ({ data:{ operation_id:(init.headers as Record<string,string>)['Idempotency-Key'] } }));
  await mount(value);
  expect(container.textContent).toContain('Commit bloqueado na Pasta do projeto');
  expect([...container.querySelectorAll('.blocked-paths code')].map(node => node.textContent)).toEqual(['src/a.ts','b.txt']);
  expect(container.textContent).toContain('alterações não salvas em commit');
  await act(async () => button('Tentar de novo').click());
  expect(send).toHaveBeenCalledOnce();
  expect(String(send.mock.calls[0]![0])).toContain('/publication/complete');
  expect(JSON.parse(send.mock.calls[0]![1].body)).toMatchObject({ delivery_id:version,authorized:true });
});

it('shows blocked paths and reconciles when local_commit is unknown after a partial repair failure', async () => {
  reads(); const value = delivery();
  value.publication = { ...value.publication,mode:'commit',commit:{ state:'unknown',sha:null,reason:'PROJECT_FOLDER_REPAIR_FAILED',operation_id:null,branch_ref:'refs/heads/main',task_type:'fix',task_description:'Corrigir',
    blocked:{ paths:['z-locked.txt'],path_count:1,expected_branch:'main',current_branch:'main' } } } as typeof value.publication;
  value.authorizations = { captured_mode:'commit',authorized_mode:'commit' } as typeof value.authorizations;
  value.capabilities = { complete_publication:unavailable,reconcile_publication:available } as typeof value.capabilities;
  send.mockImplementation(async (_path: string, init: RequestInit) => ({ data:{ operation_id:(init.headers as Record<string,string>)['Idempotency-Key'] } }));
  await mount(value);
  expect(container.textContent).toContain('Commit bloqueado na Pasta do projeto');
  expect([...container.querySelectorAll('.blocked-paths code')].map(node => node.textContent)).toEqual(['z-locked.txt']);
  await act(async () => button('Tentar de novo').click());
  expect(send).toHaveBeenCalledOnce();
  expect(String(send.mock.calls[0]![0])).toContain('/publication/reconcile');
  expect(JSON.parse(send.mock.calls[0]![1].body)).toEqual({ delivery_id:version });
});
