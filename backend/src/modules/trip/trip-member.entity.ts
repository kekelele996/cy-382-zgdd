import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { MemberStatus } from '../../constants/status';

@Entity('trip_members')
@Index('idx_member_trip_user', ['tripId', 'userId'], { unique: true })
export class TripMemberEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'trip_id' }) tripId!: number;
  @Column({ name: 'user_id' }) userId!: number;
  @Column({ name: 'joined_nickname' }) joinedNickname!: string;
  @Column({ type: 'varchar', length: 20, default: MemberStatus.Active }) status!: MemberStatus;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}
