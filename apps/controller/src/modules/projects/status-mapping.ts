import { V3StatusMapping, type GitHubProjectDetails, type ProjectConfiguration } from '#contracts';

type ProjectMappingValue = NonNullable<ProjectConfiguration['github_project']>;

export function matchesObservedV3StatusMapping(mapping: ProjectMappingValue, details: GitHubProjectDetails): boolean {
  const statusOptionIds = mapping.status_option_ids;
  const fields = details.singleSelectFields.filter((field) => field.name === 'Status');
  const field = fields.find((candidate) => candidate.id === mapping.status_field_id);
  return details.project.id === mapping.id && details.project.owner.id === mapping.owner_id && !details.project.closed &&
    fields.length === 1 && field !== undefined && field.options.length === V3StatusMapping.length &&
    V3StatusMapping.every(({ key, name }, index) => {
      const option = field.options[index];
      return option?.id === statusOptionIds[key] && option?.name === name;
    });
}
