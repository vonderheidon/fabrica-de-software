import { useState } from 'react';
import type { ProjectStorageView } from '#contracts';

export function ProjectConfigurationDialog({ storage }: { storage: ProjectStorageView }) {
  const [copied, setCopied] = useState<string | null>(null);
  const path = storage.original_path ?? storage.managed_root;
  async function copy(): Promise<void> {
    if (!path) return;
    try { await navigator.clipboard.writeText(path); setCopied('Caminho copiado.'); }
    catch { setCopied('Não foi possível copiar. Selecione o caminho completo acima.'); }
  }
  return <section className="card form-section project-storage" aria-labelledby="project-storage-title">
    <div className="project-storage-heading"><h3 id="project-storage-title">Pasta do projeto</h3></div>
    <div className="project-folder-row">
      <span className="storage-path">{path ?? 'Este projeto ainda não tem uma pasta local.'}</span>
      {path && <button type="button" aria-label="Copiar pasta do projeto" onClick={() => void copy()}>Copiar</button>}
    </div>
    {copied && <p role="status">{copied}</p>}
  </section>;
}
