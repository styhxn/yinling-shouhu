import type { Role } from "../../store/db.js";

export type SessionUser = {
  userId: string;
  role: Role;
  elderId?: string;
  exp: number;
};
