export type Role = "ADMIN" | "STAFF" | "CUSTOMER";
export interface CurrentUser { id: string; name: string; email: string; role: Role; customerId: string | null }
export interface LoginInput { email: string; password: string }
export interface RegisterInput extends LoginInput { name: string }
export type RegisteredUser = Omit<CurrentUser, "customerId">;
export interface PasswordResetRequest { email: string; redirectTo: string }
export interface PasswordResetInput { token: string; newPassword: string }
// Backend auth endpoints have different envelopes; adapters normalize them here.
export interface AuthAdapter {
  login(input: LoginInput): Promise<CurrentUser>;
  register(input: RegisterInput): Promise<{ user: RegisteredUser }>;
  logout(): Promise<void>;
  currentUser(): Promise<CurrentUser | null>;
  requestPasswordReset(input: PasswordResetRequest): Promise<{ message: string }>;
  resetPassword(input: PasswordResetInput): Promise<{ message: string }>;
}
export function passwordError(password: string): string | null {
  return password.length < 9 || password.length > 128 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[^A-Za-z0-9\s]/.test(password) ? "Use 9–128 characters, including uppercase, lowercase, and a special character." : null;
}
export const rolePath = (role: Role) => `/${role.toLowerCase()}`;
