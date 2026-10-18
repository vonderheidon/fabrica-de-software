import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { AttemptCapture, ConfiguredLimit, PreparationChoices } from '#contracts';
import { StorageError } from './errors.js';
import { effectiveConfigurationJson, preparationChoicesJson, preparationOverridesJson, criterionJson,
  readEffectiveConfiguration, storeEffectiveConfiguration, readChoices, storeChoices, readCriterion, storeCriterion,
} from './configuration-json.js';

export const retiredCostDefaults = Type.Object({ formatVersion: Type.Literal(1), limit: ConfiguredLimit }, { additionalProperties: false });
const storedCapture = Type.Object({ ...AttemptCapture.properties,
  criteria: Type.Array(criterionJson, { minItems: 1, maxItems: 1000 }), configuration: effectiveConfigurationJson,
}, { additionalProperties: false });
const historicalConfiguration = Type.Object({
  ...effectiveConfigurationJson.properties, costDefaults: retiredCostDefaults,
  origins: Type.Object({ ...effectiveConfigurationJson.properties.origins.properties,
    costDefaults: Type.Union(['global', 'project', 'preparation'].map(value => Type.Literal(value))),
  }, { additionalProperties: false }),
}, { additionalProperties: false });
const historicalCapture = Type.Object({ ...storedCapture.properties, configuration: historicalConfiguration }, { additionalProperties: false });
const storedSnapshot = Type.Object({ formatVersion: Type.Literal(1), choices: preparationChoicesJson }, { additionalProperties: false });
const historicalChoices = Type.Object({ ...preparationChoicesJson.properties,
  overrides: Type.Object({ ...preparationOverridesJson.properties, costDefaults: Type.Optional(retiredCostDefaults) }, { additionalProperties: false }),
}, { additionalProperties: false });
const historicalSnapshot = Type.Object({ ...storedSnapshot.properties, choices: historicalChoices }, { additionalProperties: false });

/** Validated projections only. Reading a historical document never updates it. */
export function readCapturedConfiguration(value: unknown): AttemptCapture {
  if (Value.Check(storedCapture, value)) return { ...value,
    criteria: value.criteria.map(readCriterion), configuration: readEffectiveConfiguration(value.configuration),
  };
  if (!Value.Check(historicalCapture, value)) throw new StorageError('OPERATION_DATA_INVALID');
  const { costDefaults: _cost, origins, ...configuration } = value.configuration;
  const { costDefaults: _origin, ...currentOrigins } = origins;
  return { ...value, criteria: value.criteria.map(readCriterion),
    configuration: readEffectiveConfiguration({ ...configuration, origins: currentOrigins }),
  };
}
export function readPreparationChoices(value: unknown): PreparationChoices {
  if (Value.Check(storedSnapshot, value)) return readChoices(value.choices);
  if (!Value.Check(historicalSnapshot, value)) throw new StorageError('PREPARATION_DATA_INVALID');
  const { costDefaults: _cost, ...overrides } = value.choices.overrides;
  return readChoices({ ...value.choices, overrides });
}
export function serializeCapture(value: AttemptCapture): string {
  if (!Value.Check(AttemptCapture, value)) throw new StorageError('OPERATION_DATA_INVALID');
  return JSON.stringify({ ...value, criteria: value.criteria.map(storeCriterion), configuration: storeEffectiveConfiguration(value.configuration) });
}
export function serializePreparationChoices(value: PreparationChoices): string {
  if (!Value.Check(PreparationChoices, value)) throw new StorageError('PREPARATION_DATA_INVALID');
  return JSON.stringify({ formatVersion: 1, choices: storeChoices(value) });
}
