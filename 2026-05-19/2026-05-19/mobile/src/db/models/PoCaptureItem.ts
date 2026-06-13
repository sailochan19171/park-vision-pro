import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class PoCaptureItem extends Model {
  static table = 'po_capture_items';

  static associations = {
    po_captures: { type: 'belongs_to' as const, key: 'po_capture_id' },
  };

  @text('po_capture_id') poCaptureId!: string;
  @text('item_code') itemCode!: string;
  @text('item_name') itemName!: string | null;
  @field('quantity') quantity!: number;
  @field('price') price!: number;
  @text('uom') uom!: string;
}
