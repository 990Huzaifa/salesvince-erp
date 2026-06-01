import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { SaleInvoice } from "./sale-invoice.entity";
import { Product, ProductFlavour, Uom } from "./product.entity";
import { Business } from "./business.entity";
import { Warehouse } from "./warehouse.entity";

export enum SaleReturnStatus {
    PENDING = 'PENDING',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
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

    @Column()
    warehouseId: string;

    @ManyToOne(() => Warehouse, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'warehouseId' })
    warehouse: Warehouse;

    @Column()
    saleInvoiceId: string;

    @ManyToOne(() => SaleInvoice, (saleInvoice) => saleInvoice.saleReturns, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'saleInvoiceId' })
    saleInvoice: SaleInvoice;

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
    quantity: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}   