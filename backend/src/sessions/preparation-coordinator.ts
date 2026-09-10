export class PreparationCoordinator {
  private readonly running = new Map<string, Promise<void>>();

  run(showcaseId: string, operation: () => Promise<void>): Promise<void> {
    const existing = this.running.get(showcaseId);
    if (existing) return existing;

    const pending = operation().finally(() => {
      if (this.running.get(showcaseId) === pending) this.running.delete(showcaseId);
    });
    this.running.set(showcaseId, pending);
    return pending;
  }

  isRunning(showcaseId: string): boolean {
    return this.running.has(showcaseId);
  }
}
