const page = 'pageInfo { hasNextPage endCursor }';
export const accountFields = 'id login';
export const repositoryFields = `id name url isArchived isPrivate owner { ${accountFields} } defaultBranchRef { name }`;
export const projectFields = 'id number title url closed owner { __typename ... on User { id login } ... on Organization { id login } }';
export const identityQuery = `query FactoryIdentity { viewer { ${accountFields} } }`;
export const issueReferenceQuery = 'query FactoryIssueReference($id:ID!) { node(id:$id) { __typename ... on Issue { id number repository { name owner { login } } } } }';
export const queueIssueQuery = `query FactoryQueueIssue($id:ID!) { node(id:$id) { __typename ... on Issue { id number title body state url repository { ${repositoryFields} } } } }`;
export const projectOwnerQuery = 'query FactoryProjectOwner($id:ID!) { node(id:$id) { __typename ... on User { id login } ... on Organization { id login } } }';
export const repositoriesQuery = `query FactoryRepositories($cursor:String) { viewer { repositories(first:100,after:$cursor,affiliations:[OWNER,COLLABORATOR,ORGANIZATION_MEMBER]) { nodes { ${repositoryFields} } ${page} } } }`;
export const repositoryQuery = `query FactoryRepository($owner:String!,$name:String!) { repository(owner:$owner,name:$name) { ${repositoryFields} } }`;
export const branchQuery = `query FactoryBranch($owner:String!,$name:String!,$qualifiedName:String!) { repository(owner:$owner,name:$name) { id ref(qualifiedName:$qualifiedName) { name target { ... on Commit { oid } } } } }`;
export const branchesQuery = `query FactoryBranches($owner:String!,$name:String!,$cursor:String) { repository(owner:$owner,name:$name) { refs(refPrefix:"refs/heads/",first:100,after:$cursor) { nodes { name } ${page} } } }`;
export function projectsQuery(kind: 'user' | 'organization'): string {
  return `query FactoryProjects($login:String!,$cursor:String) { ${kind}(login:$login) { projectsV2(first:100,after:$cursor) { nodes { ${projectFields} } ${page} } } }`;
}
export const projectQuery = `query FactoryProject($id:ID!) { node(id:$id) { __typename ... on ProjectV2 { ${projectFields} } } }`;
export const fieldsQuery = `query FactoryProjectFields($id:ID!,$cursor:String) { node(id:$id) { ... on ProjectV2 { fields(first:100,after:$cursor) { nodes { __typename ... on ProjectV2Field { id } ... on ProjectV2IterationField { id } ... on ProjectV2MultiSelectField { id } ... on ProjectV2SingleSelectField { id name options { id name } } } ${page} } } } }`;
export const itemsQuery = `query FactoryProjectItems($id:ID!,$cursor:String) { node(id:$id) { ... on ProjectV2 { items(first:100,after:$cursor,orderBy:{field:POSITION,direction:ASC}) { nodes { id isArchived status: fieldValueByName(name:"Status") { ... on ProjectV2ItemFieldSingleSelectValue { optionId field { ... on ProjectV2SingleSelectField { id } } } } content { __typename ... on Issue { id title url } ... on PullRequest { id title url } ... on DraftIssue { id title } } } ${page} } } } }`;
export const issueQuery = `query FactoryIssue($owner:String!,$name:String!,$number:Int!) { repository(owner:$owner,name:$name) { issueOrPullRequest(number:$number) { __typename ... on Issue { id number title body state url repository { ${repositoryFields} } } ... on PullRequest { id number title url } } } }`;
const issueConnection = (operation: string, connection: string, fields: string) => `query ${operation}($id:ID!,$cursor:String) { node(id:$id) { ... on Issue { ${connection}(first:100,after:$cursor) { nodes { ${fields} } ${page} } } } }`;
export const assigneesQuery = issueConnection('FactoryAssignees', 'assignees', accountFields);
export const commentsQuery = issueConnection('FactoryComments', 'comments', 'id body url author { login ... on User { id } ... on Bot { id } } updatedAt');
export const blockersQuery = issueConnection('FactoryBlockers', 'blockedBy', 'id number title url state');
export const membershipsQuery = `query FactoryMemberships($id:ID!,$cursor:String) { node(id:$id) { ... on Issue { projectItems(first:100,after:$cursor,includeArchived:true) { nodes { id isArchived project { id } } ${page} } } } }`;
// Numeric value IDs remain in the connection only for cursor deduplication; numeric values are not fetched.
export const valuesQuery = `query FactoryItemValues($id:ID!,$cursor:String) { node(id:$id) { ... on ProjectV2Item { fieldValues(first:100,after:$cursor) { nodes { __typename ... on ProjectV2ItemFieldSingleSelectValue { id name optionId field { ... on ProjectV2SingleSelectField { id } } } ... on ProjectV2ItemFieldNumberValue { id } } ${page} } } } }`;
export const groupedValuesQuery = valuesQuery
  .replace('FactoryItemValues($id:ID!,$cursor:String)', 'FactoryGroupedValues($ids:[ID!]!)')
  .replace('node(id:$id)', 'nodes(ids:$ids)')
  .replace('... on ProjectV2Item {', 'id __typename ... on ProjectV2Item {')
  .replace('first:100,after:$cursor', 'first:100');
