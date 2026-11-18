import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SaleReturn } from 'src/tenant-db/entities/sale-return.entity';
import { ActivityLogService } from '../activity-log.service';
import { SaleReturnService } from './sale-return.service';

/**
 * Hard-deletes a sale return: reverses approved stock/ledger side effects,
 * then permanently removes the return and its items from the DB.
 */
@Injectable()
export class SaleReturnDeleteService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly saleReturnService: SaleReturnService,
  ) {}

  private assertBusinessId(businessId?: string): string {
    if (!businessId) {
      throw new BadRequestException('Business context is required');
    }
    return businessId;
  }

  private async findReturnForBusiness(
    tenantDb: DataSource,
    businessId: string,
    returnId: string,
  ): Promise<SaleReturn> {
    const saleReturn = await tenantDb
      .getRepository(SaleReturn)
      .createQueryBuilder('saleReturn')
      .leftJoinAndSelect('saleReturn.customer', 'returnCustomer')
      .leftJoinAndSelect('saleReturn.saleInvoice', 'saleInvoice')
      .leftJoinAndSelect('saleInvoice.items', 'invoiceItems')
      .leftJoinAndSelect('saleInvoice.deliveryNote', 'deliveryNote')
      .leftJoinAndSelect('saleInvoice.customer', 'customer')
      .leftJoinAndSelect('saleInvoice.saleOrder', 'saleOrder')
      .leftJoinAndSelect('saleOrder.items', 'saleOrderItems')
      .leftJoinAndSelect('saleReturn.saleReturnItems', 'items')
      .leftJoinAndSelect('items.warehouse', 'warehouse')
      .where('saleReturn.id = :returnId', { returnId })
      .andWhere('saleReturn.businessId = :businessId', { businessId })
      .getOne();

    if (!saleReturn) {
      throw new NotFoundException('Sale return not found');
    }

    return saleReturn;
  }

  async delete(
    tenantDb: DataSource,
    businessId: string | undefined,
    returnId: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const saleReturn = await this.findReturnForBusiness(
      tenantDb,
      scopedBusinessId,
      returnId,
    );

    const returnNumber = saleReturn.returnNumber;
    const saleReturnId = saleReturn.id;

    await tenantDb.transaction(async (manager) => {
      await this.saleReturnService.removeForOrderCascade(
        manager,
        scopedBusinessId,
        saleReturn,
      );
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALE_RETURN_DELETED',
      description: `Sale return ${returnNumber} deleted`,
      metadata: { saleReturnId },
    });

    return {
      message: 'Sale return deleted',
      data: {
        id: saleReturnId,
        returnNumber,
      },
    };
  }
}
