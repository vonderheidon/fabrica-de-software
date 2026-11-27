import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { AttemptCapture, PreparationChoices } from '#contracts';
import { StorageError } from './errors.js';
import { effectiveConfigurationJson, preparationChoicesJson, criterionJson,
  readEffectiveConfiguration, storeEffectiveConfiguration, readChoices, storeChoices, readCriterion, storeCriterion,
} from './configuration-json.js';

const storedCapture = Type.Object({ ...AttemptCapture.properties,
  /** Recorded by captures that still carried the per-attempt destination; accepted on read and never written again. */
  v3_delivery: Type.Optional(Type.Unknown()),
  criteria: Type.Array(criterionJson, { minItems: 1, maxItems: 1000 }), configuration: effectiveConfigurationJson,
}, { additionalProperties: false });
const storedSnapshot = Type.Object({ formatVersion: Type.Literal(1), choices: preparationChoicesJson }, { additionalProperties: false });

/** Validated projections only. Reading a historical document never updates it. */
export function readCapturedConfiguration(value: unknown): AttemptCapture {
  if (Value.Check(storedCapture, value)) {
    const { v3_delivery: _removedDestination, ...capture } = value;
    return { ...capture, criteria: value.criteria.map(readCriterion), configuration: readEffectiveConfiguration(value.configuration) };
  }
  throw new StorageError('OPERATION_DATA_INVALID');
}
export function readPreparationChoices(value: unknown): PreparationChoices {
  if (Value.Check(storedSnapshot, value)) return readChoices(value.choices);
  throw new StorageError('PREPARATION_DATA_INVALID');
}
export function serializeCapture(value: AttemptCapture): string {
  if (!Value.Check(AttemptCapture, value)) throw new StorageError('OPERATION_DATA_INVALID');
  return JSON.stringify({ ...value, criteria: value.criteria.map(storeCriterion), configuration: storeEffectiveConfiguration(value.configuration) });
}
export function serializePreparationChoices(value: PreparationChoices): string {
  if (!Value.Check(PreparationChoices, value)) throw new StorageError('PREPARATION_DATA_INVALID');
  return JSON.stringify({ formatVersion: 1, choices: storeChoices(value) });
}
