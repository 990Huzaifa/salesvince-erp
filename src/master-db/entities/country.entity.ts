import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
} from 'typeorm';

@Entity({ name: 'countries' })
export class Country {
    @PrimaryGeneratedColumn()
    id: string;

    @Column({ length: 100 })
    @Index({ unique: true })
    name: string;

    @Column({ length: 10 })
    @Index({ unique: true })
    iso_code: string;

    @Column({ default: true })
    is_active: boolean;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}
