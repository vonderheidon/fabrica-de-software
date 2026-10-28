import { expect, it } from 'vitest';
import type { TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { ChoiceOrigins, ConfigurationOptions, ConfigurationOptionsQuery, ConfigurationSaved, ConfigurationUpdate, DeliverySummaryView, EffectiveConfiguration, PreparationChoices, PreparationCreated, PreparationOverrides, PreparationParams, PreparationUpdate, ProjectChanges, ProjectConfiguration, ProjectParams, ProjectRegistered, ProjectRegistration, SettingsSaved, SettingsUpdate } from './index.js';

const id = 'f0fce308-07bb-49c0-b645-21bdcbe8ef30';

it('uses closed snake_case objects throughout the public configuration family, including nested issue DTOs', () => {
  const seen = new Set<TSchema>();
  function visit(schema: TSchema): void {
    if (seen.has(schema)) return;
    seen.add(schema);
    if (schema.type === 'object') {
      expect(schema.additionalProperties).toBe(false);
      for (const [name, child] of Object.entries(schema.properties as Record<string, TSchema>)) {
        expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
        visit(child);
      }
    }
    if (schema.items) visit(schema.items as TSchema);
    for (const child of (schema.anyOf ?? []) as TSchema[]) visit(child);
  }
  for (const schema of [SettingsUpdate, SettingsSaved, ConfigurationUpdate, ConfigurationSaved, ConfigurationOptionsQuery, ConfigurationOptions, ProjectRegistration, ProjectRegistered, PreparationChoices, PreparationUpdate, PreparationCreated]) visit(schema);
});

it('rejects aliases even beside canonical keys, including partial nested updates', () => {
  for (const value of [
    { project_changes: {}, projectChanges: {} },
    { project_changes: { correction_limit: 0, correctionLimit: 0 } },
    { project_changes: { queue_order: { use_board_position: true, useBoardPosition: true } } },
    { project_changes: {}, globalChanges: {} },
    { project_changes: {}, profileChanges: [] },
  ]) expect(Value.Check(ConfigurationUpdate, value)).toBe(false);
  expect(Value.Check(SettingsUpdate, { changes: {}, profile_changes: [], profileChanges: [] })).toBe(false);
  const choices = { issue_id: 'ISSUE', delivery_mode: 'icr', guidance: '', overrides: {} };
  expect(Value.Check(PreparationChoices, choices)).toBe(true);
  for (const alias of [{ issueId: 'ISSUE' }, { deliveryMode: 'icr' }, { previousAttemptId: id }]) {
    expect(Value.Check(PreparationChoices, { ...choices, ...alias })).toBe(false);
  }
  expect(Value.Check(PreparationChoices, { ...choices, overrides: { correction_limit: 0, correctionLimit: 0 } })).toBe(false);
  expect(Value.Check(PreparationUpdate, { changes: { previous_attempt_id: id } })).toBe(false);
  expect(Value.Check(ConfigurationUpdate, { project_changes: { checks: [{ id: 'legacy', command: 'npm test', cwd_relative: '.' }] } })).toBe(false);
  expect(Value.Check(PreparationChoices, { ...choices, overrides: { checks: [{ id: 'legacy', command: 'npm test', cwd_relative: '.' }] } })).toBe(false);
  expect(ProjectConfiguration.properties.queue_order.properties).toHaveProperty('use_board_position');
  expect(ProjectConfiguration.properties.queue_order.properties).not.toHaveProperty('priority_field_id');
  expect(ProjectConfiguration.properties.queue_order.properties).not.toHaveProperty('priority_direction');
  for (const queue_order of [
    { use_board_position: true, priority_field_id: null },
    { use_board_position: true, priority_direction: 'asc' },
    { use_board_position: false, priority_field_id: 'PRIORITY', priority_direction: 'desc' },
  ]) expect(Value.Check(ConfigurationUpdate, { project_changes: { queue_order } })).toBe(false);
});

it('keeps retired manual check definitions out of configuration, preparation and summary contracts', () => {
  expect(ProjectConfiguration.properties).not.toHaveProperty('checks');
  expect(ProjectChanges.properties).not.toHaveProperty('checks');
  expect(ConfigurationUpdate.properties.project_changes.properties).not.toHaveProperty('checks');
  expect(PreparationChoices.properties).not.toHaveProperty('checks');
  expect(PreparationOverrides.properties).not.toHaveProperty('checks');
  expect(ChoiceOrigins.properties).not.toHaveProperty('checks');
  expect(EffectiveConfiguration.properties.configuration.properties).not.toHaveProperty('checks');
  expect(EffectiveConfiguration.properties.origins.properties).not.toHaveProperty('checks');
  expect(DeliverySummaryView.properties).not.toHaveProperty('checks_succeeded');
  expect(DeliverySummaryView.properties).not.toHaveProperty('checks_total');

  const choices = { issue_id: 'ISSUE', delivery_mode: 'icr', guidance: '', overrides: {} };
  const definitions = [{ id: 'retired', command: 'npm test', cwd_relative: '.' }];
  expect(Value.Check(ConfigurationUpdate, { project_changes: { source: { kind: 'local', location: 'C:/project', checks: definitions } } })).toBe(false);
  expect(Value.Check(ConfigurationUpdate, {
    project_changes: { correction_limit: 3, checks: definitions }, global_changes: { time_defaults: { polling_interval_ms: 20000 }, checks: definitions },
  })).toBe(false);
  expect(Value.Check(PreparationChoices, { ...choices, checks: definitions })).toBe(false);
  expect(Value.Check(PreparationUpdate, { changes: { overrides: { checks: definitions } } })).toBe(false);
});

it('preserves omission, explicit null and numeric bounds without coercion', () => {
  expect(Value.Check(ConfigurationUpdate, { project_changes: {} })).toBe(true);
  expect(Value.Check(ConfigurationUpdate, { project_changes: { github_project: null, implementer_profile_id: null } })).toBe(true);
  for (const key of ['base_branch', 'checks', 'correction_limit', 'queue_order']) {
    expect(Value.Check(ConfigurationUpdate, { project_changes: { [key]: null } })).toBe(false);
  }
  for (const correction_limit of [0, 5]) expect(Value.Check(ConfigurationUpdate, { project_changes: { correction_limit } })).toBe(true);
  for (const correction_limit of [-1, 6, 1.5, '2']) expect(Value.Check(ConfigurationUpdate, { project_changes: { correction_limit } })).toBe(false);
});

it('preserves path identifiers while requiring snake_case query names', () => {
  expect(Value.Check(ProjectParams, { projectId: id })).toBe(true);
  expect(Value.Check(ProjectParams, { project_id: id })).toBe(false);
  expect(Value.Check(PreparationParams, { preparationId: id })).toBe(true);
  expect(Value.Check(PreparationParams, { preparation_id: id })).toBe(false);
  expect(Value.Check(ConfigurationOptionsQuery, { owner_id: 'OWNER', owner_kind: 'organization', github_project_id: 'PROJECT', status_field_id: 'STATUS' })).toBe(true);
  for (const alias of ['ownerId', 'ownerKind', 'githubProjectId', 'statusFieldId']) {
    expect(Value.Check(ConfigurationOptionsQuery, { [alias]: 'value' })).toBe(false);
  }
});
