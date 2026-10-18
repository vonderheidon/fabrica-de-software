import type { ConfigurationIssueContext, IssueContext, PreparationView } from '#contracts';

// Explicit projection of the configuration HTTP family; never visit operator
// text, facts, arbitrary maps or external response objects recursively.
function issueView(issue: IssueContext): ConfigurationIssueContext {
  const { defaultBranch, isArchived, isPrivate, ...repository } = issue.repository;
  return { ...issue, repository: { ...repository, default_branch: defaultBranch, is_archived: isArchived, is_private: isPrivate },
    comments: issue.comments.map(({ updatedAt, ...comment }) => ({ ...comment, updated_at: updatedAt })),
    memberships: issue.memberships.map(({ itemId, projectId, statusValues, numberValues, ...membership }) => ({
      ...membership, item_id: itemId, project_id: projectId,
      status_values: statusValues.map(({ fieldId, optionId, ...status }) => ({ ...status, field_id: fieldId, option_id: optionId })),
      ...(numberValues === undefined ? {} : { number_values: numberValues.map(({ fieldId, ...number }) => ({ ...number, field_id: fieldId })) }),
    })),
  };
}
export function preparationView(view: Omit<PreparationView, 'preparation'> & { preparation: Omit<PreparationView['preparation'], 'issue'> & { issue: IssueContext | null } }): PreparationView {
  return { ...view, preparation: { ...view.preparation, issue: view.preparation.issue === null ? null : issueView(view.preparation.issue) } };
}
