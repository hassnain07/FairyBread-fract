export type Family = {
  id: string;
  reference_code: string;
  parent_name: string;
  email?: string;
  phone?: string;
  children?: Child[];
};

export type Child = {
  id: string;
  family_id: string;
  name: string;
  initials: string;
  givenName: string;
  familyName: string;
  preferredName?: string;
  year: string;
  school: string;
  enrolled: boolean;
  concern?: string;
  subjects?: string[];
  preferredDays?: string[];
  goals?: string;
  notes?: string;
  preferredTutor?: string;
  sessions?: string;
};

export type NewChild = { givenName: string; familyName: string; year: string; school?: string };
export type ChildPatch = Partial<Pick<Child, 'givenName' | 'familyName' | 'preferredName' | 'year' | 'school' | 'concern' | 'subjects' | 'preferredDays' | 'goals' | 'notes'>>;

export type EnrolmentInput = {
  child: {
    given_name: string;
    family_name?: string;
    preferred_name?: string;
    year_level?: string;
    school?: string;
    concern?: string;
    goals?: string;
    notes?: string;
    subjects?: string[];
    preferred_days?: string[];
  };
  parent: {
    given_name?: string;
    family_name?: string;
    relationship?: string;
    address?: string;
    phone1?: string;
    phone2?: string;
    emergency_name?: string;
    emergency_relationship?: string;
    emergency_phone?: string;
  };
  referral: string;
  signature: string;
  agreed_terms: boolean;
  agreed_privacy: boolean;
  agreed_trampoline: boolean;
};
