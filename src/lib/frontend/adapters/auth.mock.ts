import { demoAccounts, demoResetToken } from "../fixtures/auth";
import { passwordError, type AuthAdapter, type CurrentUser } from "../contracts/auth";
const sessionKey = "subwise.demo.user";
// In-memory demo credentials only. Never persist passwords or reset tokens.
const accounts = demoAccounts.map(account => ({ user: { ...account.user }, password: account.password }));
let resetConsumed = false;
export const mockAuthAdapter: AuthAdapter = {
 async login({ email, password }) {
  const account = accounts.find(a => a.user.email === email.trim().toLowerCase() && a.password === password);
  if (!account) throw new Error("Invalid demo email or password.");
  sessionStorage.setItem(sessionKey, account.user.id);
  return { ...account.user };
 },
 async register({ name, email, password }) {
  const error = passwordError(password); if (error) throw new Error(error);
  email = email.trim().toLowerCase();
  if (!name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a name and valid email address.");
  if (accounts.some(a => a.user.email === email)) throw new Error("Email is already registered in this demo.");
  const id = crypto.randomUUID();
  const user: CurrentUser = { id, name: name.trim(), email, role: "CUSTOMER", customerId: `demo-${id}` };
  accounts.push({ user, password });
  const { customerId: _customerId, ...registered } = user; void _customerId;
  return { user: registered };
 },
 async logout() { sessionStorage.removeItem(sessionKey); },
 async currentUser() {
  const id = sessionStorage.getItem(sessionKey);
  return accounts.find(a => a.user.id === id)?.user ?? null;
 },
 async requestPasswordReset() { return { message: "Demo request acknowledged. No email was sent. Use the sample reset link below." }; },
 async resetPassword({ token, newPassword }) {
  if (token !== demoResetToken || resetConsumed) throw new Error("This demo reset link is invalid or already used. Reload to restart the demo.");
  const error = passwordError(newPassword); if (error) throw new Error(error);
  accounts[2].password = newPassword; resetConsumed = true;
  sessionStorage.removeItem(sessionKey);
  return { message: "Demo customer password changed for this page session. Sign in as customer@subwise.demo." };
 }
};
