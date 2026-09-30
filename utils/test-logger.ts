export function logStep(message: string): void {
  const line = `[STEP] ${new Date().toISOString()} ${message}`;
  console.log(line);
}
