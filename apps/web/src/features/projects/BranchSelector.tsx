import { useEffect, useId, useState } from 'react';
import type { BranchOptions, OriginSource } from '#contracts';
import { CustomSelect } from '../../app/CustomSelect.js';
import { requestJson } from '../../api/http.js';

export function BranchSelector({source,value,onChange,label = 'Branch de origem',id,disabled = false,error}: {
  source: OriginSource | null; value:string; onChange:(value:string)=>void; label?:string; id?:string; disabled?:boolean; error?:string | null;
}) {
  const generated = useId(); const controlId = id ?? generated;
  const kind = source?.kind; const location = source?.location ?? '';
  const identity = JSON.stringify([kind,location]);
  const [reload,setReload] = useState(0);
  const [read,setRead] = useState<{identity:string;options:BranchOptions | null;loading:boolean}>({identity:'',options:null,loading:false});
  useEffect(() => {
    if (!kind || !location.trim()) return;
    const controller = new AbortController(); let active = true;
    setRead({identity,options:null,loading:true});
    const timer = window.setTimeout(() => {
      void requestJson<BranchOptions>('/api/v1/branches',{method:'POST',body:JSON.stringify({source:{kind,location}}),signal:controller.signal})
        .then(options => {
          if (!Array.isArray(options.branches)) throw new Error('BRANCH_RESPONSE_INVALID');
          if (active) setRead({identity,options,loading:false});
        }).catch(() => { if (active) setRead({identity,loading:false,options:{branches:[],state:'unavailable',message:'Não foi possível consultar as branches. Confira a origem e atualize a lista.'}}); });
    },250);
    return () => { active = false; window.clearTimeout(timer); controller.abort(); };
  },[kind,location,identity,reload]);
  const options = read.identity === identity ? read.options : null;
  const branches = options?.branches ?? [];
  const loading = Boolean(kind && location.trim() && (read.identity !== identity || read.loading));
  const missing = Boolean(value && options?.state === 'complete' && !branches.includes(value));
  return <div className="form-field">
    <label htmlFor={controlId}>{label}</label>
    <CustomSelect id={controlId} value={value} disabled={disabled || !location.trim() || loading || options?.state === 'unavailable'} loading={loading}
      searchLabel={`Buscar ${label.toLocaleLowerCase('pt-BR')}`} aria-describedby={`${controlId}-status`} aria-invalid={Boolean(error || missing)}
      onChange={event => { if (event.currentTarget.value) onChange(event.currentTarget.value); }}>
      <option value="">{loading ? 'Consultando branches…' : 'Selecione uma branch'}</option>
      {value && !branches.includes(value) && <option value={value} disabled>{value} {missing ? '(não encontrada)' : '(seleção atual)'}</option>}
      {branches.map(branch => <option key={branch} value={branch}>{branch}</option>)}
    </CustomSelect>
    <small id={`${controlId}-status`} role={error || missing || options?.state === 'unavailable' ? 'alert' : 'status'}>
      {error ?? (missing ? 'A branch escolhida não aparece na origem atual. Atualize a lista e escolha uma branch disponível.' : !location.trim() ? 'Informe a origem para consultar suas branches.' : loading ? 'Consultando branches da origem…' : options?.message ?? (branches.length === 0 ? 'Nenhuma branch encontrada nesta origem.' : null))}
    </small>
    <button type="button" className="branch-refresh-button" disabled={disabled || loading || !location.trim()} onClick={() => setReload(current => current + 1)}>Atualizar branches</button>
  </div>;
}
