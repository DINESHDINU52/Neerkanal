import { Entity, Index } from 'typeorm';
import { Base, S, B } from './base.entity';

@Entity()
export class Notification extends Base {
  @Index()
  @S()
  userId: string;

  @S() title: string;
  @S({ type: 'text' }) body: string;
  @S() type: string;
  @S() link: string;
  @S() dedupe: string;
  @B() read: boolean;
}
