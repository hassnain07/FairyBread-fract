export type Teacher = {
  id: string;
  name: string;
  initials: string;
  subjects: string[];
  color: string;
};

export type Program = {
  id: string;
  name: string;
  description?: string;
  color?: string;
  is_active: boolean;
};

export type ClassSlot = {
  id: string;
  subject: string;
  program_id: string;
  teacher_id: string;
  teacher_name: string;
  teacher_color: string;
  day_of_week: number; // ISO 1–7
  start_time: string;
  duration_minutes: number;
  capacity: number;
  is_active: boolean;
  next_session_id?: string;
  next_session_at?: string;
  next_booked_count: number;
  price_cents?: number; // admin/teacher only
};

export type ClassSession = {
  id: string;
  class_id: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  booked_count: number;
  status: 'scheduled' | 'cancelled' | 'completed';
  spaces_left: number;
  subject: string;
  teacher_id: string;
  teacher_name: string;
  teacher_color: string;
  program_color: string;
};

export type ClassSlotInput = {
  subject?: string;
  program_id?: string;
  teacher_id?: string;
  day_of_week?: number;
  start_time?: string;
  duration_minutes?: number;
  capacity?: number;
  price_cents?: number;
};

// Legacy alias kept so pages that haven't been migrated yet still compile
export type ClassInstance = {
  id: string;
  teacher_id: string;
  subject: string;
  day_of_week: string;
  time: string;
  capacity: number;
  enrolled: number;
  price: number;
};
