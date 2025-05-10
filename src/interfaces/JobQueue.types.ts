export interface JobQueueOptions {
  concurrencyLimit?: number;
  rateLimit?: number;
  timeoutLimit?: number;
}

export interface JobResult<T> {
  result: T;
  queueTime: number;
  executionTime: number;
}

export type Job = {
  fn: (...args: any[]) => Promise<any>;
  args: any[];
  resolve: (value: any) => void;
  reject: (error: any) => void;
  queuedAt: number;
};
