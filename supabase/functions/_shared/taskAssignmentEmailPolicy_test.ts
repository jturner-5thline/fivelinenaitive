import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { shouldSkipTaskAssignmentEmail } from './taskAssignmentEmailPolicy.ts';

Deno.test('Scott Williams receives no managed or legacy task-assignment emails', () => {
  assertEquals(shouldSkipTaskAssignmentEmail('task-assigned', 'swilliams@5thline.co'), true);
  assertEquals(shouldSkipTaskAssignmentEmail('task_assigned', 'swilliams@5thline.co'), true);
});

Deno.test('address matching ignores case and surrounding whitespace', () => {
  assertEquals(shouldSkipTaskAssignmentEmail('task-assigned', ' SWilliams@5thline.co '), true);
});

Deno.test('other recipients retain task-assignment emails', () => {
  assertEquals(shouldSkipTaskAssignmentEmail('task-assigned', 'other@5thline.co'), false);
  assertEquals(shouldSkipTaskAssignmentEmail('task-assigned', 'swilliams@another.co'), false);
});

Deno.test('other email types remain unchanged for Scott Williams', () => {
  assertEquals(shouldSkipTaskAssignmentEmail('deal_updated', 'swilliams@5thline.co'), false);
  assertEquals(shouldSkipTaskAssignmentEmail('daily-briefing', 'swilliams@5thline.co'), false);
});