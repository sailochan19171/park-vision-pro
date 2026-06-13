import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export default class ApprovalRecord extends Model {
  static table = 'approval_records';
  @field('app_trx_id') appTrxId!: string;
  @field('request_type') requestType!: string;
  @field('reference_code') referenceCode!: string;
  @field('requester_code') requesterCode!: string;
  @field('approver_code') approverCode!: string;
  @field('amount') amount!: number;
  @field('status') status!: string;
  @field('notes') notes!: string;
  @field('resolved_at') resolvedAt!: number;
  @field('is_synced') isSynced!: boolean;
}
