import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
} from 'typeorm';
import { Country } from './country.entity';

@Entity({ name: 'states' })
export class State {
    @PrimaryGeneratedColumn()
    id: string;

    @Column()
    country_id: string;

    @ManyToOne(() => Country, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'country_id' })
    country: Country;

    @Column({ length: 100 })
    name: string;

    @Column({ length: 20, nullable: true })
    code: string;

    @Column({ default: true })
    is_active: boolean;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}
