export class ExecutorError extends Error {
  constructor(
    message: string,
    public readonly nodeId?: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ExecutorError';
  }
}
