import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Party } from "./party.entity";
import { User } from "./user.entity";
import { Product, Uom } from "./product.entity";

@Entity({ name: 'purchase_quotations' })
export class PurchaseQuotation {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    quotationNumber: string;

    @Column()
    vendorId: string;

    @ManyToOne(() => Party, (party) => party.purchaseQuotations, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'vendorId' })
    vendor: Party;

    @Column()
    quotationDate: Date;

    @Column({nullable: true})
    notes: string;

    @Column('uuid')
    createdBy: string;

    @ManyToOne(() => User, (user) => user.purchaseQuotations, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'createdBy' })
    createdByUser: User;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    // relationships
    @OneToMany(() => PurchaseQuotationItem, (item) => item.purchaseQuotation, { onDelete: 'CASCADE' })
    items: PurchaseQuotationItem[];
}

@Entity({ name: 'purchase_quotation_items' })
export class PurchaseQuotationItem {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    purchaseQuotationId: string;

    @ManyToOne(() => PurchaseQuotation, (purchaseQuotation) => purchaseQuotation.items, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'purchaseQuotationId' })
    purchaseQuotation: PurchaseQuotation;

    @Column()
    productId: string;

    @ManyToOne(() => Product, (product) => product.purchaseQuotationItems, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'productId' })
    product: Product;
    
    @Column()
    uomId: string;

    @ManyToOne(() => Uom, (uom) => uom.purchaseQuotationItems, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'uomId' })
    uom: Uom;

    @Column()
    quantity: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}