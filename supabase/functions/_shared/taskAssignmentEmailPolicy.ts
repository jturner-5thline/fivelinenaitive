/** Applies only to assignment emails, not tasks or in-app notifications. */
export function shouldSkipTaskAssignmentEmail(notificationType: string, recipient: string): boolean {
  return (notificationType === 'task-assigned' || notificationType === 'task_assigned')
    && recipient.trim().toLowerCase() === 'swilliams@5thline.co';
}