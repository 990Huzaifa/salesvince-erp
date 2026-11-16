import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { SaleInvoice } from "./sale-invoice.entity";
import { Product, ProductFlavour, Uom } from "./product.entity";
import { Business } from "./business.entity";
import { Warehouse } from "./warehouse.entity";
import { Party } from "./party.entity";
import { Service } from "./service.entity";
import { SALE_ITEM_TYPE_ENUM_NAME, SaleItemType } from "./sale-item-type";

export enum SaleReturnStatus {
    PENDING = 'PENDING',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
}

export enum SaleReturnMode {
    INVOICE = 'INVOICE',
    CUSTOMER = 'CUSTOMER',
}

@Entity('sale_returns')
export class SaleReturn {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    businessId: string;

    @ManyToOne(() => Business, (business) => business.saleReturns, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'businessId' })
    business: Business;

    @Column({
        type: 'enum',
        enum: SaleReturnMode,
        default: SaleReturnMode.INVOICE,
    })
    returnMode: SaleReturnMode;

    @Column({ nullable: true })
    saleInvoiceId: string | null;

    @ManyToOne(() => SaleInvoice, (saleInvoice) => saleInvoice.saleReturns, {
        onDelete: 'CASCADE',
        nullable: true,
    })
    @JoinColumn({ name: 'saleInvoiceId' })
    saleInvoice: SaleInvoice | null;

    @Column()
    customerId: string;

    @ManyToOne(() => Party, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'customerId' })
    customer: Party;

    @Column({ unique: true })
    returnNumber: string;

    @Column()
    returnDate: Date;

    @Column()
    returnReason: string;

    @Column(
        {
            type: 'enum',
            enum: SaleReturnStatus,
            default: SaleReturnStatus.PENDING,
        }
    )
    status: SaleReturnStatus;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => SaleReturnItem, (item) => item.saleReturn)
    saleReturnItems: SaleReturnItem[];
}

@Entity('sale_return_items')
export class SaleReturnItem {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    saleReturnId: string;

    @ManyToOne(() => SaleReturn, (saleReturn) => saleReturn.saleReturnItems)
    saleReturn: SaleReturn;

    @Column({
        type: 'enum',
        enum: SaleItemType,
        enumName: SALE_ITEM_TYPE_ENUM_NAME,
        default: SaleItemType.PRODUCT,
    })
    itemType: SaleItemType;

    @Column({ type: 'uuid', nullable: true })
    serviceId: string | null;

    @ManyToOne(() => Service, { nullable: true, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'serviceId' })
    service: Service | null;

    @Column({ type: 'uuid', nullable: true })
    productId: string | null;

    @ManyToOne(() => Product, (product) => product.saleReturnItems, { nullable: true })
    product: Product | null;

    @Column({nullable: true})
    productFlavourId: string;

    @ManyToOne(() => ProductFlavour, (productFlavour) => productFlavour.saleReturnItems)
    productFlavour: ProductFlavour;

    @Column({ type: 'uuid', nullable: true })
    uomId: string | null;

    @ManyToOne(() => Uom, (uom) => uom.saleReturnItems, { nullable: true })
    uom: Uom | null;

    @Column({ type: 'uuid', nullable: true })
    warehouseId: string | null;

    @ManyToOne(() => Warehouse, { nullable: true, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'warehouseId' })
    warehouse: Warehouse | null;

    @Column()
    quantity: number;

    @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
    saleUnitPrice: number;

    @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
    purchaseUnitPrice: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
