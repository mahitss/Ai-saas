"use client";

import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Eye, EyeOff, Fingerprint, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

const GithubIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    {...props}
  >
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
  </svg>
);

const GoogleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    {...props}
  >
    <path d="M12.24 10.285V14.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.866-3.577-7.866-8s3.536-8 7.866-8c2.46 0 4.105 1.025 5.047 1.926l3.427-3.3c-2.2-2.05-5.047-3.3-8.474-3.3-6.63 0-12 5.37-12 12s5.37 12 12 12c6.92 0 11.52-4.87 11.52-11.72 0-.788-.085-1.39-.188-1.925H12.24z"/>
  </svg>
);
import { z } from "zod";

import { authClient } from "@/lib/auth.client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

const RESEND_COOLDOWN_SECONDS = 60;

const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

type SignInValues = z.infer<typeof signInSchema>;
type SocialProvider = "google" | "github";
type AuthStep = "credentials" | "two-factor";

type AuthResponse = {
  data?: { twoFactorRedirect?: boolean; url?: string } | null;
  error?: { message?: string } | null;
};
type PasskeySignIn = (input: {
  autoFill: boolean;
  email?: string;
}) => Promise<{ error?: { message?: string } | null } | undefined>;

const SOCIAL_PROVIDERS: { id: SocialProvider; label: string }[] = [
  { id: "google", label: "Continue with Google" },
  { id: "github", label: "Continue with GitHub" },
];

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
};

const getResetRedirectTo = () => {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return "/auth/reset-password";
  }
  return new URL("/auth/reset-password", appUrl).toString();
};

const Page = () => {
  const router = useRouter();
  const { data: session, isPending: isSessionPending } = authClient.useSession();

  const {
    formState: { errors },
    handleSubmit,
    register,
    watch,
  } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    mode: "onTouched",
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const email = watch("email");
  const password = watch("password");

  const [authStep, setAuthStep] = useState<AuthStep>("credentials");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [isSignInLoading, setIsSignInLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<SocialProvider | null>(null);
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);
  const [isTwoFactorLoading, setIsTwoFactorLoading] = useState(false);
  const [isBackupCodeLoading, setIsBackupCodeLoading] = useState(false);
  const [isVerificationEmailLoading, setIsVerificationEmailLoading] = useState(false);
  const [isPasswordResetLoading, setIsPasswordResetLoading] = useState(false);
  const [verificationCooldown, setVerificationCooldown] = useState(0);
  const [passwordResetCooldown, setPasswordResetCooldown] = useState(0);
  const [passkeyAutofillStarted, setPasskeyAutofillStarted] = useState(false);

  const passwordScore = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;

  const passwordStrength = password.length === 0 ? 0 : Math.round((passwordScore / 4) * 100);
  const passwordStrengthLabel =
    passwordStrength < 40 ? "Weak" : passwordStrength < 80 ? "Good" : "Strong";
  const passwordStrengthColor =
    passwordStrength < 40
      ? "text-orange-600"
      : passwordStrength < 80
        ? "text-amber-600"
        : "text-emerald-600";

  const emailErrorId = errors.email ? "sign-in-email-error" : undefined;
  const passwordRegistration = register("password");
  const passwordErrorId = useMemo(() => {
    const ids = [];
    if (errors.password) ids.push("sign-in-password-error");
    if (capsLockOn) ids.push("sign-in-password-caps");
    return ids.length > 0 ? ids.join(" ") : undefined;
  }, [capsLockOn, errors.password]);

  useEffect(() => {
    if (session) {
      router.replace("/dashboard");
    }
  }, [router, session]);

  useEffect(() => {
    if (verificationCooldown <= 0 && passwordResetCooldown <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setVerificationCooldown((value) => Math.max(0, value - 1));
      setPasswordResetCooldown((value) => Math.max(0, value - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [passwordResetCooldown, verificationCooldown]);

  const onSubmit = handleSubmit(async (values) => {
    setIsSignInLoading(true);

    try {
      const response = (await authClient.signIn.email({
        email: values.email,
        password: values.password,
        callbackURL: "/dashboard",
      })) as AuthResponse;

      if (response?.data?.twoFactorRedirect) {
        setAuthStep("two-factor");
        toast.message("Enter your two-factor code to finish signing in.");
        return;
      }

      if (response?.error) {
        toast.error(response.error.message || "Unable to sign in.");
        return;
      }

      toast.success("Signed in successfully.");
      router.push("/dashboard");
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to sign in."));
    } finally {
      setIsSignInLoading(false);
    }
  });

  async function signInWithSocial(provider: SocialProvider) {
    setSocialLoading(provider);

    try {
      const response = await authClient.$fetch("/sign-in/social", {
        method: "POST",
        body: {
          provider,
          callbackURL: "/dashboard",
          requestSignUp: true,
          disableRedirect: true,
        },
      });
      const payload = (response as { url?: string; redirect?: boolean }) ?? {};
      if (payload.url) {
        window.location.assign(payload.url);
        return;
      }
      toast.success("Social sign-in started.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to start social sign-in."));
    } finally {
      setSocialLoading(null);
    }
  }

  async function signInWithPasskey() {
    setIsPasskeyLoading(true);

    try {
      const passkeySignIn = (authClient.signIn as unknown as { passkey: PasskeySignIn }).passkey;
      const response = await passkeySignIn({ autoFill: true, email });
      if (response?.error) {
        toast.error(response.error.message || "Unable to use passkey.");
        return;
      }
      toast.success("Passkey prompt opened.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to use passkey."));
    } finally {
      setIsPasskeyLoading(false);
    }
  }

  async function startPasskeyAutofill() {
    if (passkeyAutofillStarted) return;
    setPasskeyAutofillStarted(true);

    try {
      const passkeySignIn = (authClient.signIn as unknown as { passkey: PasskeySignIn }).passkey;
      await passkeySignIn({ autoFill: true, email });
    } catch {
      setPasskeyAutofillStarted(false);
    }
  }

  async function sendVerificationEmail() {
    if (verificationCooldown > 0) return;
    setIsVerificationEmailLoading(true);

    try {
      const response = await fetch("/api/auth/send-verification-email", { method: "POST" });
      if (response.ok) {
        toast.success("Verification email sent.");
        setVerificationCooldown(RESEND_COOLDOWN_SECONDS);
        return;
      }
      toast.error("Unable to resend verification email.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to resend verification email."));
    } finally {
      setIsVerificationEmailLoading(false);
    }
  }

  async function requestPasswordReset() {
    if (!email.trim() || passwordResetCooldown > 0) return;
    setIsPasswordResetLoading(true);

    try {
      const response = await fetch("/api/auth/forget-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), redirectTo: getResetRedirectTo() }),
      });
      if (response.ok) {
        toast.success("Password reset email sent.");
        setPasswordResetCooldown(RESEND_COOLDOWN_SECONDS);
        return;
      }
      toast.error("Unable to request reset.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to request reset."));
    } finally {
      setIsPasswordResetLoading(false);
    }
  }

  async function verifyTwoFactor() {
    if (!twoFactorCode.trim()) return;
    setIsTwoFactorLoading(true);

    try {
      const response = (await authClient.$fetch("/two-factor/verify-otp", {
        method: "POST",
        body: { code: twoFactorCode.trim(), trustDevice: rememberMe },
      })) as AuthResponse;

      if (response?.error) {
        toast.error(response.error.message || "Invalid two-factor code.");
        return;
      }

      toast.success("Two-factor verified.");
      router.push("/dashboard");
    } catch (error) {
      toast.error(getErrorMessage(error, "Invalid two-factor code."));
    } finally {
      setIsTwoFactorLoading(false);
    }
  }

  async function verifyBackupCode() {
    if (!backupCode.trim()) return;
    setIsBackupCodeLoading(true);

    try {
      const response = (await authClient.$fetch("/two-factor/verify-backup-code", {
        method: "POST",
        body: { code: backupCode.trim(), trustDevice: rememberMe },
      })) as AuthResponse;

      if (response?.error) {
        toast.error(response.error.message || "Invalid backup code.");
        return;
      }

      toast.success("Backup code accepted.");
      router.push("/dashboard");
    } catch (error) {
      toast.error(getErrorMessage(error, "Invalid backup code."));
    } finally {
      setIsBackupCodeLoading(false);
    }
  }

  if (isSessionPending) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Checking your session...
        </CardContent>
      </Card>
    );
  }

  if (session) {
    return null;
  }

  return (
    <Card className="group relative overflow-hidden border border-white/10 bg-zinc-950/90 text-zinc-50 shadow-2xl backdrop-blur transition-transform duration-300 hover:-translate-y-0.5">
      <div className="pointer-events-none absolute -left-12 -top-16 h-40 w-40 rounded-full bg-white/10 blur-3xl transition-transform duration-500 group-hover:scale-110" />
      <div className="pointer-events-none absolute -right-16 top-1/3 h-52 w-52 rounded-full bg-white/5 blur-3xl transition-transform duration-500 group-hover:scale-110" />

      <CardHeader className="space-y-4 border-b border-white/10 bg-white/[0.02]">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300">
          <ShieldCheck className="size-3.5 text-emerald-400" />
          Secure sign in
        </div>
        <div className="space-y-2">
          <CardTitle className="text-2xl tracking-tight text-white">
            {authStep === "two-factor" ? "Verify it is you" : "Welcome back"}
          </CardTitle>
          <CardDescription className="text-zinc-400">
            {authStep === "two-factor"
              ? "Enter your authenticator code or use a backup code to finish signing in."
              : "Sign in to continue chats, memory, tasks, and voice workflows."}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent>
        {authStep === "two-factor" ? (
          <div className="space-y-5 pt-6">
            <div className="space-y-2">
              <Label htmlFor="sign-in-2fa" className="text-zinc-200">Authenticator code</Label>
              <Input
                id="sign-in-2fa"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={twoFactorCode}
                onChange={(event) => setTwoFactorCode(event.target.value)}
                className="border-white/10 bg-white/5 text-white placeholder:text-zinc-500 focus-visible:border-white/20 focus-visible:ring-0"
              />
            </div>

            <Button
              type="button"
              className="w-full bg-white text-zinc-950 shadow-md transition-transform duration-200 hover:scale-[1.01] hover:bg-zinc-100"
              onClick={verifyTwoFactor}
              disabled={isTwoFactorLoading || !twoFactorCode.trim()}
            >
              {isTwoFactorLoading ? "Verifying..." : "Verify 2FA"}
            </Button>

            <div className="space-y-2 border-t border-white/10 pt-5">
              <Label htmlFor="sign-in-backup" className="text-zinc-200">Backup code</Label>
              <Input
                id="sign-in-backup"
                autoComplete="one-time-code"
                placeholder="ABCDE-FGHIJ"
                value={backupCode}
                onChange={(event) => setBackupCode(event.target.value)}
                className="border-white/10 bg-white/5 text-white placeholder:text-zinc-500 focus-visible:border-white/20 focus-visible:ring-0"
              />
              <Button
                type="button"
                variant="outline"
                className="w-full border-white/10 bg-zinc-950 text-zinc-100 hover:bg-zinc-900"
                onClick={verifyBackupCode}
                disabled={isBackupCodeLoading || !backupCode.trim()}
              >
                {isBackupCodeLoading ? "Checking..." : "Use backup code"}
              </Button>
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
                <Checkbox
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked === true)}
                />
                Remember this device
              </label>
              <Button
                type="button"
                variant="ghost"
                className="h-auto px-0 text-xs text-zinc-400 hover:bg-transparent hover:text-white"
                onClick={() => setAuthStep("credentials")}
              >
                Use another account
              </Button>
            </div>
          </div>
        ) : (
          <form className="space-y-5 pt-6" onSubmit={onSubmit} noValidate>
            <div className="space-y-2">
              <Label htmlFor="sign-in-email" className="text-zinc-200">Email</Label>
              <Input
                id="sign-in-email"
                type="email"
                placeholder="you@example.com"
                className="border-white/10 bg-white/5 text-white placeholder:text-zinc-500 focus-visible:border-white/20 focus-visible:ring-0"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={emailErrorId}
                {...register("email")}
                onFocus={() => void startPasskeyAutofill()}
              />
              {errors.email ? (
                <p id="sign-in-email-error" className="text-xs text-amber-300">
                  {errors.email.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="sign-in-password" className="text-zinc-200">Password</Label>
              <div className="relative">
                <Input
                  id="sign-in-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="********"
                  className="border-white/10 bg-white/5 pr-12 text-white placeholder:text-zinc-500 focus-visible:border-white/20 focus-visible:ring-0"
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={passwordErrorId}
                  {...passwordRegistration}
                  onChange={(event) => {
                    void passwordRegistration.onChange(event);
                  }}
                  onKeyUp={(event) => {
                    setCapsLockOn(event.getModifierState("CapsLock"));
                  }}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 transition-colors hover:text-white"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">Password strength</span>
                  <span className={passwordStrengthColor}>{passwordStrengthLabel}</span>
                </div>
                <Progress value={passwordStrength} />
              </div>
              {errors.password ? (
                <p id="sign-in-password-error" className="text-xs text-amber-300">
                  {errors.password.message}
                </p>
              ) : null}
              {capsLockOn ? (
                <p id="sign-in-password-caps" className="text-xs text-amber-300">
                  Caps Lock appears to be on.
                </p>
              ) : null}
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {SOCIAL_PROVIDERS.map((provider) => (
                  <Button
                    key={provider.id}
                    type="button"
                    variant="outline"
                    className="justify-between border-white/10 bg-zinc-950 text-zinc-100 hover:bg-zinc-900"
                    onClick={() => signInWithSocial(provider.id)}
                    disabled={socialLoading !== null}
                  >
                    <span className="inline-flex items-center gap-2">
                      {provider.id === "github" ? (
                        <GithubIcon className="size-4" />
                      ) : (
                        <GoogleIcon className="size-4" />
                      )}
                      {provider.label}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {socialLoading === provider.id ? "Opening..." : "OAuth"}
                    </span>
                  </Button>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="outline"
                  className="justify-between border-white/10 bg-zinc-950 text-zinc-100 hover:bg-zinc-900"
                  onClick={signInWithPasskey}
                  disabled={isPasskeyLoading}
                >
                  <span className="inline-flex items-center gap-2">
                    <Fingerprint className="size-4" />
                    Biometric / passkey
                  </span>
                  <span className="text-xs text-zinc-400">
                    {isPasskeyLoading ? "Opening..." : "Fast login"}
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="justify-between border-white/10 bg-zinc-950 text-zinc-100 hover:bg-zinc-900"
                  onClick={requestPasswordReset}
                  disabled={!email.trim() || isPasswordResetLoading || passwordResetCooldown > 0}
                >
                  <span className="inline-flex items-center gap-2">
                    <KeyRound className="size-4" />
                    Forgot password
                  </span>
                  <span className="text-xs text-zinc-400">
                    {isPasswordResetLoading
                      ? "Sending..."
                      : passwordResetCooldown > 0
                        ? `${passwordResetCooldown}s`
                        : "Reset link"}
                  </span>
                </Button>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="mt-2 w-full text-zinc-400 hover:text-white"
                onClick={sendVerificationEmail}
                disabled={isVerificationEmailLoading || verificationCooldown > 0}
              >
                <ShieldCheck className="mr-2 size-4" />
                {isVerificationEmailLoading
                  ? "Sending verification..."
                  : verificationCooldown > 0
                    ? `Resend verification email in ${verificationCooldown}s`
                    : "Resend verification email"}
              </Button>
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
                <Checkbox
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked === true)}
                />
                Remember this device
              </label>
              <span className="text-xs text-muted-foreground">Secure, encrypted access</span>
            </div>

            <Button
              type="submit"
              className="w-full bg-white text-zinc-950 shadow-md transition-transform duration-200 hover:scale-[1.01] hover:bg-zinc-100"
              disabled={isSignInLoading}
            >
              {isSignInLoading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        )}
      </CardContent>

      <CardFooter className="justify-center text-sm">
        <div className="space-y-2 text-center">
          <p className="text-zinc-400 transition-colors hover:text-zinc-200">
            New here?{" "}
            <Link
              href="/auth/sign-up"
              className="text-zinc-100 underline decoration-white/40 underline-offset-4"
            >
              Create an account
            </Link>
          </p>
          <p className="text-xs text-zinc-500">
            Want to explore first?{" "}
            <Link href="/" className="text-zinc-100 underline underline-offset-4">
              Go to home
            </Link>
          </p>
        </div>
      </CardFooter>
    </Card>
  );
};

export default Page;
