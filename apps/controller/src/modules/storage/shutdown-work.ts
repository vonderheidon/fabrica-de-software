import type Database from 'better-sqlite3';
import type { ShutdownWork } from '#contracts';

// Project and account filters would hide work still owned by this controller.
export function shutdownWork(db: Database.Database): ShutdownWork[] {
  const rows = db.prepare(`
    SELECT 'attempt' AS type,id,id AS attempt_id,project_id,coalesce(suspension,phase) AS state FROM attempts WHERE result IS NULL
    UNION SELECT 'execution',r.id,r.attempt_id,a.project_id,
      CASE WHEN r.stop_state IN ('requested','uncertain') THEN r.stop_state ELSE r.launch_state END
      FROM resources r JOIN attempts a ON a.id=r.attempt_id WHERE r.removed=0 AND (
        r.launch_state='starting' OR r.stop_state IN ('requested','uncertain') OR
        (r.kind='terminal' AND r.launch_state IN ('ready','partial') AND r.stop_state<>'confirmed'
          AND NOT EXISTS(SELECT 1 FROM passages p JOIN attempt_sessions s ON s.id=p.attempt_session_id JOIN managed_terminals m ON m.id=s.managed_terminal_id
            WHERE p.id=r.passage_id AND s.attempt_id=r.attempt_id AND s.state='completed' AND m.state IN ('available','retired'))))
    UNION SELECT 'execution',m.id,NULL,NULL,m.state FROM managed_terminals m WHERE m.state IN ('occupied','uncertain')
    UNION SELECT 'execution',s.id,s.attempt_id,a.project_id,s.state FROM attempt_sessions s JOIN attempts a ON a.id=s.attempt_id WHERE s.state IN ('reserved','active','uncertain')
    UNION SELECT 'execution',o.id,o.attempt_id,a.project_id,o.state FROM terminal_occupancies o JOIN attempts a ON a.id=o.attempt_id WHERE o.state IN ('occupied','uncertain')
    UNION SELECT 'execution',c.id,c.attempt_id,a.project_id,
      CASE WHEN c.state IN ('pending','running') THEN c.state ELSE 'uncertain' END FROM checks c JOIN attempts a ON a.id=c.attempt_id
      WHERE c.state IN ('pending','running') OR c.diagnostic='VERIFICATION_INTERRUPTED' OR c.diagnostic LIKE '%STOP_UNCONFIRMED%' OR c.execution_diagnostic LIKE '%STOP_UNCONFIRMED%'
    UNION SELECT 'execution',v.id,v.attempt_id,a.project_id,v.state FROM verification_runs v JOIN attempts a ON a.id=v.attempt_id WHERE v.state='running'
    UNION SELECT 'execution',c.id,d.attempt_id,a.project_id,c.state FROM capture_runs c JOIN deliveries d ON d.id=c.delivery_id JOIN attempts a ON a.id=d.attempt_id WHERE c.state='running'
    UNION SELECT 'publication',p.operation_id,p.attempt_id,a.project_id,p.state FROM publication_requests p JOIN attempts a ON a.id=p.attempt_id WHERE p.state IN ('accepted','running','unknown')
    UNION SELECT 'publication',e.operation_id,e.attempt_id,a.project_id,e.state FROM effects e LEFT JOIN attempts a ON a.id=e.attempt_id WHERE e.state IN ('not_started','running','unknown')
    UNION SELECT 'publication',p.operation_id,p.attempt_id,a.project_id,p.state FROM publication_target_selections p JOIN attempts a ON a.id=p.attempt_id WHERE p.state IN ('accepted','running','unknown')
    UNION SELECT 'creation',c.id,NULL,c.project_id,c.state FROM project_creations c WHERE c.state IN ('pending','running','partial')
      OR EXISTS(SELECT 1 FROM creation_steps s WHERE s.creation_id=c.id AND s.state IN ('running','unknown'))
    UNION SELECT 'deletion',operation_id,NULL,project_id,state FROM project_deletions
    UNION SELECT 'creation',b.operation_id,NULL,c.project_id,b.state FROM creation_board_operations b JOIN project_creations c ON c.id=b.creation_id WHERE b.state IN ('not_started','running','unknown')
    UNION SELECT 'accepted_operation',r.operation_id,NULL,c.project_id,r.state FROM creation_reconciliations r JOIN project_creations c ON c.id=r.creation_id WHERE r.state IN ('accepted','unknown')
    UNION SELECT 'storage_transition',operation_id,NULL,project_id,state FROM project_storage_transitions WHERE state<>'verified'
    UNION SELECT 'accepted_operation',d.operation_id,NULL,NULL,d.state FROM diagnostic_runs d WHERE d.state IN ('accepted','running','unknown')
    UNION SELECT 'accepted_operation',r.operation_id,s.attempt_id,a.project_id,r.state FROM resource_removals r JOIN resources s ON s.id=r.resource_id JOIN attempts a ON a.id=s.attempt_id WHERE r.state IN ('accepted','unknown')
    UNION SELECT 'accepted_operation',r.operation_id,s.attempt_id,a.project_id,r.state FROM native_open_requests r JOIN resources s ON s.id=r.resource_id JOIN attempts a ON a.id=s.attempt_id WHERE r.state IN ('accepted','unknown')
    UNION SELECT 'accepted_operation',q.answer_operation_id,q.attempt_id,a.project_id,q.state FROM execution_questions q JOIN attempts a ON a.id=q.attempt_id WHERE q.answer_operation_id IS NOT NULL AND q.state IN ('recorded','sending','delivery_unknown')
    UNION SELECT 'accepted_operation',o.operation_id,NULL,NULL,'unknown' FROM operation_requests o WHERE o.receipt_json IS NULL
    ORDER BY type,id,state
  `).all() as Array<Omit<ShutdownWork, 'cause' | 'recovery'>>;
  return rows.map(row => ({ ...row, cause: 'Trabalho ativo ou ainda sem confirmação de término.', recovery: 'Consulte o trabalho identificado e conclua ou reconcilie a operação. Cancelamento e limpeza são ações separadas.' }));
}
