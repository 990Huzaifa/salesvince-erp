import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";


@Entity({ name: 'addons' })
export class Addon {

    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    name: string;

    @Column({ nullable: true })
    stripe_price_id: string;

    @Column({ nullable: true })
    payfast_price_id: string;

    @Column()
    slug: string;

    @Column()
    description: string;

    @Column()
    price: string;

    @Column()
    limitKey: string;

    @Column()
    limitValue: number;

    @Column({default: 'PKR'})
    currency: string;

    @Column({default: true})
    is_active: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @CreateDateColumn()
    updatedAt: Date;
}