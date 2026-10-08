export type Teacher = {
  id: string;
  name: string;
  initials: string;
  subjects: string[];
  color: string;
};

export type ClassInstance = {
  id: string;
  teacher_id: string;
  subject: string;
  day_of_week: string;
  time: string;
  capacity: number;
  enrolled: number;
  // TODO: confirm with client — teacher-set price is treated as internal/admin-facing only.
  // Booking a class always costs 1 credit regardless of price.
  // Only surface to admin/teacher views and individual class purchase flow.
  price: number;
};
