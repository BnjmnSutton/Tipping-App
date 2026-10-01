// app/auth/auth-code-error/page.js
export default function AuthCodeError() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <h1 className="text-2xl font-semibold">Sign-in link expired</h1>
      <p>That link is no longer valid. Please request a new one and try again.</p>
      <a href="/" className="text-blue-600 underline">Back to sign in</a>
    </div>
  );
}