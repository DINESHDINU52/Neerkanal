import { Entity, Index } from 'typeorm';
import { Base, S, J } from './base.entity';

// Generic record store: KPI, PIP, COMPLAINT, POLICY, ACK, STRUCT, PAYRUN, TRIP, etc.
@Entity()
export class Rec extends Base {
  @Index()
  @S()
  companyId: string;

  @Index()
  @S()
  type: string;

  @S() ownerId: string;
  @S() refId: string;
  @S() key: string;
  @S() status: string;
  @J() data: any;
}
