import { expect,it,vi } from 'vitest';
import { resolve } from 'node:path';
import { createBranchLister } from './branches.js';
import type { GitReader } from './git.js';

it('lists local branches without requiring a remote or changing the checkout',async () => {
  const root = resolve('.cache','local-branches');
  const git = vi.fn<GitReader>(async (_cwd,args) => ({exitCode:0,stdout:args.includes('rev-parse') ? root+'\n' : 'feature/local-only\nmain\nrelease/v2\n'}));
  const list = createBranchLister({},git,async path => path);
  expect(await list({kind:'local',location:root})).toEqual({state:'complete',branches:['feature/local-only','main','release/v2'],message:null});
  expect(git.mock.calls.map(([,args]) => args[1])).toEqual(['rev-parse','for-each-ref']);
});
it('preserves partial GitHub results and rejects credential-bearing URLs before querying',async () => {
  const listBranches = vi.fn(async () => ({state:'partial' as const,data:['release/v2','main'],diagnostics:[],retryAtMs:null}));
  const list = createBranchLister({listBranches});
  expect(await list({kind:'github',location:'https://github.com/org/repo'})).toMatchObject({state:'partial',branches:['main','release/v2']});
  expect(await list({kind:'github',location:'https://private@example.com/org/repo'})).toMatchObject({state:'unavailable',branches:[]});
  expect(listBranches).toHaveBeenCalledOnce();
});
it('does not expose Git output when inspection fails',async () => {
  const list = createBranchLister({},async () => ({exitCode:1,stdout:'PRIVATE_OUTPUT'}),async path => path);
  const result = await list({kind:'local',location:resolve('.cache')});
  expect(result.state).toBe('unavailable'); expect(JSON.stringify(result)).not.toContain('PRIVATE_OUTPUT');
});
