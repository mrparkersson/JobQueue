import { JobQueueOptions, Job, JobResult } from "./interfaces/JobQueue.types";

export class JobQueue {
  private queue: Job[] = [];
  private running = 0;
  private lastRunTimestamps: number[] = [];
  private disposed = false;

  constructor(
    private options: JobQueueOptions = {
      concurrencyLimit: 1000,
      timeoutLimit: 1200,
    }
  ) {}

  schedule<T>(
    fn: (...args: any[]) => Promise<T>,
    ...args: any[]
  ): Promise<JobResult<T>> {
    if (this.disposed) {
      return Promise.reject(new Error("Queue has been disposed"));
    }

    return new Promise((resolve, reject) => {
      const job: Job = { fn, args, resolve, reject, queuedAt: Date.now() };
      this.queue.push(job);
      this.processQueue();
    });
  }

  size(): number {
    return this.queue.length;
  }

  active(): number {
    return this.running;
  }

  dispose(): void {
    this.disposed = true;
    this.queue.forEach((job) => job.reject(new Error("Queue disposed")));
    this.queue = [];
  }

  private async processQueue() {
    while (
      this.running < (this.options.concurrencyLimit ?? 1000) &&
      this.queue.length > 0 &&
      this.canStartJob()
    ) {
      const job = this.queue.shift()!;
      this.running++;
      this.lastRunTimestamps.push(Date.now());

      const queueTime = Date.now() - job.queuedAt;
      const timeoutMs = (this.options.timeoutLimit ?? 1200) * 1000;
      const start = Date.now();

      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Job timed out")), timeoutMs)
      );

      const jobPromise = job.fn(...job.args);

      Promise.race([jobPromise, timeout])
        .then((result) => {
          job.resolve({
            result,
            queueTime,
            executionTime: Date.now() - start,
          });
        })
        .catch((err) => {
          job.reject(err);
        })
        .finally(() => {
          this.running--;
          this.cleanupTimestamps();
          this.processQueue();
        });
    }
  }

  private canStartJob(): boolean {
    if (!this.options.rateLimit) return true;
    const now = Date.now();
    this.cleanupTimestamps();
    return this.lastRunTimestamps.length < this.options.rateLimit;
  }

  private cleanupTimestamps() {
    const cutoff = Date.now() - 60000;
    this.lastRunTimestamps = this.lastRunTimestamps.filter((ts) => ts > cutoff);
  }
}
