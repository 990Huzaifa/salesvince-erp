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
import { ProductBrand, Product, ProductCategory, ProductPricing, ProductPricingJob, ProductSubCategory, Uom, Flavour } from './product.entity';
import { Warehouse } from './warehouse.entity';
import { Grn } from './grn.entity';
import { Batch, StockMovement } from './stock.entity';
import { StockBalance } from './stock.entity';
import { PurchaseOrder } from './purchase-order.entity';
import { PurchaseInvoice } from './purchase-invoice.entity';
import { SaleQuotation } from './sale-quotation.entity';
import { PurchaseQuotation } from './purchase-quotation.entity';
import { SaleOrder } from './sale-order.entity';
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

    @Index({ unique: true })
    @Column({ type: 'varchar', length: 20 })
    code: string;

    @Column({ type: 'varchar', length: 180, nullable: true })
    legalName: string | null;

    @Column({nullable: true })
    logo: string | null;

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


    @OneToMany(() => Party, (party) => party.business, { onDelete: 'CASCADE' })
    parties: Party[];

    @OneToMany(() => ChartOfAccount, (chartOfAccount) => chartOfAccount.business, { onDelete: 'CASCADE' })
    chartOfAccounts: ChartOfAccount[];

    @OneToMany(() => TransactionEntity, (transaction) => transaction.business, { onDelete: 'CASCADE' })
    transactions: TransactionEntity[];

    @OneToMany(() => Flavour, (flavour) => flavour.business, { onDelete: 'CASCADE' })
    flavours: Flavour[];

    @OneToMany(() => ProductCategory, (productCategory) => productCategory.business, { onDelete: 'CASCADE' })
    productCategories: ProductCategory[];

    @OneToMany(() => ProductSubCategory, (productSubCategory) => productSubCategory.business, { onDelete: 'CASCADE' })
    productSubCategories: ProductSubCategory[];

    @OneToMany(() => ProductBrand, (productBrand) => productBrand.business, { onDelete: 'CASCADE' })
    productBrands: ProductBrand[];

    @OneToMany(() => Product, (product) => product.business, { onDelete: 'CASCADE' })
    products: Product[];

    @OneToMany(() => ProductPricing, (productPricing) => productPricing.product, { onDelete: 'CASCADE' })
    productPricings: ProductPricing[];   

    @OneToMany(() => ProductPricingJob, (productPricingJob) => productPricingJob.business, { onDelete: 'CASCADE' })
    productPricingJobs: ProductPricingJob[]; 
    
    @OneToMany(() => Uom, (uom) => uom.business, { onDelete: 'CASCADE' })
    uoms: Uom[];

    @OneToMany(() => Warehouse, (warehouse) => warehouse.business, { onDelete: 'CASCADE' })
    warehouses: Warehouse[];

    @OneToMany(() => PurchaseQuotation, (purchaseQuotation) => purchaseQuotation.business, { onDelete: 'CASCADE' })
    purchaseQuotations: PurchaseQuotation[];

    @OneToMany(() => PurchaseOrder, (purchaseOrder) => purchaseOrder.business, { onDelete: 'CASCADE' })
    purchaseOrders: PurchaseOrder[];

    @OneToMany(() => Grn, (grn) => grn.business, { onDelete: 'CASCADE' })
    grns: Grn[];

    @OneToMany(() => PurchaseInvoice, (purchaseInvoice) => purchaseInvoice.business, { onDelete: 'CASCADE' })
    purchaseInvoices: PurchaseInvoice[];

    @OneToMany(() => SaleQuotation, (saleQuotation) => saleQuotation.business, { onDelete: 'CASCADE' })
    saleQuotations: SaleQuotation[];

    @OneToMany(() => SaleOrder, (saleOrder) => saleOrder.business, { onDelete: 'CASCADE' })
    saleOrders: SaleOrder[];

    @OneToMany(() => Batch, (batch) => batch.business, { onDelete: 'CASCADE' })
    batches: Batch[];

    @OneToMany(() => StockBalance, (stockBalance) => stockBalance.business, { onDelete: 'CASCADE' })
    stockBalances: StockBalance[];

    @OneToMany(() => StockMovement, (stockMovement) => stockMovement.business, { onDelete: 'CASCADE' })
    stockMovements: StockMovement[];


}