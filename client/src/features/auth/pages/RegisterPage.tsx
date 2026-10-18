
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import {
  UserRound,
  Mail,
  LockKeyhole,
  Eye,
  EyeOff,
  Loader2,
  ArrowRight,
} from "lucide-react";

import AuthLayout from "../../../layouts/AuthLayout";
import { getApiErrorMessage } from "../../../api/client";
import { authApi } from "../api/auth.api";

export default function RegisterPage() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] =
    useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] =
    useState("");

  const registerMutation = useMutation({
    mutationFn: authApi.register,

    onSuccess: () => {
      navigate("/login", {
        replace: true,
        state: { registered: true },
      });
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError("");

    if (registerMutation.isPending) return;

    if (name.trim().length < 2) {
      setValidationError(
        "Your name must contain at least 2 characters."
      );
      return;
    }

    if (password.length < 12 || password.length > 128) {
      setValidationError(
        "Password must contain between 12 and 128 characters."
      );
      return;
    }

    if (password !== confirmPassword) {
      setValidationError("Passwords do not match.");
      return;
    }

    registerMutation.mutate({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
    });
  }

  return (
    <AuthLayout>
      <div className="mb-8">
        <span className="mb-4 inline-block rounded-full bg-cream px-3 py-1.5 text-xs font-semibold text-primary">
          GET STARTED
        </span>

        <h1 className="text-3xl font-bold tracking-tight text-primary sm:text-4xl">
          Create your account
        </h1>

        <p className="mt-3 leading-7 text-muted-foreground">
          Register to begin setting up your company's
          contact center.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label
            htmlFor="register-name"
            className="text-sm font-semibold text-primary"
          >
            Full name
          </label>

          <div className="relative">
            <UserRound
              size={19}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
            />

            <input
              id="register-name"
              className="auth-input"
              type="text"
              required
              minLength={2}
              maxLength={100}
              autoComplete="name"
              placeholder="Your full name"
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
            />
          </div>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="register-email"
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
              id="register-email"
              className="auth-input"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
            />
          </div>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="register-password"
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
              id="register-password"
              className="auth-input"
              type={showPassword ? "text" : "password"}
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              placeholder="At least 12 characters"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
            />

            <button
              type="button"
              aria-label={
                showPassword
                  ? "Hide passwords"
                  : "Show passwords"
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

        <div className="space-y-2">
          <label
            htmlFor="register-confirm-password"
            className="text-sm font-semibold text-primary"
          >
            Confirm password
          </label>

          <div className="relative">
            <LockKeyhole
              size={19}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
            />

            <input
              id="register-confirm-password"
              className="auth-input"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="new-password"
              placeholder="Repeat your password"
              value={confirmPassword}
              onChange={(event) =>
                setConfirmPassword(event.target.value)
              }
            />
          </div>
        </div>

        {(validationError || registerMutation.isError) && (
          <div
            role="alert"
            className="rounded-xl border border-danger/20 bg-danger-background p-4 text-sm text-danger"
          >
            {validationError ||
              getApiErrorMessage(registerMutation.error)}
          </div>
        )}

        <button
          type="submit"
          disabled={registerMutation.isPending}
          className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
        >
          {registerMutation.isPending ? (
            <>
              <Loader2 size={19} className="animate-spin" />
              Creating account...
            </>
          ) : (
            <>
              Create account
              <ArrowRight size={18} />
            </>
          )}
        </button>

        <p className="text-center text-xs leading-5 text-muted-foreground">
          Company activation is subject to platform approval.
        </p>
      </form>

      <div className="mt-7 border-t border-border pt-6 text-center">
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-bold text-primary underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
