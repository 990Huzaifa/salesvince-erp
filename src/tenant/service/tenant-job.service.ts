import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomUUID } from 'crypto';

export type TenantJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type TenantJobLog = {
  row: number;
  name: string;
  status: 'success' | 'error';
  error?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
};

export type TenantJob = {
  id: string;
  tenantCode: string;
  jobType: string;
  fileName: string;
  status: TenantJobStatus;
  createdBy: string;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  totalRows: number;
  inserted: number;
  failed: number;
  logs: TenantJobLog[];
};

type CreateTenantJobPayload = {
  tenantCode: string;
  jobType: string;
  fileName: string;
  createdBy: string;
  totalRows: number;
};

@Injectable()
export class TenantJobService {
  private readonly logger = new Logger(TenantJobService.name);
  private readonly jobs = new Map<string, TenantJob>();
  private readonly retentionMs = 24 * 60 * 60 * 1000;

  createJob(payload: CreateTenantJobPayload): TenantJob {
    const job: TenantJob = {
      id: randomUUID(),
      tenantCode: payload.tenantCode,
      jobType: payload.jobType,
      fileName: payload.fileName,
      status: 'queued',
      createdBy: payload.createdBy,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      totalRows: payload.totalRows,
      inserted: 0,
      failed: 0,
      logs: [],
    };

    this.jobs.set(job.id, job);
    return job;
  }

  startJob(jobId: string) {
    const job = this.mustGetJob(jobId);
    job.status = 'processing';
    if (!job.startedAt) {
      job.startedAt = new Date();
    }
    return job;
  }

  completeJob(jobId: string) {
    const job = this.mustGetJob(jobId);
    job.status = 'completed';
    job.completedAt = new Date();
    return job;
  }

  failJob(jobId: string) {
    const job = this.mustGetJob(jobId);
    job.status = 'failed';
    job.completedAt = new Date();
    return job;
  }

  appendLog(jobId: string, log: Omit<TenantJobLog, 'createdAt'>) {
    const job = this.mustGetJob(jobId);
    job.logs.push({
      ...log,
      createdAt: new Date(),
    });

    if (log.status === 'success') {
      job.inserted += 1;
    } else {
      job.failed += 1;
    }

    return job;
  }

  getJobById(jobId: string, tenantCode: string, userId: string): TenantJob {
    const job = this.mustGetJob(jobId);
    if (job.tenantCode !== tenantCode || job.createdBy !== userId) {
      throw new NotFoundException('Import job not found');
    }
    return job;
  }

  listJobsForUser(tenantCode: string, userId: string): TenantJob[] {
    return [...this.jobs.values()]
      .filter((job) => job.tenantCode === tenantCode && job.createdBy === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  @Cron(CronExpression.EVERY_HOUR)
  cleanupExpiredJobs() {
    const now = Date.now();
    let deleted = 0;

    for (const [jobId, job] of this.jobs.entries()) {
      if (job.status !== 'completed' && job.status !== 'failed') {
        continue;
      }
      if (!job.completedAt) {
        continue;
      }
      const expired = now - job.completedAt.getTime() > this.retentionMs;
      if (expired) {
        this.jobs.delete(jobId);
        deleted += 1;
      }
    }

    if (deleted > 0) {
      this.logger.log(`Tenant job cleanup removed ${deleted} expired jobs`);
    }
  }

  private mustGetJob(jobId: string): TenantJob {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new NotFoundException('Import job not found');
    }
    return job;
  }
}
