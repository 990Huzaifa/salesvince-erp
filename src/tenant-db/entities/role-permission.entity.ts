import {
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    Column,
  } from 'typeorm';
  import { Role } from './role.entity';
  import { Permission } from './permission.entity';
  
  @Entity('role_permissions')
  @Index(['roleId', 'permissionId'], { unique: true })
  export class RolePermission {
    @PrimaryGeneratedColumn('uuid')
    id: string;
  
    @Column({ type: 'uuid' })
    roleId: string;
  
    @Column({ type: 'uuid' })
    permissionId: string;
  
    @ManyToOne(() => Role, (role) => role.rolePermissions, {
      onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'roleId' })
    role: Role;
  
    @ManyToOne(() => Permission, (permission) => permission.rolePermissions, {
      onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'permissionId' })
    permission: Permission;
  
    @CreateDateColumn()
    createdAt: Date;
  }