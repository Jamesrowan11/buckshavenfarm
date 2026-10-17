import { MIN_PASSWORD, PASSWORD_MESSAGES, type PasswordResult } from "@/lib/password";

/** "Change password" card shared by the admin, employee and boarder account pages. */
export default function ChangePasswordForm({
  action,
  result,
}: {
  action: (formData: FormData) => Promise<void>;
  result?: PasswordResult;
}) {
  const message = result ? PASSWORD_MESSAGES[result] : undefined;
  return (
    <div className="card">
      <h2>Change password</h2>
      <form action={action}>
        <label className="fld">
          Current password
          <input type="password" name="current" autoComplete="current-password" required />
        </label>
        <label className="fld">
          New password (min {MIN_PASSWORD})
          <input type="password" name="next" autoComplete="new-password" minLength={MIN_PASSWORD} required />
        </label>
        <label className="fld">
          Repeat new password
          <input type="password" name="confirm" autoComplete="new-password" minLength={MIN_PASSWORD} required />
        </label>
        <button className="btn btn--gold">Change password</button>
        {message && <p className={message.ok ? "msg-ok" : "msg-err"}>{message.text}</p>}
      </form>
    </div>
  );
}
