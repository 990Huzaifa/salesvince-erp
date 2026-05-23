import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Party } from "./party.entity";
import { User } from "./user.entity";
import { Product, Uom } from "./product.entity";
import { Business } from "./business.entity";

@Entity({ name: 'sale_quotations' })
export class SaleQuotation {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    businessId: string;

    @ManyToOne(() => Business, (business) => business.saleQuotations, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'businessId' })
    business: Business;

    @Column()
    quotationNumber: string;

    @Column()
    customerId: string;

    @ManyToOne(() => Party, (party) => party.saleQuotations, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'customerId' })
    customer: Party;

    @Column()
    quotationDate: Date;

    @Column({nullable: true})
    notes: string;

    @Column('uuid')
    createdBy: string;

    @ManyToOne(() => User, (user) => user.saleQuotations, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'createdBy' })
    createdByUser: User;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    // relationships
    @OneToMany(() => SaleQuotationItem, (item) => item.saleQuotation, { onDelete: 'CASCADE' })
    items: SaleQuotationItem[];
}

@Entity({ name: 'sale_quotation_items' })
export class SaleQuotationItem {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    saleQuotationId: string;

    @ManyToOne(() => SaleQuotation, (saleQuotation) => saleQuotation.items, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'saleQuotationId' })
    saleQuotation: SaleQuotation;

    @Column()
    productId: string;

    @ManyToOne(() => Product, (product) => product.saleQuotationItems, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'productId' })
    product: Product;
    
    @Column()
    uomId: string;

    @ManyToOne(() => Uom, (uom) => uom.saleQuotationItems, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'uomId' })
    uom: Uom;

    @Column()
    quantity: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}