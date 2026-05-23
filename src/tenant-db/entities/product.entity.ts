import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
// import { PurchaseStockItem } from './purchase-stock.entity';
// import { OpeningStockItem } from './opening-stock.entity';
// import { StockBalance, StockMovement } from './stock.entity';
// import { StockTransferItem } from './stock-transfer.entity';
// import { SchemeProduct, SchemeProductCategory } from './scheme.entity';
import { Business } from './business.entity';
import { ChartOfAccount } from './chart-of-account.entity';
import { SaleOrderItem } from './sale-order.entity';
import { PurchaseOrderItem } from './purchase-order.entity';
import { GrnItem } from './grn.entity';
import { PurchaseQuotationItem } from './purchase-quotation.entity';
import { Batch, StockMovement, StockBalance } from './stock.entity';
import { PurchaseInvoiceItem } from './purchase-invoice.entity';
import { SaleQuotationItem } from './sale-quotation.entity';

export enum BatchPickStrategy {
    FIFO = 'FIFO',
    LIFO = 'LIFO',
    AVG_COST = 'AVG_COST',
}

@Entity('product_categories')
export class ProductCategory {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    businessId: string;

    @ManyToOne(() => Business, (business) => business.productCategories, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'businessId' })
    business: Business;

    @Column()
    name: string;

    @Column()
    slug: string;

    @Column({ type: 'uuid', nullable: true })
    chartOfAccountId: string | null;

    @ManyToOne(() => ChartOfAccount, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'chartOfAccountId' })
    chartOfAccount: ChartOfAccount | null;

    @Column({ name: 'created_by', nullable: true })
    createdBy: string;

    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'created_by' })
    createdByUser: User | null;

    @OneToMany(() => Product, (product) => product.category)
    products: Product[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => ProductSubCategory, (subCategory) => subCategory.category)
    subCategories: ProductSubCategory[];
}

@Entity('product_sub_categories')
export class ProductSubCategory {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column()
    slug: string;

    @Column()
    businessId: string;

    @ManyToOne(() => Business, (business) => business.productSubCategories, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'businessId' })
    business: Business;

    @Column()
    categoryId: string;

    @ManyToOne(() => ProductCategory, (category) => category.subCategories, { onDelete: 'RESTRICT' })
    @JoinColumn()
    category: ProductCategory;

    @Column({ type: 'uuid', nullable: true })
    chartOfAccountId: string | null;

    @ManyToOne(() => ChartOfAccount, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'chartOfAccountId' })
    chartOfAccount: ChartOfAccount | null;

    @OneToMany(() => Product, (product) => product.subCategory)
    products: Product[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}

@Entity('flavours')
export class Flavour {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    businessId: string;

    @ManyToOne(() => Business, (business) => business.flavours, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'businessId' })
    business: Business; 

    @Column()
    name: string;

    @OneToMany(() => ProductFlavour, (productFlavour) => productFlavour.flavour)
    products: ProductFlavour[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

}

@Entity({ name: 'uoms' })
export class Uom {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    businessId: string;

    @ManyToOne(() => Business, (business) => business.uoms, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'businessId' })
    business: Business;

    @Column()
    name: string;

    @Column({ name: 'is_base', default: false })
    isBase: boolean;

    @OneToMany(() => ProductPricing, (productPricing) => productPricing.uom)
    pricings: ProductPricing[];  

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    // relationships
    @OneToMany(() => PurchaseQuotationItem, (purchaseQuotationItem) => purchaseQuotationItem.uom)
    purchaseQuotationItems: PurchaseQuotationItem[];
    @OneToMany(() => PurchaseOrderItem, (purchaseOrderItem) => purchaseOrderItem.uom)
    purchaseOrderItems: PurchaseOrderItem[];
    @OneToMany(() => GrnItem, (grnItem) => grnItem.uom)
    grnItems: GrnItem[];
    @OneToMany(() => PurchaseInvoiceItem, (purchaseInvoiceItem) => purchaseInvoiceItem.uom)
    purchaseInvoiceItems: PurchaseInvoiceItem[];
    

    @OneToMany(() => SaleQuotationItem, (saleQuotationItem) => saleQuotationItem.uom)
    saleQuotationItems: SaleQuotationItem[];

    @OneToMany(() => SaleOrderItem, (saleOrderItem) => saleOrderItem.uom)
    saleOrderItems: SaleOrderItem[];
}

@Entity('product_brands')
export class ProductBrand {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    businessId: string;

    @ManyToOne(() => Business, (business) => business.productBrands, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'businessId' })
    business: Business;

    @Column()
    name: string;

    @OneToMany(() => Product, (product) => product.brand)
    products: Product[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}

@Entity('products')
export class Product {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    businessId: string;

    @ManyToOne(() => Business, (business) => business.products, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'businessId' })
    business: Business;

    @Column()
    categoryId: string;

    @ManyToOne(() => ProductCategory, (category) => category.products, { onDelete: 'RESTRICT' })
    @JoinColumn()
    category: ProductCategory;

    @Column()
    subCategoryId: string;

    @ManyToOne(() => ProductSubCategory, (subCategory) => subCategory.products, { onDelete: 'RESTRICT' })
    @JoinColumn()
    subCategory: ProductSubCategory;

    @Column({unique: true })
    skuCode: string;

    @Column({unique: true, nullable: true })
    barcode: string | null;

    @Column()
    name: string;

    @Column({type: 'enum', enum: BatchPickStrategy, default: BatchPickStrategy.LIFO})
    batchPickStrategy: BatchPickStrategy;

    @Column({nullable: true })
    hsCode: string;

    @Column({nullable: true })
    description: string;

    @Column({nullable: true })
    brandId: string;

    @ManyToOne(() => ProductBrand, (brand) => brand.products, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'brandId' })
    brand: ProductBrand | null;

    @Column({nullable: true })
    image: string | null;

    @Column({ type: 'uuid', nullable: true })
    chartOfAccountId: string | null;

    @ManyToOne(() => ChartOfAccount, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'chartOfAccountId' })
    chartOfAccount: ChartOfAccount | null;

    @Column({ default: true })
    isActive: boolean;

    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'createdBy' })
    createdBy: User | null;

    @Column({ default: false })
    isDelete: boolean;

    @OneToMany(() => ProductFlavour, (flavour) => flavour.product)
    flavours: ProductFlavour[];

    @OneToMany(() => ProductPricing, (pricing) => pricing.product)
    pricing: ProductPricing[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;


    // relationships
    @OneToMany(() => ProductPricingJob, (productPricingJob) => productPricingJob.product)
    pricingJobs: ProductPricingJob[];

    @OneToMany(() => PurchaseQuotationItem, (purchaseQuotationItem) => purchaseQuotationItem.product)
    purchaseQuotationItems: PurchaseQuotationItem[];

    @OneToMany(() => PurchaseOrderItem, (purchaseOrderItem) => purchaseOrderItem.product)
    purchaseOrderItems: PurchaseOrderItem[];

    @OneToMany(() => GrnItem, (grnItem) => grnItem.product)
    grnItems: GrnItem[];

    @OneToMany(() => PurchaseInvoiceItem, (purchaseInvoiceItem) => purchaseInvoiceItem.product)
    purchaseInvoiceItems: PurchaseInvoiceItem[];

    @OneToMany(() => SaleQuotationItem, (saleQuotationItem) => saleQuotationItem.product)
    saleQuotationItems: SaleQuotationItem[];

    @OneToMany(() => SaleOrderItem, (saleOrderItem) => saleOrderItem.product)
    saleOrderItems: SaleOrderItem[];

    @OneToMany(() => Batch, (batch) => batch.product, { onDelete: 'CASCADE' })
    batches: Batch[];

    @OneToMany(() => StockBalance, (stockBalance) => stockBalance.product, { onDelete: 'CASCADE' })
    stockBalances: StockBalance[];

    @OneToMany(() => StockMovement, (stockMovement) => stockMovement.product, { onDelete: 'CASCADE' })
    stockMovements: StockMovement[];

}

@Entity('product_flavours')
export class ProductFlavour {
    @PrimaryGeneratedColumn()
    id: string;

    @ManyToOne(() => Product, (product) => product.flavours, { onDelete: 'CASCADE' })
    @JoinColumn()
    product: Product;

    @Column()
    productId: string;

    @ManyToOne(() => Flavour, { onDelete: 'RESTRICT' })
    @JoinColumn()
    flavour: Flavour;

    @Column()
    flavourId: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    // relationships

    @OneToMany(() => PurchaseOrderItem, (purchaseOrderItem) => purchaseOrderItem.productFlavour)
    purchaseOrderItems: PurchaseOrderItem[];

    @OneToMany(() => SaleOrderItem, (saleOrderItem) => saleOrderItem.productFlavour)
    saleOrderItems: SaleOrderItem[];

    @OneToMany(() => GrnItem, (grnItem) => grnItem.productFlavour)
    grnItems: GrnItem[];
}

@Entity('product_pricings')
export class ProductPricing {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    productId: string;

    @ManyToOne(() => Product, (product) => product.pricing, { onDelete: 'CASCADE' })
    @JoinColumn()
    product: Product;

    @Column()
    uomId: string;

    @ManyToOne(() => Uom, (uom) => uom.pricings, { onDelete: 'RESTRICT' })
    @JoinColumn()
    uom: Uom;

    @Column({type: 'decimal', precision: 18, scale: 2})
    purchaseUnitPrice: number;

    @Column({type: 'decimal', precision: 18, scale: 2})
    saleUnitMarginAmount: number;

    @Column({type: 'decimal', precision: 18, scale: 2})
    saleUnitMarginPercentage: number;

    @Column()
    quantity: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => ProductPricingJob, (productPricingJob) => productPricingJob.productPricing)
    pricingJobs: ProductPricingJob[];
}

@Entity('product_pricing_jobs')
export class ProductPricingJob {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    businessId: string;

    @ManyToOne(() => Business, (business) => business.productPricingJobs, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'businessId' })
    business: Business;

    @Column()
    productId: string;

    @ManyToOne(() => Product, (product) => product.pricingJobs, { onDelete: 'CASCADE' })
    @JoinColumn()
    product: Product;
    
    @Column()
    productPricingId: string;

    @ManyToOne(() => ProductPricing, (productPricing) => productPricing.pricingJobs, { onDelete: 'CASCADE' })
    @JoinColumn()
    productPricing: ProductPricing;

    @Column()
    startDate: Date;

    @Column()
    status: 'PENDING' | 'COMPLETED' | 'FAILED';

    @Column()
    purchaseUnitPrice: string;

    @Column()
    saleUnitPrice: string;

    @Column()
    quantity: number;

    @Column()
    errorMessage: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
