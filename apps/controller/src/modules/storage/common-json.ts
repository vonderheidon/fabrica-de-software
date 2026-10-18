import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { ArtifactPolicy, ConfiguredLimit, OperationReceipt, TimeDefaults } from '#contracts';
import { StorageError } from './errors.js';

// Private versioned JSON retains its original keys. These codecs map only known
// contract fields; operator content, facts and external schemas never pass here.
export const storedTimeDefaults = Type.Object({
  formatVersion: TimeDefaults.properties.format_version,
  pollingIntervalMs: TimeDefaults.properties.polling_interval_ms,
  pollingBackoffMaxMs: TimeDefaults.properties.polling_backoff_max_ms,
  passageActiveTimeMs: TimeDefaults.properties.passage_active_time_ms,
  questionTtl: ConfiguredLimit,
}, { additionalProperties: false });
export const storedArtifactPolicy = Type.Object({
  formatVersion: ArtifactPolicy.properties.format_version,
  automaticDeletion: ArtifactPolicy.properties.automatic_deletion,
}, { additionalProperties: false });
const storedReceipt = Type.Object({
  revision: OperationReceipt.properties.revision,
  eventCursor: OperationReceipt.properties.event_cursor,
}, { additionalProperties: false });

export function readTimeDefaults(value: unknown): TimeDefaults {
  if (!Value.Check(storedTimeDefaults, value)) throw new StorageError('OPERATION_DATA_INVALID');
  return { format_version: value.formatVersion, polling_interval_ms: value.pollingIntervalMs,
    passage_active_time_ms: value.passageActiveTimeMs, question_ttl: value.questionTtl,
    ...(value.pollingBackoffMaxMs === undefined ? {} : { polling_backoff_max_ms: value.pollingBackoffMaxMs }) };
}
export function storeTimeDefaults(value: TimeDefaults): Static<typeof storedTimeDefaults> {
  return { formatVersion: value.format_version, pollingIntervalMs: value.polling_interval_ms,
    passageActiveTimeMs: value.passage_active_time_ms, questionTtl: value.question_ttl,
    ...(value.polling_backoff_max_ms === undefined ? {} : { pollingBackoffMaxMs: value.polling_backoff_max_ms }) };
}
export function readArtifactPolicy(value: unknown): ArtifactPolicy {
  if (!Value.Check(storedArtifactPolicy, value)) throw new StorageError('OPERATION_DATA_INVALID');
  return { format_version: value.formatVersion, automatic_deletion: value.automaticDeletion };
}
export function storeArtifactPolicy(value: ArtifactPolicy): Static<typeof storedArtifactPolicy> {
  return { formatVersion: value.format_version, automaticDeletion: value.automatic_deletion };
}
export function readOperationReceipt(value: unknown): Static<typeof OperationReceipt> {
  if (!Value.Check(storedReceipt, value)) throw new StorageError('OPERATION_DATA_INVALID');
  return { ...(value.revision === undefined ? {} : { revision: value.revision }),
    ...(value.eventCursor === undefined ? {} : { event_cursor: value.eventCursor }) };
}
export function serializeOperationReceipt(value: Static<typeof OperationReceipt>): string {
  if (!Value.Check(OperationReceipt, value)) throw new StorageError('OPERATION_DATA_INVALID');
  return JSON.stringify({ ...(value.revision === undefined ? {} : { revision: value.revision }),
    ...(value.event_cursor === undefined ? {} : { eventCursor: value.event_cursor }) });
}
