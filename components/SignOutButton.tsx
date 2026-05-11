export default function SignOutButton({ className = "" }: { className?: string }) {
  return (
    <form action="/logout" method="post">
      <button type="submit" className={`btn-secondary text-sm ${className}`}>
        Sign out
      </button>
    </form>
  );
}
