/** LinkedIn-style company size buckets. */
export const EMPLOYEE_RANGE_OPTIONS = [
  '1',
  '2-10',
  '11-50',
  '51-200',
  '201-500',
  '501-1,000',
  '1,001-5,000',
  '5,001-10,000',
  '10,001+',
] as const;

export type EmployeeRange = (typeof EMPLOYEE_RANGE_OPTIONS)[number];