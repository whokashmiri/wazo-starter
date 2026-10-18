
import { useState, type FormEvent } from "react";
import {
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

import AuthLayout from "../../../layouts/AuthLayout";
import { getApiErrorMessage } from "../../../api/client";
import { authApi } from "../api/auth.api";

interface LoginLocationState {
  registered?: boolean;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const routeState = location.state as
    | LoginLocationState
    | null;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const loginMutation = useMutation({
    mutationFn: authApi.login,

    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["auth", "me"],
      });

      navigate("/dashboard", {
        replace: true,
        state: null,
      });
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loginMutation.isPending) return;

    loginMutation.mutate({
      email: email.trim(),
      password,
    });
  }

  return (
    <AuthLayout>
      <div className="mb-8">
        <span className="mb-4 inline-block rounded-full bg-cream px-3 py-1.5 text-xs font-semibold text-primary">
          SECURE SIGN IN
        </span>

        <h1 className="text-3xl font-bold tracking-tight text-primary sm:text-4xl">
          Welcome back
        </h1>

        <p className="mt-3 leading-7 text-muted-foreground">
          Sign in to manage your contact center.
        </p>
      </div>

      {routeState?.registered && (
        <div
          role="status"
          className="mb-6 flex gap-3 rounded-xl border border-success/20 bg-success-background p-4 text-sm text-success"
        >
          <CheckCircle2 size={20} className="shrink-0" />
          <p>
            Your account was created. You can sign in with
            your email and password. Company setup will
            require approval.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <label
            htmlFor="login-email"
            className="text-sm font-semibold text-primary"
          >
            Email address
          </label>

          <div className="relative">
            <Mail
              size={19}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
            />

            <input
              id="login-email"
              type="email"
              required
              autoComplete="username"
              maxLength={254}
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
              placeholder="you@company.com"
              className="auth-input"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="login-password"
            className="text-sm font-semibold text-primary"
          >
            Password
          </label>

          <div className="relative">
            <LockKeyhole
              size={19}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
            />

            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              placeholder="Enter your password"
              className="auth-input"
            />

            <button
              type="button"
              aria-label={
                showPassword
                  ? "Hide password"
                  : "Show password"
              }
              aria-pressed={showPassword}
              onClick={() =>
                setShowPassword((previous) => !previous)
              }
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted hover:text-primary"
            >
              {showPassword ? (
                <EyeOff size={19} />
              ) : (
                <Eye size={19} />
              )}
            </button>
          </div>
        </div>

        {loginMutation.isError && (
          <div
            role="alert"
            className="rounded-xl border border-danger/20 bg-danger-background p-4 text-sm text-danger"
          >
            {getApiErrorMessage(loginMutation.error)}
          </div>
        )}

        <button
          type="submit"
          disabled={loginMutation.isPending}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
        >
          {loginMutation.isPending ? (
            <>
              <Loader2 size={19} className="animate-spin" />
              Signing in...
            </>
          ) : (
            <>
              Sign in
              <ArrowRight size={18} />
            </>
          )}
        </button>
      </form>

      <div className="mt-8 border-t border-border pt-6 text-center">
        <p className="text-sm text-muted-foreground">
          New to Contact Center Cloud?{" "}
          <Link
            to="/register"
            className="font-bold text-primary underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
