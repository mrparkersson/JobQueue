// src/tests/jobQueue.test.ts
import { JobQueue } from "../JobQueue.js";

/**
 * Simple test framework functions
 */
const test = {
  passed: 0,
  failed: 0,
  testNames: new Set<string>(), // Track test names to prevent duplicates

  async run(name: string, fn: () => Promise<void>): Promise<void> {
    // Prevent duplicate test runs
    if (this.testNames.has(name)) {
      console.log(`⚠️ Skipping duplicate test: ${name}`);
      return;
    }

    this.testNames.add(name);

    try {
      console.log(`\n🧪 Testing: ${name}`);
      await fn();
      console.log(`✅ Passed: ${name}`);
      this.passed++;
    } catch (error) {
      console.error(`❌ Failed: ${name}`);
      console.error(error);
      this.failed++;
    }
  },

  assert(condition: boolean, message: string): void {
    if (!condition) {
      throw new Error(`Assertion failed: ${message}`);
    } else {
      console.log(`  ✓ ${message}`);
    }
  },

  async assertThrows(
    fn: () => Promise<any>,
    expectedErrorMsg?: string
  ): Promise<void> {
    try {
      await fn();
      throw new Error(
        `Expected to throw${
          expectedErrorMsg
            ? ` with message containing "${expectedErrorMsg}"`
            : ""
        }, but did not throw`
      );
    } catch (error: any) {
      if (expectedErrorMsg && !error.message.includes(expectedErrorMsg)) {
        throw new Error(
          `Expected error message to contain "${expectedErrorMsg}", but got: "${error.message}"`
        );
      }
      console.log(
        `  ✓ Correctly threw error${
          expectedErrorMsg ? ` containing "${expectedErrorMsg}"` : ""
        }`
      );
    }
  },

  summary(): void {
    console.log(
      `\n📊 Test Summary: ${this.passed} passed, ${this.failed} failed`
    );
    if (this.failed > 0) {
      process.exit(1);
    }
  },

  // Log function for verbose output
  log(message: string): void {
    console.log(`  📝 ${message}`);
  },
};

/**
 * Helper functions for tests
 */
const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const createSuccessJob =
  (delay: number, value: any = `Job completed after ${delay}ms`) =>
  async (...args: any[]): Promise<any> => {
    await wait(delay);
    return args.length > 0 ? `${value} with args: ${args.join(", ")}` : value;
  };

const createFailJob =
  (delay: number, errorMessage: string = `Job failed after ${delay}ms`) =>
  async (): Promise<never> => {
    await wait(delay);
    throw new Error(errorMessage);
  };

/**
 * Test cases
 */
async function runTests() {
  // Basic functionality
  await test.run("Basic job scheduling and execution", async () => {
    const queue = new JobQueue();
    test.log(`Created queue with default options`);

    const startTime = Date.now();
    const result = await queue.schedule(createSuccessJob(100), "test-arg");
    const totalTime = Date.now() - startTime;

    test.assert(
      result.result.includes("Job completed after 100ms"),
      "Job should return correct result"
    );
    test.assert(
      result.result.includes("test-arg"),
      "Job should receive and process arguments"
    );
    test.assert(
      result.queueTime >= 0,
      `Queue time (${result.queueTime}ms) should be tracked`
    );
    test.assert(
      result.executionTime >= 80,
      `Execution time (${result.executionTime}ms) should be at least 80ms`
    );
    test.assert(
      totalTime >= 100,
      `Total time (${totalTime}ms) should be at least 100ms`
    );

    queue.dispose();
    test.log(`Queue disposed`);
  });

  // Job failure
  await test.run(
    "Failed job should reject promise with original error",
    async () => {
      const queue = new JobQueue();
      test.log(`Created queue with default options`);

      const errorMsg = "Custom error message for testing";

      await test.assertThrows(async () => {
        await queue.schedule(createFailJob(50, errorMsg));
      }, errorMsg);

      queue.dispose();
      test.log(`Queue disposed`);
    }
  );

  // Queue size and active count
  await test.run("Queue size and active count tracking", async () => {
    const concurrencyLimit = 2;
    const queue = new JobQueue({ concurrencyLimit });
    test.log(`Created queue with concurrency limit of ${concurrencyLimit}`);

    // Initially the queue should be empty
    test.assert(
      queue.size() === 0,
      `Initial queue size should be 0, got ${queue.size()}`
    );
    test.assert(
      queue.active() === 0,
      `Initial active count should be 0, got ${queue.active()}`
    );

    // Add 2 jobs: both should start immediately
    const job1 = queue.schedule(createSuccessJob(300));
    const job2 = queue.schedule(createSuccessJob(300));
    test.log(`Scheduled 2 jobs that take 300ms each`);

    // Small wait to ensure the first two jobs are processed
    await wait(50);

    // Now check that we have 2 active jobs and 0 in queue
    test.assert(
      queue.active() === 2,
      `After scheduling 2 jobs, active count should be 2, got ${queue.active()}`
    );
    test.assert(
      queue.size() === 0,
      `After scheduling 2 jobs, queue size should be 0, got ${queue.size()}`
    );

    // Add 3 more jobs - these should be queued
    const job3 = queue.schedule(createSuccessJob(100));
    const job4 = queue.schedule(createSuccessJob(100));
    const job5 = queue.schedule(createSuccessJob(100));
    test.log(`Scheduled 3 more jobs that take 100ms each`);

    // Small wait to ensure the jobs are added to the queue
    await wait(50);

    // Check queue size and active count
    test.assert(
      queue.size() === 3,
      `After scheduling 5 jobs with concurrency 2, queue size should be 3, got ${queue.size()}`
    );
    test.assert(
      queue.active() === 2,
      `After scheduling 5 jobs with concurrency 2, active count should be 2, got ${queue.active()}`
    );

    // Wait for all the initial jobs to complete
    await Promise.all([job1, job2]);
    test.log(`First 2 jobs completed`);

    // Wait for queued jobs to start processing
    await wait(50);

    // Now 2 of the queued jobs should be active and 1 still in queue
    test.assert(
      queue.size() === 1,
      `After first 2 jobs complete, queue size should be 1, got ${queue.size()}`
    );
    test.assert(
      queue.active() === 2,
      `After first 2 jobs complete, active count should be 2, got ${queue.active()}`
    );

    // Wait for all remaining jobs to complete
    await Promise.all([job3, job4, job5]);
    test.log(`All jobs completed`);

    // Small wait to ensure all internal processing completes
    await wait(50);

    test.assert(
      queue.size() === 0,
      `Queue should be empty after all jobs complete, got ${queue.size()}`
    );
    test.assert(
      queue.active() === 0,
      `Active count should be 0 after all jobs complete, got ${queue.active()}`
    );

    queue.dispose();
    test.log(`Queue disposed`);
  });

  // Concurrency limit
  await test.run("Concurrency limit enforcement", async () => {
    const concurrencyLimit = 3;
    const queue = new JobQueue({ concurrencyLimit });
    test.log(`Created queue with concurrency limit of ${concurrencyLimit}`);

    // For tracking job execution
    let runningJobs = 0;
    let maxConcurrent = 0;
    const startTimes: number[] = [];
    const completionOrder: number[] = [];

    // Helper function that tracks concurrent execution
    const createTrackedJob = (id: number, duration: number) => async () => {
      const startTime = Date.now();
      startTimes.push(startTime);

      runningJobs++;
      maxConcurrent = Math.max(maxConcurrent, runningJobs);
      test.log(`Job ${id} started. Currently running: ${runningJobs}`);

      await wait(duration);

      runningJobs--;
      completionOrder.push(id);
      test.log(
        `Job ${id} completed after ${
          Date.now() - startTime
        }ms. Currently running: ${runningJobs}`
      );

      return id;
    };

    // Schedule more jobs than the concurrency limit
    const totalJobs = 8;
    const jobPromises = [];

    test.log(
      `Scheduling ${totalJobs} jobs (more than the concurrency limit of ${concurrencyLimit})...`
    );

    for (let i = 1; i <= totalJobs; i++) {
      // Each job runs for a different duration to ensure we can observe the concurrency behavior
      const duration = 150 + (i % 3) * 50; // 150ms, 200ms, or 250ms
      jobPromises.push(queue.schedule(createTrackedJob(i, duration)));
    }

    // Wait for all jobs to complete
    await Promise.all(jobPromises);

    // Check maximum concurrency
    test.assert(
      maxConcurrent === concurrencyLimit,
      `Maximum concurrent jobs should be ${concurrencyLimit}, got ${maxConcurrent}`
    );

    // Verify all jobs completed
    test.assert(
      completionOrder.length === totalJobs,
      `All ${totalJobs} jobs should complete, got ${completionOrder.length}`
    );

    test.log(`Jobs completed in order: ${completionOrder.join(", ")}`);

    // Add a small wait to ensure all internal processing completes
    test.log(`Waiting for internal queue processing to complete...`);
    await wait(100);

    // Verify no jobs are left in the queue or running
    test.assert(
      queue.size() === 0,
      `Queue should be empty after all jobs complete, got ${queue.size()}`
    );
    test.assert(
      queue.active() === 0,
      `Active count should be 0 after all jobs complete, got ${queue.active()}`
    );

    queue.dispose();
    test.log(`Queue disposed`);
  });

  // Rate limit
  await test.run("Rate limit enforcement", async () => {
    const rateLimit = 5; // 5 jobs per minute
    const queue = new JobQueue({ rateLimit });
    test.log(`Created queue with rate limit of ${rateLimit} jobs per minute`);

    const startTimes: number[] = [];
    const jobIds: number[] = [];

    // Create a job that records its start time
    const timeTrackingJob = async (jobId: number) => {
      const now = Date.now();
      startTimes.push(now);
      jobIds.push(jobId);
      test.log(`Job ${jobId} started at ${new Date(now).toISOString()}`);
      await wait(10);
      return true;
    };

    // Schedule jobs (more than the rate limit)
    const totalJobs = 8;
    test.log(
      `Scheduling ${totalJobs} jobs (more than the rate limit of ${rateLimit})...`
    );

    const promises = [];
    for (let i = 0; i < totalJobs; i++) {
      promises.push(queue.schedule(timeTrackingJob, i + 1));
    }

    // Wait for all jobs to complete
    await Promise.all(promises);

    // Log all start times for debugging
    for (let i = 0; i < startTimes.length; i++) {
      const timeFromFirst = i > 0 ? startTimes[i] - startTimes[0] : 0;
      test.log(
        `Job ${jobIds[i]} started ${timeFromFirst}ms after the first job`
      );
    }

    // First batch (up to rate limit) should start quickly
    const firstBatchEndTime = startTimes[rateLimit - 1];
    const secondBatchStartTime = startTimes[rateLimit];
    const assertionTime = 59500; // 59.5 seconds

    const timeBetweenBatches = secondBatchStartTime - firstBatchEndTime;
    test.log(
      `Time between first batch and second batch: ${timeBetweenBatches}ms`
    );

    // The second batch should start significantly later (close to a minute)
    test.assert(
      timeBetweenBatches >= assertionTime,
      `Rate limiting should delay next batch of jobs by at least ${assertionTime}ms, got ${timeBetweenBatches}ms`
    );

    queue.dispose();
    test.log(`Queue disposed`);
  });

  // Job timeout
  await test.run("Job timeout mechanism", async () => {
    const timeoutLimit = 0.2; // 200ms timeout
    const queue = new JobQueue({ timeoutLimit });
    test.log(
      `Created queue with timeout limit of ${timeoutLimit} seconds (${
        timeoutLimit * 1000
      }ms)`
    );

    // Test job that completes before timeout
    test.log(
      `Testing job that completes before timeout (100ms < ${
        timeoutLimit * 1000
      }ms)...`
    );
    const fastResult = await queue.schedule(createSuccessJob(100));
    test.assert(
      fastResult.result.includes("100ms"),
      "Fast job should complete successfully"
    );

    // Test job that exceeds timeout
    test.log(
      `Testing job that exceeds timeout (300ms > ${timeoutLimit * 1000}ms)...`
    );
    await test.assertThrows(async () => {
      await queue.schedule(createSuccessJob(300));
    }, "timed out");

    queue.dispose();
    test.log(`Queue disposed`);
  });

  // Execution order (FIFO)
  await test.run("Execution order (FIFO)", async () => {
    const queue = new JobQueue({ concurrencyLimit: 1 });
    test.log(`Created queue with concurrency limit of 1 to test FIFO ordering`);

    const executionOrder: number[] = [];

    // Create jobs with different IDs and completion times
    const jobs = [
      queue.schedule(async () => {
        await wait(50);
        executionOrder.push(1);
        return 1;
      }),
      queue.schedule(async () => {
        await wait(10);
        executionOrder.push(2);
        return 2;
      }),
      queue.schedule(async () => {
        await wait(30);
        executionOrder.push(3);
        return 3;
      }),
    ];

    test.log(`Scheduled 3 jobs with different execution times`);
    test.log(`Job 1: 50ms, Job 2: 10ms, Job 3: 30ms`);

    // Wait for all jobs to complete
    await Promise.all(jobs);

    // Check execution order
    test.log(`Execution order: ${JSON.stringify(executionOrder)}`);
    test.assert(
      JSON.stringify(executionOrder) === JSON.stringify([1, 2, 3]),
      `Jobs should execute in FIFO order, got ${JSON.stringify(executionOrder)}`
    );

    queue.dispose();
    test.log(`Queue disposed`);
  });

  // Dispose
  await test.run("Dispose behavior with pending jobs", async () => {
    const queue = new JobQueue({ concurrencyLimit: 1 });
    test.log(`Created queue with concurrency limit of 1`);

    // Start one long-running job
    const runningJob = queue.schedule(createSuccessJob(300, "Running job"));
    test.log(`Scheduled one long-running job (300ms)`);

    // Queue up two more jobs
    const pendingJob1 = queue.schedule(createSuccessJob(50, "Pending job 1"));
    const pendingJob2 = queue.schedule(createSuccessJob(50, "Pending job 2"));
    test.log(`Scheduled two more jobs that should be queued`);

    // Wait a bit for the first job to start
    await wait(50);

    test.assert(
      queue.active() === 1,
      `Active count should be 1, got ${queue.active()}`
    );
    test.assert(
      queue.size() === 2,
      `Queue size should be 2, got ${queue.size()}`
    );

    // Dispose of the queue
    test.log(`Disposing queue while one job is running and two are queued`);
    queue.dispose();

    // Check that pending jobs are rejected
    await test.assertThrows(async () => {
      await pendingJob1;
    }, "disposed");

    await test.assertThrows(async () => {
      await pendingJob2;
    }, "disposed");

    // The running job should still complete
    try {
      const result = await runningJob;
      test.log(`Running job completed with result: ${result.result}`);
      test.assert(
        result.result.includes("Running job"),
        `Running job should complete successfully`
      );
    } catch (error) {
      throw new Error(
        `Running job should not be rejected when queue is disposed: ${error}`
      );
    }
  });

  // Schedule after dispose
  await test.run("Schedule after dispose rejection", async () => {
    const queue = new JobQueue();
    test.log(`Created queue with default options`);

    queue.dispose();
    test.log(`Disposed queue immediately`);

    await test.assertThrows(async () => {
      await queue.schedule(createSuccessJob(50));
    }, "disposed");
  });

  // Multiple concurrent queues
  await test.run("Multiple concurrent queues", async () => {
    const queue1 = new JobQueue({ concurrencyLimit: 2 });
    const queue2 = new JobQueue({ concurrencyLimit: 3 });
    test.log(`Created two queues with different concurrency limits`);

    // Track job execution per queue
    const executedInQueue1: number[] = [];
    const executedInQueue2: number[] = [];

    // Schedule jobs in both queues
    const jobs1 = [];
    const jobs2 = [];

    for (let i = 0; i < 5; i++) {
      jobs1.push(
        queue1.schedule(async () => {
          await wait(50);
          executedInQueue1.push(i);
          return i;
        })
      );

      jobs2.push(
        queue2.schedule(async () => {
          await wait(30);
          executedInQueue2.push(i + 10);
          return i + 10;
        })
      );
    }

    test.log(`Scheduled 5 jobs in each queue`);

    // Wait for all jobs to complete
    await Promise.all([...jobs1, ...jobs2]);

    test.log(`Queue 1 execution order: ${JSON.stringify(executedInQueue1)}`);
    test.log(`Queue 2 execution order: ${JSON.stringify(executedInQueue2)}`);

    test.assert(
      queue1.size() === 0,
      `Queue 1 size should be 0, got ${queue1.size()}`
    );
    test.assert(
      queue1.active() === 0,
      `Queue 1 active count should be 0, got ${queue1.active()}`
    );

    test.assert(
      queue2.size() === 0,
      `Queue 2 size should be 0, got ${queue2.size()}`
    );
    test.assert(
      queue2.active() === 0,
      `Queue 2 active count should be 0, got ${queue2.active()}`
    );

    queue1.dispose();
    queue2.dispose();
    test.log(`Both queues disposed`);
  });
}

// Run all tests
console.log("🚀 Starting JobQueue Tests...");
console.time("Tests Duration");

try {
  await runTests();
  console.timeEnd("Tests Duration");
  test.summary();
} catch (error) {
  console.error("❌ Unhandled error in test suite:");
  console.error(error);
  process.exit(1);
}
