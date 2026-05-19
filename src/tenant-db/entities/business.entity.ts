import {
    Column,
    CreateDateColumn,
    DeleteDateColumn,
    Entity,
    Index,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { UserBusiness } from './user-business.entity';
import { Party } from './party.entity';
import { ChartOfAccount } from './chart-of-account.entity';
import { Transaction as TransactionEntity } from './transaction.entity';
import { ProductBrand, Product, ProductCategory, ProductPricing, ProductPricingJob } from './product.entity';
export enum BusinessStatus {
    ACTIVE = 'ACTIVE',
    INACTIVE = 'INACTIVE',
    SUSPENDED = 'SUSPENDED',
}

@Entity('businesses')
export class Business {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Index({ unique: true })
    @Column({ type: 'varchar', length: 150 })
    name: string;

    @Column({ type: 'varchar', length: 180, nullable: true })
    legalName: string | null;

    @Column({ type: 'varchar', length: 10, default: 'PKR' })
    currency: string;

    @Column({ type: 'date', nullable: true })
    financialYearStart: Date | null;

    @Column({ type: 'date', nullable: true })
    financialYearEnd: Date | null;

    @Column({
        type: 'enum',
        enum: BusinessStatus,
        default: BusinessStatus.ACTIVE,
    })
    status: BusinessStatus;

    @OneToMany(() => UserBusiness, (userBusiness) => userBusiness.business)
    userBusinesses: UserBusiness[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @DeleteDateColumn({ nullable: true })
    deletedAt: Date | null;


    @OneToMany(() => Party, (party) => party.business)
    parties: Party[];

    @OneToMany(() => ChartOfAccount, (chartOfAccount) => chartOfAccount.business)
    chartOfAccounts: ChartOfAccount[];

    @OneToMany(() => TransactionEntity, (transaction) => transaction.business)
    transactions: TransactionEntity[];

    @OneToMany(() => ProductCategory, (productCategory) => productCategory.business)
    productCategories: ProductCategory[];

    @OneToMany(() => ProductBrand, (productBrand) => productBrand.business)
    productBrands: ProductBrand[];

    @OneToMany(() => Product, (product) => product.business)
    products: Product[];

    @OneToMany(() => ProductPricing, (productPricing) => productPricing.product)
    productPricings: ProductPricing[];   

    @OneToMany(() => ProductPricingJob, (productPricingJob) => productPricingJob.business)
    productPricingJobs: ProductPricingJob[];   
}