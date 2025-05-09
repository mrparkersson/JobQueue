# JobQueue

A lightweight TypeScript job queue with support for:

- FIFO execution
- Concurrency limiting
- Rate limiting (jobs per minute)
- Job timeout control
- Graceful disposal of the queue

---

## Features

- *FIFO*: Jobs run in the order they are scheduled
- *Concurrency limit*: Control how many jobs run at the same time
- *Rate limiting*: Limit how many jobs start per minute
- *Timeouts*: Automatically reject jobs that exceed a max execution time
- *Error handling*: Failed jobs propagate the original error
- *Manual disposal*: Reject queued jobs and release resources

---

## Installation

Clone the repo and install dependencies:

```bash
git clone <your_repo_url>
cd job-queue
npm install

--- *to run test* -

npm run build
npm run test

