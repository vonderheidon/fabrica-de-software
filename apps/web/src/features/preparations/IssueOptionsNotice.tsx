import type { IssueOptions } from '#contracts';
import { OperatorDiagnosticCard } from '../../app/OperatorSupport.js';

const accessCodes = new Set(['REFERENCE_INACCESSIBLE', 'NOT_FOUND_OR_INACCESSIBLE', 'ACCESS_DENIED']);

export function IssueOptionsNotice({ issues, projectId, onReload }: {
  issues: IssueOptions;
  projectId: string;
  onReload: () => void;
}) {
  if (issues.completeness === 'complete') return null;
  const prerequisites = issues.prerequisites.filter((item) => item.code !== 'ISSUE_REVALIDATION_REQUIRED');
  const accessUnavailable = issues.diagnostics.some((item) => accessCodes.has(item.code));
  const diagnostics = [...new Map([...prerequisites, ...issues.diagnostics.filter((item) => !accessCodes.has(item.code))]
    .map((item) => [item.code, item])).values()];
  return <div className="notice" role="status">
    <b>{issues.completeness === 'partial' ? 'A consulta das issues está incompleta' : 'Não foi possível consultar as issues do quadro'}</b>
    {accessUnavailable && <>
      <p>O quadro configurado não foi encontrado ou a conta GitHub não tem acesso a ele.</p>
      <p><strong>Próxima ação:</strong> confira o quadro na configuração do projeto e o acesso da conta GitHub. Depois, consulte as issues novamente.</p>
    </>}
    {diagnostics.map((item) => <OperatorDiagnosticCard key={item.code} code={item.code} state={prerequisites.some((entry) => entry.code === item.code) ? 'blocked' : 'unavailable'} cause={item.message} recovery={item.recovery} projectId={projectId} />)}
    {!accessUnavailable && diagnostics.length === 0 && <p>A consulta não confirmou a lista completa. Consulte novamente antes de selecionar uma issue.</p>}
    {issues.prerequisites.some((item) => item.code === 'ISSUE_REVALIDATION_REQUIRED') && <p className="muted">Ao selecionar uma issue, a fábrica conferirá os dados atuais antes de permitir o início.</p>}
    <a className="button-link" href={`#principal/projetos?dialog=project-configuration&projectId=${encodeURIComponent(projectId)}`}>Configurar este projeto</a>
    <button type="button" onClick={onReload}>Consultar issues novamente</button>
  </div>;
}
