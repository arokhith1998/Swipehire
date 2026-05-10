import cron from 'node-cron';
import { jobAggregator } from './jobAggregator';

class JobSchedulerService {
  private isScheduled = false;
  private scheduledTask: any = null;

  startScheduler() {
    if (this.isScheduled) {
      console.log("Job scheduler already running");
      return;
    }

    // Run job aggregation every 6 hours
    this.scheduledTask = cron.schedule('0 */6 * * *', async () => {
      console.log('Starting scheduled job aggregation...');
      try {
        await jobAggregator.refreshJobData();
        console.log('Scheduled job aggregation completed successfully');
      } catch (error) {
        console.error('Scheduled job aggregation failed:', error);
      }
    });

    // Run initial job aggregation on startup (after 30 seconds delay)
    setTimeout(async () => {
      console.log('Running initial job aggregation...');
      try {
        await jobAggregator.aggregateJobs(25);
        console.log('Initial job aggregation completed');
      } catch (error) {
        console.error('Initial job aggregation failed:', error);
      }
    }, 30000);

    this.isScheduled = true;
    console.log('Job scheduler started - will refresh jobs every 6 hours');
  }

  stopScheduler() {
    if (this.scheduledTask) {
      this.scheduledTask.destroy();
    }
    this.isScheduled = false;
    console.log('Job scheduler stopped');
  }

  async manualRefresh(): Promise<void> {
    console.log('Manual job refresh triggered');
    await jobAggregator.refreshJobData();
  }
}

export const jobScheduler = new JobSchedulerService();