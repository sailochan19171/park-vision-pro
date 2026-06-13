import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class JourneyPlanCustomer extends Model {
  static table = 'journey_plan_customers';

  @text('customer_code') customerCode!: string;
  @text('route_code') routeCode!: string;
  @text('visit_day') visitDay!: string;
  @field('visit_sequence') visitSequence!: number | null;
  @text('frequency') frequency!: string | null;
}
