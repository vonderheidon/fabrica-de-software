export const configurationBodyLimit = 16384;
export const configurationBodyLimitMessage = 'O conjunto das alterações excede o limite de 16.384 bytes. Reduza os textos antes de salvar.';

export function assertConfigurationBody(body: string): void {
  if (new TextEncoder().encode(body).byteLength > configurationBodyLimit) {
    throw new RangeError(configurationBodyLimitMessage);
  }
}
