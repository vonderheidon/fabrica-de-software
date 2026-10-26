// @vitest-environment happy-dom
import { act,createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach,expect,it,vi } from 'vitest';
import { BranchSelector } from './BranchSelector.js';

const {request} = vi.hoisted(() => ({request:vi.fn()}));
vi.mock('../../api/http.js',() => ({requestJson:request}));
let root:Root | null = null;
afterEach(async () => { if(root) await act(async () => root!.unmount()); root=null;document.body.replaceChildren();vi.useRealTimers();request.mockReset(); });
async function mount() {
  vi.useFakeTimers();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const container=document.createElement('div');document.body.append(container);root=createRoot(container);
  const change=vi.fn();
  const render=async (location:string) => { await act(async () => root!.render(createElement(BranchSelector,{source:{kind:'github',location},value:'main',onChange:change}))); };
  return {container,change,render};
}
it('selects an existing branch by clicking an option without a free-text branch field',async () => {
  const f=await mount();request.mockResolvedValue({branches:['develop','main'],state:'complete',message:null});
  await f.render('https://github.com/org/repo');await act(async () => vi.advanceTimersByTimeAsync(250));
  await act(async () => (f.container.querySelector('[role="combobox"]') as HTMLButtonElement).click());
  await act(async () => (document.querySelector('button[data-value="develop"]') as HTMLButtonElement).click());
  expect(f.change).toHaveBeenCalledWith('develop');
  expect(f.container.querySelector('input:not([type="hidden"])')).toBeNull();
  expect(JSON.parse(request.mock.calls[0]![1].body)).toEqual({source:{kind:'github',location:'https://github.com/org/repo'}});
});
it('ignores an old response after the origin changes',async () => {
  const f=await mount();let finish!:(value:unknown)=>void;
  request.mockImplementationOnce(() => new Promise(resolve => {finish=resolve;})).mockResolvedValueOnce({branches:['new-origin'],state:'complete',message:null});
  await f.render('https://github.com/org/old');await act(async () => vi.advanceTimersByTimeAsync(250));
  await f.render('https://github.com/org/new');await act(async () => vi.advanceTimersByTimeAsync(250));
  await act(async () => finish({branches:['old-origin'],state:'complete',message:null}));
  await act(async () => (f.container.querySelector('[role="combobox"]') as HTMLButtonElement).click());
  expect(document.querySelector('button[data-value="new-origin"]')).not.toBeNull();
  expect(document.querySelector('button[data-value="old-origin"]')).toBeNull();
});
