// PROTÓTIPO DESCARTÁVEL — ticket "Branch de entrega e limpeza na interface" (mapa "Entrega na Pasta do projeto").
// Três variantes de como a Branch de entrega e a Limpeza do ambiente aparecem em Configurar projeto,
// Preparar, detalhe da tentativa e elevação de ICR. Trocáveis via ?variant=A|B|C e pela barra inferior.
// Página isolada (o app real exige o controlador no Maestri); reaproveita o CSS real. Dados fictícios, nada é gravado.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../app/styles/tokens.css';
import '../../app/styles/artifact.css';
import '../../app/styles/dashboard.css';
import '../../app/styles/projects.css';
import '../../app/styles/settings.css';
import './prototype.css';
import { ScenarioBar, defaultScenario } from './scenario.js';
import type { Scenario } from './scenario.js';
import { VariantA } from './VariantA.js';
import { VariantB } from './VariantB.js';
import { VariantC } from './VariantC.js';

const variants = [
  { key: 'A', name: 'Campos no formulário', Component: VariantA },
  { key: 'B', name: 'Bloco Entrega com prévia', Component: VariantB },
  { key: 'C', name: 'Frase-resumo com Alterar', Component: VariantC },
] as const;

function readVariant(): string { return new URLSearchParams(window.location.search).get('variant') ?? 'A'; }

function App() {
  const [variant, setVariant] = useState(readVariant);
  const [scenario, setScenario] = useState<Scenario>(defaultScenario);
  const index = Math.max(0, variants.findIndex(v => v.key === variant));
  const current = variants[index]!;
  function go(step: number) {
    const next = variants[(index + step + variants.length) % variants.length]!;
    const url = new URL(window.location.href); url.searchParams.set('variant', next.key);
    window.history.replaceState(null, '', url); setVariant(next.key);
  }
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable]')) return;
      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'ArrowRight') go(1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const Component = current.Component;
  return <main className="proto-page">
    <p className="proto-banner">PROTÓTIPO — dados fictícios, nada é gravado. Use o painel de cenário para ver avisos e estados.</p>
    <ScenarioBar value={scenario} onChange={setScenario} />
    <Component s={scenario} />
    <nav className="proto-switcher" aria-label="Trocar variante">
      <button type="button" onClick={() => go(-1)}>←</button>
      <span>{current.key} ({current.name})</span>
      <button type="button" onClick={() => go(1)}>→</button>
    </nav>
  </main>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
