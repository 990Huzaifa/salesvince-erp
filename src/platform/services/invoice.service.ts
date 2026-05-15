import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { ActivityLogActorType } from 'src/master-db/entities/activity-log.entity';
import { Invoice, InvoiceItem, InvoicePayment, Status as InvoiceStatus } from 'src/master-db/entities/invoice.entity';
import { BillingCycle, Plan } from 'src/master-db/entities/plan.entity';
import { CollectionType, Status as SubscriptionStatus, Subscription } from 'src/master-db/entities/subscription.entity';
import { LessThanOrEqual, Repository } from 'typeorm';
import { ActivityLogService } from './activity-log.service';
import { Tenant } from 'src/master-db/entities/tenant.entity';
import { CreateInvoicePaymentDto } from '../dto/invoice/create-invoice-payment.dto';

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);
  private isRenewalCronRunning = false;

  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(InvoiceItem)
    private readonly invoiceItemRepo: Repository<InvoiceItem>,
    @InjectRepository(InvoicePayment)
    private readonly invoicePaymentRepo: Repository<InvoicePayment>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    @InjectRepository(Plan)
    private readonly planRepo: Repository<Plan>,
    private readonly activityLogService: ActivityLogService,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {}


  private async recordAction(action: string, description: string, actorId:string , metadata?: Record<string, any> ) {
    await this.activityLogService.recordActivityLog({
        actorType: ActivityLogActorType.PLATFORM_USER,
        actorId: actorId,
        action,
        description,
        metadata: metadata ?? null,
    });
}


  async getInvoices(page = 1, limit = 10, user: any) {
    const safePage = Number(page) > 0 ? Number(page) : 1;
    const safeLimit = Number(limit) > 0 ? Number(limit) : 10;
    const skip = (safePage - 1) * safeLimit;

    const [invoices, total] = await this.invoiceRepo.findAndCount({
      relations: ['tenant', 'subscription'],
      order: { createdAt: 'DESC' },
      skip,
      take: safeLimit,
    });

    await this.recordAction('INVOICE_LIST', 'Invoice list fetched', user.id, { page, limit, total });

    return {
      data: invoices,
      meta: {
        total,
        page: safePage,
        limit: safeLimit,
      },
    };
  }

  async getInvoiceById(id: number, user: any) {
    const invoice = await this.invoiceRepo.findOne({
      where: { id },
      relations: {
        tenant: {
          profile: true,
        },
        invoiceItems: true,
        subscription: {
          plan: true,
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    await this.recordAction('INVOICE_SHOW', 'Invoice details fetched', user.id, { invoiceId: id });

    const subscription = invoice.subscription
      ? {
          ...invoice.subscription,
          plan: invoice.subscription.plan
            ? {
                id: invoice.subscription.plan.id,
                title: invoice.subscription.plan.title,
                billing_cycle: invoice.subscription.plan.billing_cycle,
              }
            : null,
        }
      : null;

    return {
      message: 'Invoice details fetched',
      invoice: {
        ...invoice,
        subscription,
      },
    };
  }

  // Runs hourly to generate renewal invoices for due subscriptions.
  @Cron(CronExpression.EVERY_10_HOURS)
  async scheduleRenewalInvoices() {
    await this.processRenewalInvoices('hourly-cron');
  }

  // Test cron: runs every minute only when INVOICE_TEST_CRON_ENABLED=true.
  @Cron(CronExpression.EVERY_MINUTE)
  async testInvoiceCronJob() {
    if (process.env.INVOICE_TEST_CRON_ENABLED !== 'true') {
      return;
    }
    console.log('Invoice test cron triggered');
    this.logger.log('Invoice test cron triggered');
    await this.processRenewalInvoices('test-cron');
  }

  async runInvoiceTestCronNow() {
    this.logger.log('Manual invoice test cron run started');
    await this.processRenewalInvoices('manual-test');
  }

  private async processRenewalInvoices(source: string) {
    if (this.isRenewalCronRunning) {
      this.logger.warn(`Invoice cron skipped (${source}): previous run still in progress`);
      return;
    }

    this.isRenewalCronRunning = true;
    const now = new Date();
    try {
      const dueSubscriptions = await this.subscriptionRepo.find({
        where: {
          status: SubscriptionStatus.ACTIVE,
          collectionType: CollectionType.AUTO,
          expiresAt: LessThanOrEqual(now),
        },
        relations: ['tenant', 'plan', 'subscriptionAddons', 'subscriptionAddons.addon'],
      });

      let processedCount = 0;
      for (const subscription of dueSubscriptions) {
        try {
          await this.createRenewalInvoice(subscription);
          processedCount += 1;
        } catch (error) {
          this.logger.error(
            `Failed invoice generation for subscription ${subscription.id}`,
            error instanceof Error ? error.stack : undefined,
          );
        }
      }

      this.logger.log(`Invoice cron finished (${source}): processed ${processedCount} subscriptions`);
    } finally {
      this.isRenewalCronRunning = false;
    }
  }

  private async createRenewalInvoice(subscription: Subscription) {
    const planId = subscription.plan?.id;
    if (!planId) {
      throw new NotFoundException(`Plan not found for subscription ${subscription.id}`);
    }

    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) {
      throw new NotFoundException(`Plan ${planId} not found for subscription ${subscription.id}`);
    }

    const lineItems = this.buildInvoiceLineItems(subscription, plan);
    const subTotalAmount = lineItems.reduce((sum, item) => sum + item.totalAmount, 0);
    const taxAmount = 0;
    const totalAmount = subTotalAmount + taxAmount;

    const issueDate = new Date();
    const dueDate = this.addDays(issueDate, 7);

    const invoice = await this.invoiceRepo.save({
      tenant: subscription.tenant,
      subscription,
      status: InvoiceStatus.ISSUE,
      issueDate,
      dueDate,
      subTotalAmount,
      taxAmount,
      totalAmount,
    });

    await this.invoiceItemRepo.save(
      lineItems.map((item) =>
        this.invoiceItemRepo.create({
          invoice,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalAmount: item.totalAmount,
        }),
      ),
    );

    subscription.expiresAt = this.nextRenewalDate(subscription.expiresAt, plan);
    subscription.plan = plan;
    await this.subscriptionRepo.save(subscription);
  }

  private buildInvoiceLineItems(subscription: Subscription, plan: Plan) {
    const addonBillingMultiplier = plan.billing_cycle === BillingCycle.YEARLY ? 12 : 1;
    const items = [
      {
        name: plan.title,
        quantity: 1,
        unitPrice: this.toAmount(plan.price),
        totalAmount: this.toAmount(plan.price),
      },
    ];

    for (const addon of subscription.subscriptionAddons ?? []) {
      const quantity = addon.quantity > 0 ? addon.quantity : 1;
      const unitPrice = this.toAmount(addon.addon.price) * addonBillingMultiplier;
      items.push({
        name: addon.addon.name,
        quantity,
        unitPrice,
        totalAmount: unitPrice * quantity,
      });
    }

    return items;
  }

  private toAmount(value: string) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : 0;
  }

  private nextRenewalDate(currentDate: Date, plan: Plan) {
    const nextDate = new Date(currentDate);
    if (plan.billing_cycle === BillingCycle.YEARLY) {
      nextDate.setFullYear(nextDate.getFullYear() + 1);
      return nextDate;
    }

    nextDate.setMonth(nextDate.getMonth() + 1);
    return nextDate;
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  async createInvoicePayment(id: number, dto: CreateInvoicePaymentDto, user: any) {
    const invoice = await this.invoiceRepo.findOne({
      where: { id },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Invoice is already paid');
    }

    const paymentAmount = Number(dto.amount);
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      throw new BadRequestException('Payment amount must be greater than 0');
    }

    const totalInvoiceAmount = Number(invoice.totalAmount);
    const existingPayments = await this.invoicePaymentRepo.find({
      where: { invoice: { id } },
    });
    const totalPaid = existingPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const remainingAmount = totalInvoiceAmount - totalPaid;

    if (paymentAmount > remainingAmount) {
      throw new BadRequestException(`Payment amount exceeds remaining balance of ${remainingAmount}`);
    }

    const payment = await this.invoicePaymentRepo.save(
      this.invoicePaymentRepo.create({
        invoice,
        paymentDate: new Date(dto.paymentDate),
        amount: String(paymentAmount),
        method: dto.method,
        remarks: dto.remarks?.trim() || null,
        reference: dto.reference?.trim() || null,
      }),
    );

    const updatedPaidAmount = totalPaid + paymentAmount;
    if (updatedPaidAmount >= totalInvoiceAmount) {
      invoice.status = InvoiceStatus.PAID;
      await this.invoiceRepo.save(invoice);
    }

    await this.recordAction('INVOICE_PAYMENT_CREATE', 'Invoice payment created', user.id, {
      invoiceId: invoice.id,
      paymentId: payment.id,
      amount: paymentAmount,
    });

    return {
      message: 'Invoice payment created',
      payment,
      invoiceStatus: updatedPaidAmount >= totalInvoiceAmount ? InvoiceStatus.PAID : invoice.status,
      remainingAmount: Math.max(totalInvoiceAmount - updatedPaidAmount, 0),
    };
  }


}
