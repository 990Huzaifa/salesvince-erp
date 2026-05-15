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
import { State } from './state.entity';

@Entity({ name: 'cities' })
export class City {
    @PrimaryGeneratedColumn()
    id: string;

    @Column()
    state_id: string;

    @ManyToOne(() => State, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'state_id' })
    state: State;

    @Column({ length: 150 })
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
