import { PrimaryGeneratedColumn, Column, BeforeInsert } from 'typeorm';
import { now } from '../../common/utils';

export const S = (o: any = {}) => Column({ type: 'varchar', nullable: true, ...o });
export const J = () => Column({ type: 'simple-json', nullable: true });
export const N = (d = 0) => Column({ type: 'int', default: d });
export const F = (d = 0) => Column({ type: 'float', default: d });
export const B = (d = false) => Column({ type: 'boolean', default: d });

export abstract class Base {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  createdAt: string;

  @BeforeInsert()
  ts() {
    this.createdAt = this.createdAt || now();
  }
}
