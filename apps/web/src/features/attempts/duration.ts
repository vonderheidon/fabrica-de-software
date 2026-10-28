export function formatDuration(milliseconds: number): string {
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1000);
  return minutes > 0 ? `${minutes} min ${seconds} s` : `${seconds} s`;
}
