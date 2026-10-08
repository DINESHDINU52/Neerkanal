import { Entity } from 'typeorm';
import { Base, S, J } from './base.entity';

@Entity()
export class Company extends Base {
  @S() name: string;
  @S() state: string;
  @S() country: string;
  @S() deviceKey: string;
  @S({ default: 'FREE' }) atsPlan: string;
  @J() modules: string[];
  @J() settings: any;
}
