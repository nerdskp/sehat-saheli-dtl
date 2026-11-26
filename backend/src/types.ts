export type CaseStatus = "Awaiting PHC" | "Received at PHC" | "Follow-up booked";

export type CareAction =
  | "Facility review needed"
  | "Routine follow-up"
  | "Need ANM guidance";

export interface CareCase {
  id: string;
  initials: string;
  name: string;
  ageLabel: string;
  ward: string;
  context: string;
  time: string;
  tone: "urgent" | "warm" | "blue" | "violet";
  tag: string;
  action?: CareAction;
  referralId?: string;
}

export interface Referral {
  id: string;
  caseId: string;
  facility: string;
  reason: string;
  sentAt: string;
  status: CaseStatus;
  acknowledgedAt?: string;
  followUpDate?: string;
}

export interface CareEvent {
  id: string;
  caseId: string;
  type: "concern" | "referral" | "acknowledgement" | "follow-up" | "action";
  text: string;
  timestamp: string;
}
