import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from 'src/master-db/entities/customer.entity';
import { ActivityLogService } from './activity-log.service';
import { ActivityLogActorType } from 'src/master-db/entities/activity-log.entity';

@Injectable()
export class CustomerService {
    constructor(
        @InjectRepository(Customer)
        private readonly customerRepo: Repository<Customer>,
        private readonly activityLogService: ActivityLogService,
    ) { }

    private async recordAction(action: string, description: string, actorId:string, metadata?: Record<string, any>) {
        await this.activityLogService.recordActivityLog({
            actorType: ActivityLogActorType.PLATFORM_USER,
            actorId: actorId,
            action,
            description,
            metadata: metadata ?? null,
        });
    }


    async getCustomers(page = 1, limit = 10, user: any) {
        const skip = (page - 1) * limit;
        const customers = await this.customerRepo.find({
            skip: skip,
            take: limit,
            select: ['id', 'email', 'fullName', 'isActive', 'createdAt', 'updatedAt'],
            order: { createdAt: 'ASC' },
        });
        await this.recordAction('CUSTOMER_LIST', 'Customer list fetched', user.id, { page, limit, count: customers.length });
        return {
            data: customers,
            meta: {
                page: page,
                limit: limit,
            },
        };
    }

    async showCustomer(id: string, user: any) {
        const customer = await this.customerRepo.findOne({ where: { id: id } });

        if (!customer) {
            throw new NotFoundException('Customer not found');
        }
        delete customer.passwordHash;
        await this.recordAction('CUSTOMER_SHOW', 'Customer details fetched', user.id, { customerId: id });
        return customer;
    }


}
