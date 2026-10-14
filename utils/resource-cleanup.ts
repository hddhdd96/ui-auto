export type ResourceRecord = { name: string; state: 'attempting' | 'created' | 'deleted'; error?: string };

/** Register BEFORE submission: a missing UI result does not mean creation failed. */
export class ResourceCleanup {
  private readonly resources = new Map<string, ResourceRecord>();
  constructor(private readonly remove: (name: string) => Promise<void>) {}

  register(name: string): void {
    if (this.resources.has(name)) throw new Error(`Already tracked: ${name}`);
    this.resources.set(name, { name, state: 'attempting' });
  }

  markCreated(name: string): void { this.record(name).state = 'created'; }
  markDeleted(name: string): void { this.record(name).state = 'deleted'; }
  recordDeletionFailure(name: string, error: unknown): void {
    this.record(name).error = error instanceof Error ? error.message : String(error);
  }
  snapshot(): ResourceRecord[] { return [...this.resources.values()].map(record => ({ ...record })); }

  async cleanup(): Promise<void> {
    const failures: Error[] = [];
    for (const resource of this.resources.values()) {
      if (resource.state === 'deleted' || resource.error) continue;
      try {
        await this.remove(resource.name);
        resource.state = 'deleted';
      } catch (error) {
        this.recordDeletionFailure(resource.name, error);
        failures.push(new Error(`Cleanup failed: ${resource.name}`, { cause: error }));
      }
    }
    const unresolved = this.snapshot().filter(resource => resource.error);
    if (unresolved.length) throw new AggregateError(failures, `Unresolved cleanup: ${unresolved.map(record => record.name).join(', ')}`);
  }

  private record(name: string): ResourceRecord {
    const record = this.resources.get(name);
    if (!record) throw new Error(`Unknown resource: ${name}`);
    return record;
  }
}
