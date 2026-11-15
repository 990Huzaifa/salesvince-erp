import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { SaleInvoice } from "./sale-invoice.entity";
import { Product, ProductFlavour, Uom } from "./product.entity";
import { Business } from "./business.entity";
import { Warehouse } from "./warehouse.entity";
import { Party } from "./party.entity";

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

    @Column()
    productId: string;

    @ManyToOne(() => Product, (product) => product.saleReturnItems)
    product: Product;

    @Column({nullable: true})
    productFlavourId: string;

    @ManyToOne(() => ProductFlavour, (productFlavour) => productFlavour.saleReturnItems)
    productFlavour: ProductFlavour;

    @Column()
    uomId: string;

    @ManyToOne(() => Uom, (uom) => uom.saleReturnItems)
    uom: Uom;

    @Column()
    warehouseId: string;

    @ManyToOne(() => Warehouse, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'warehouseId' })
    warehouse: Warehouse;

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
