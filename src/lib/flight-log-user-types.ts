export const flightLogUserRoles = ["user", "moderator", "admin"] as const;
export const flightLogUserStatuses = ["active", "pending_verification", "banned"] as const;

export type FlightLogUserRole = (typeof flightLogUserRoles)[number];
export type FlightLogUserStatus = (typeof flightLogUserStatuses)[number];

export type ManagedFlightLogUser = {
  id: number;
  callsign: string;
  displayName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  bio: string;
  avatarUrl: string;
  role: FlightLogUserRole;
  status: FlightLogUserStatus;
  emailVerified: boolean;
  joinedAt: string;
  lastLoginAt: string;
  updatedAt: string;
  postCount: number;
  commentCount: number;
  checkInCount: number;
  friendCount: number;
};

export type ManagedFlightLogUserInput = {
  id: number;
  callsign: string;
  displayName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  bio?: string;
  role: FlightLogUserRole;
  status: FlightLogUserStatus;
  emailVerified: boolean;
};
