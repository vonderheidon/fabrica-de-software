import { useState } from 'react';
import type { ShutdownAccepted } from '#contracts';
import { requestJson } from '../../api/http.js';

export function ShutdownDialog({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [accepted, setAccepted] = useState(false);

  async function closeController(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await requestJson<ShutdownAccepted>('/api/v1/shutdown', { method: 'POST', body: JSON.stringify({ authorized: true }) });
      setAccepted(true);
    } catch (failure: unknown) {
      setBusy(false);
      setError(failure instanceof Error ? failure.message : 'Não foi possível solicitar o encerramento do controlador.');
    }
  }

  return <div className="shutdown-layout">
    <div className="shutdown-body">
      {accepted
        ? <p role="status">Solicitação aceita. Esta tela não será mais atualizada; feche esta aba para sair.</p>
        : <>
          <p>Este comando encerra o controlador agora, mesmo que haja trabalhos ativos ou incertos. A rotina pode interromper sessões que ainda acompanha; processos sem acompanhamento podem permanecer no Maestri.</p>
          {error && <p role="alert">{error}</p>}
        </>}
    </div>
    {!accepted && <div className="dialog-actions">
      <button type="button" onClick={onClose} disabled={busy}>Cancelar</button>
      <button type="button" onClick={() => void closeController()} disabled={busy}>Encerrar controlador</button>
    </div>}
  </div>;
}
