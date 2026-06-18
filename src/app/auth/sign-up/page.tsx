"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, Eye, EyeOff, ShieldCheck, Sparkles } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth.client";

const signUpSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter at least 2 characters.")
    .max(80, "Name must be 80 characters or fewer."),
  email: z.string().trim().email("Enter a valid email address."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .regex(/[A-Z]/, "Add at least one uppercase letter.")
    .regex(/[0-9]/, "Add at least one number."),
});

type SignUpValues = z.infer<typeof signUpSchema>;

const Page = () => {
  const router = useRouter();
  const { data: session, isPending: isSessionPending } = authClient.useSession();

  const {
    formState: { errors },
    handleSubmit,
    register,
    watch,
  } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    mode: "onTouched",
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
  });

  const password = watch("password");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (session) router.replace("/dashboard");
  }, [router, session]);

  const onSubmit = handleSubmit(async (values) => {
    setIsLoading(true);

    try {
      await authClient.signUp.email(
        {
          name: values.name,
          email: values.email,
          password: values.password,
          callbackURL: "/onboarding",
        },
        {
          onSuccess: () => {
            toast.success("Account created successfully.");
            router.push("/onboarding");
          },
          onError: (ctx) => {
            toast.error(ctx.error.message || "Unable to create account.");
          },
        },
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create account.");
    } finally {
      setIsLoading(false);
    }
  });

  const passwordRequirements = [
    { label: "8+ characters", met: password.length >= 8 },
    { label: "Uppercase letter", met: /[A-Z]/.test(password) },
    { label: "Number", met: /[0-9]/.test(password) },
  ];

  if (isSessionPending) {
    return (
      <Card className="border-white/10 bg-zinc-950/90 text-zinc-50 shadow-2xl">
        <CardContent className="py-10 text-center text-sm text-zinc-400">
          Checking your session...
        </CardContent>
      </Card>
    );
  }

  if (session) return null;

  return (
    <Card className="relative overflow-hidden border border-white/10 bg-zinc-950/90 text-zinc-50 shadow-2xl backdrop-blur">
      <div className="pointer-events-none absolute -left-10 -top-12 h-36 w-36 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-12 top-1/4 h-40 w-40 rounded-full bg-white/5 blur-3xl" />

      <CardHeader className="space-y-4 border-b border-white/10 bg-white/[0.02]">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300">
          <ShieldCheck className="size-3.5 text-emerald-400" />
          Secure account setup
        </div>
        <div className="space-y-2">
          <CardTitle className="text-2xl tracking-tight text-white">Create your account</CardTitle>
          <CardDescription className="text-zinc-400">
            Use your email to start with chat, memory, tasks, voice, and a quick onboarding wizard.
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent>
        <form className="space-y-4 pt-6" onSubmit={onSubmit} noValidate>
          <div className="space-y-2">
            <Label htmlFor="sign-up-name" className="text-zinc-200">
              Name
            </Label>
            <Input
              id="sign-up-name"
              placeholder="Your name"
              className="border-white/10 bg-white/5 text-white placeholder:text-zinc-500 focus-visible:border-white/20 focus-visible:ring-0"
              autoComplete="name"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "sign-up-name-error" : undefined}
              {...register("name")}
            />
            {errors.name ? (
              <p id="sign-up-name-error" className="text-xs text-amber-300">
                {errors.name.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="sign-up-email" className="text-zinc-200">
              Email
            </Label>
            <Input
              id="sign-up-email"
              type="email"
              placeholder="you@example.com"
              className="border-white/10 bg-white/5 text-white placeholder:text-zinc-500 focus-visible:border-white/20 focus-visible:ring-0"
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "sign-up-email-error" : undefined}
              {...register("email")}
            />
            {errors.email ? (
              <p id="sign-up-email-error" className="text-xs text-amber-300">
                {errors.email.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="sign-up-password" className="text-zinc-200">
              Password
            </Label>
            <div className="relative">
              <Input
                id="sign-up-password"
                type={showPassword ? "text" : "password"}
                placeholder="At least 8 characters"
                className="border-white/10 bg-white/5 pr-12 text-white placeholder:text-zinc-500 focus-visible:border-white/20 focus-visible:ring-0"
                autoComplete="new-password"
                aria-invalid={Boolean(errors.password)}
                aria-describedby={
                  errors.password
                    ? "sign-up-password-error sign-up-password-help"
                    : "sign-up-password-help"
                }
                {...register("password")}
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
            <div id="sign-up-password-help" className="grid gap-1 text-xs text-zinc-400 sm:grid-cols-3">
              {passwordRequirements.map((requirement) => (
                <span
                  key={requirement.label}
                  className={requirement.met ? "text-emerald-300" : "text-zinc-500"}
                >
                  {requirement.label}
                </span>
              ))}
            </div>
            {errors.password ? (
              <p id="sign-up-password-error" className="text-xs text-amber-300">
                {errors.password.message}
              </p>
            ) : null}
          </div>

          <Button type="submit" className="w-full bg-white text-zinc-950 hover:bg-zinc-100" disabled={isLoading}>
            {isLoading ? "Creating account..." : "Create account"}
          </Button>

          <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-zinc-400">
            After sign-up, you'll be guided to a simple wizard to set preferences, invite teammates, or create your first project/chat.
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-white/10 bg-white/5 p-2 text-center text-xs text-zinc-400">
              <Bot className="mx-auto mb-1 size-3.5 text-white" />
              AI chat
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-2 text-center text-xs text-zinc-400">
              <Sparkles className="mx-auto mb-1 size-3.5 text-white" />
              Memory
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-2 text-center text-xs text-zinc-400">
              <ShieldCheck className="mx-auto mb-1 size-3.5 text-emerald-400" />
              Secure
            </div>
          </div>
        </form>
      </CardContent>

      <CardFooter className="justify-center text-sm">
        <div className="space-y-2 text-center">
          <p className="text-zinc-400">
            Already have an account?{" "}
            <Link href="/auth/sign-in" className="text-zinc-100 underline underline-offset-4">
              Sign in
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
