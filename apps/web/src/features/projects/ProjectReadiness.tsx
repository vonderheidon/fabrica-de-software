import type { Prerequisite } from '#contracts';
import { OperatorDiagnosticCard } from '../../app/OperatorSupport.js';
import { useDiagnostics } from '../records/useDiagnostics.js';
import { CurrentDiagnosticNotices, DiagnosticHistory } from '../records/DiagnosticNotices.js';
import { diagnosticCopyFor } from '../../app/operator-language.js';

export type ConditionSection = 'global' | 'origin' | 'mapping' | 'profiles' | 'configuration' | 'issue' | 'criteria' | 'information';
// Presentation destinations only. Eligibility remains owned by the server.
export function conditionSection(code: string): ConditionSection {
  if (['ISSUE_REVALIDATION_REQUIRED', 'EXECUTOR_REVALIDATION_REQUIRED', 'EXECUTION_REVALIDATION_REQUIRED', 'LOCAL_CHANGES_EXCLUDED'].includes(code)) return 'information';
  if (/ACCOUNT|PROJECTS_ROOT|HOST|MAESTRI|ONBOARDING/.test(code)) return 'global';
  if (/PROFILE/.test(code)) return 'profiles';
  if (/CRITERI|OBJECTIVE|TITLE/.test(code)) return 'criteria';
  if (/REMOTE|BASE_|ORIGIN|REPOSITORY_ARCHIVED|CODE_NOT_PUBLISHED/.test(code)) return 'origin';
  if (/PROJECT_REQUIRED|PROJECT_OWNER|STATUS_MAPPING|STATUS_FIELD|STATUS_OPTION/.test(code)) return 'mapping';
  if (/CONFIGURATION|REVISION|DELETION/.test(code)) return 'configuration';
  return 'issue';
}

export function ConditionNotices({ items, section, projectId }: { items: readonly Prerequisite[]; section: ConditionSection; projectId: string }) {
  const selected = items.filter((item) => conditionSection(item.code) === section);
  if (!selected.length) return null;
  if (section === 'global') return <div className="notice" role="status"><b>Configuração global necessária para iniciar</b>{selected.map((item) => <p key={item.code}>{diagnosticCopyFor(item.code, 'blocked', item.message, item.recovery).title}</p>)}<a href="#principal/configuracao">Abrir Configuração</a></div>;
  if (section === 'information') return <div className="muted" role="note">{selected.some((item) => item.code === 'LOCAL_CHANGES_EXCLUDED') && <p>Alterações não commitadas ficam fora da execução.</p>}{selected.some((item) => item.code !== 'LOCAL_CHANGES_EXCLUDED') && <p>A issue e o executor serão revalidados ao iniciar. Nenhuma verificação manual prévia é obrigatória.</p>}</div>;
  return <div>{selected.map((item) => <OperatorDiagnosticCard key={item.code} code={item.code} state="blocked" cause={item.message} recovery={item.recovery} projectId={projectId} />)}
    {section === 'profiles' && <a href="#principal/perfis">Abrir Perfis Globais</a>}
  </div>;
}

export function useProjectDiagnostics(projectId: string | null) {
  return useDiagnostics(projectId ? { scope: 'project', id: projectId } : null);
}
export function ProjectConditions({ diagnostic, section, projectId, missingProfileRoles }: { diagnostic: ReturnType<typeof useProjectDiagnostics>; section: ConditionSection; projectId: string; missingProfileRoles?: readonly string[] }) {
  const previousRead = Boolean(diagnostic.error) || diagnostic.stale && !diagnostic.refreshing;
  const select = (items: NonNullable<typeof diagnostic.view>['diagnostics']) => items.filter((item) => item.check === 'configuration' && conditionSection(item.code) === section);
  const reports = (diagnostic.view?.reports ?? []).map((report) => ({ ...report, diagnostics: select(report.diagnostics) })).filter((report) => report.diagnostics.length > 0);
  const items = select(diagnostic.view?.diagnostics ?? []).filter(item => !(missingProfileRoles && item.code === 'PROFILES_REQUIRED'));
  if (section === 'information') return <div className="muted" role="note">{items.length > 0 && <p>{previousRead ? 'Leitura anterior: ' : ''}Conta, origem, issue e executor serão revalidados na preparação e no início.</p>}</div>;
  return <div className="field-full">
    {section === 'profiles' && missingProfileRoles && missingProfileRoles.length > 0 && <article className="diagnostic-record" role="status" aria-label="Associações de perfis pendentes">
      <div className="line"><b>Associe os perfis do projeto</b><span className="pill warn">Pendente</span></div>
      <p>Associação ainda não salva: {missingProfileRoles.join(' e ')}.</p>
      <p className="muted">{missingProfileRoles.length === 2 ? 'Selecione nos campos Perfil implementador e Perfil revisor acima' : `Selecione no campo Perfil ${missingProfileRoles[0]!.toLocaleLowerCase('pt-BR')} acima`} e salve a configuração.</p>
      <a className="button-link" href="#principal/perfis">Criar ou gerenciar perfis</a>
    </article>}
    <CurrentDiagnosticNotices items={items} previous={previousRead} projectId={projectId} inProjectConfiguration /><DiagnosticHistory reports={reports} />
    {section === 'global' && items.length > 0 && <a href="#principal/configuracao">Corrigir na Configuração</a>}
  </div>;
}
