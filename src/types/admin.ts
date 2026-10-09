export type AdminStats = {
  active_students: number;
  upcoming_assessments: number;
  classes_today: number;
  pending_payments: number;
  reports_due: number;
};

export type Closure = {
  id: string;
  date: string;   // YYYY-MM-DD
  label: string;
};
