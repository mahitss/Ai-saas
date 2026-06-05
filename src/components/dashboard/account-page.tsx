"use client";

import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, Fingerprint, Mail, KeyRound, LogOut, RefreshCw, UserCog, Copy, Eye } from "lucide-react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth.client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type Profile = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  bio: string;
  phoneNumber: string | null;
  phoneVerified: boolean;
  privacySettings: {
    profileVisibility?: "public" | "team" | "private";
    emailVisible?: boolean;
    notificationsEnabled?: boolean;
    securityQuestion?: string;
    securityAnswerHint?: string;
  };
  themeAccent: string;
  highContrast: boolean;
  emailVerified: boolean;
  onboardingCompleted: boolean;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type SessionItem = {
  id: string;
  token: string;
  userAgent: string | null;
  ipAddress: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

type PasskeyAdd = (input: {
  name: string;
  useAutoRegister: boolean;
}) => Promise<{ error?: { message?: string } | null } | undefined>;
type PasskeySignIn = (input: {
  autoFill: boolean;
  email?: string;
}) => Promise<{ error?: { message?: string } | null } | undefined>;

const SOCIAL_PROVIDERS = [
  { id: "google", label: "Google" },
  { id: "github", label: "GitHub" },
] as const;

export function AccountPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [socialBusy, setSocialBusy] = useState<string | null>(null);
  const [twoFactorPassword, setTwoFactorPassword] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [verificationState, setVerificationState] = useState("pending");
  const [passkeyLabel, setPasskeyLabel] = useState("MacBook Pro");
  const [totpPassword, setTotpPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [securityQuestion, setSecurityQuestion] = useState("");
  const [securityAnswerHint, setSecurityAnswerHint] = useState("");

  const completion = useMemo(() => {
    if (!profile) return 0;
    return [
      profile.emailVerified,
      profile.phoneVerified,
      profile.onboardingCompleted,
      Boolean(profile.bio.trim()),
      Boolean(profile.image),
    ].filter(Boolean).length;
  }, [profile]);

  function copyToClipboard(text: string, label = "Copied") {
    navigator.clipboard.writeText(text).then(() => toast.success(label));
  }

  async function exportData() {
    const res = await fetch("/api/exports/generate", { method: "POST" });
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `account-export-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Data exported");
    } else {
      toast.error("Export failed");
    }
  }

  async function loadAccount() {
    setLoading(true);
    const [profileResponse, sessionsResponse] = await Promise.all([
      fetch("/api/account/profile", { cache: "no-store" }),
      fetch("/api/account/sessions", { cache: "no-store" }),
    ]);
    if (profileResponse.ok) {
      const payload = (await profileResponse.json()) as { profile?: Profile };
      if (payload.profile) {
        setProfile(payload.profile);
        setResetEmail(payload.profile.email);
        setVerificationState(payload.profile.emailVerified ? "verified" : "pending");
        setSecurityQuestion((payload.profile.privacySettings.securityQuestion as string | undefined) ?? "");
        setSecurityAnswerHint((payload.profile.privacySettings.securityAnswerHint as string | undefined) ?? "");
      }
    }
    if (sessionsResponse.ok) {
      const payload = (await sessionsResponse.json()) as { sessions?: SessionItem[] };
      setSessions(payload.sessions ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadAccount();
  }, []);

  async function saveProfile() {
    if (!profile) return;
    setSaving(true);
    const response = await fetch("/api/account/profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: profile.name,
          image: profile.image ?? "",
          bio: profile.bio,
          phoneNumber: profile.phoneNumber ?? "",
          privacySettings: {
            ...profile.privacySettings,
            securityQuestion,
            securityAnswerHint,
          },
          themeAccent: profile.themeAccent,
          highContrast: profile.highContrast,
          onboardingCompleted: profile.onboardingCompleted,
      }),
    });
    setSaving(false);
    if (!response.ok) {
      toast.error("Unable to save profile.");
      return;
    }
    const payload = (await response.json()) as { profile?: Profile };
    if (payload.profile) {
      setProfile(payload.profile);
      toast.success("Profile updated.");
    }
  }

  async function connectSocial(provider: (typeof SOCIAL_PROVIDERS)[number]["id"]) {
    setSocialBusy(provider);
    const response = await authClient.$fetch("/sign-in/social", {
      method: "POST",
      body: {
        provider,
        callbackURL: "/onboarding",
        requestSignUp: true,
        disableRedirect: true,
      },
    });
    setSocialBusy(null);
    const payload = (response as { url?: string; redirect?: boolean }) ?? {};
    if (payload.url) {
      window.location.assign(payload.url);
      return;
    }
    toast.success(`${provider} connection started.`);
  }

  async function sendVerificationEmail() {
    const response = await fetch("/api/auth/send-verification-email", { method: "POST" });
    if (response.ok) {
      toast.success("Verification email sent.");
      setVerificationState("sent");
      return;
    }
    toast.error("Unable to send verification email.");
  }

  async function requestPasswordReset() {
    if (!resetEmail.trim()) return;
    const response = await fetch("/api/auth/forget-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: resetEmail.trim(),
        redirectTo: `${window.location.origin}/auth/reset-password`,
      }),
    });
    if (response.ok) {
      toast.success("Password reset email sent.");
      return;
    }
    toast.error("Unable to request reset.");
  }

  async function enableTwoFactor() {
    if (!totpPassword.trim()) return;
    const response = await fetch("/api/auth/two-factor/enable", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: totpPassword.trim(), issuer: "Logicra" }),
    });
    if (response.ok) {
      toast.success("Two-factor authentication enabled.");
      setTotpPassword("");
      return;
    }
    toast.error("Unable to enable 2FA.");
  }

  async function disableTwoFactor() {
    if (!totpPassword.trim()) return;
    const response = await fetch("/api/auth/two-factor/disable", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: totpPassword.trim() }),
    });
    if (response.ok) {
      toast.success("Two-factor authentication disabled.");
      setTotpPassword("");
      return;
    }
    toast.error("Unable to disable 2FA.");
  }

  async function createPasskey() {
    const addPasskey = (authClient as unknown as { passkey: { addPasskey: PasskeyAdd } }).passkey.addPasskey;
    const response = await addPasskey({
      name: passkeyLabel,
      useAutoRegister: true,
    });
    if (response?.error) {
      toast.error(response.error.message ?? "Unable to register passkey.");
      return;
    }
    toast.success("Passkey registered.");
  }

  async function signInWithPasskey() {
    const passkeySignIn = (authClient.signIn as unknown as { passkey: PasskeySignIn }).passkey;
    const response = await passkeySignIn({ autoFill: true, email: profile?.email });
    if (response?.error) {
      toast.error(response.error.message ?? "Unable to use passkey.");
      return;
    }
    toast.success("Passkey sign-in started.");
  }

  async function revokeSession(token: string) {
    const response = await fetch("/api/account/sessions", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (response.ok) {
      toast.success("Session revoked.");
      await loadAccount();
      return;
    }
    toast.error("Unable to revoke session.");
  }

  async function revokeOtherSessions() {
    const response = await fetch("/api/account/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ revokeOthers: true }),
    });
    if (response.ok) {
      toast.success("Other sessions revoked.");
      await loadAccount();
      return;
    }
    toast.error("Unable to revoke sessions.");
  }

  async function resetPassword() {
    if (!newPassword.trim()) return;
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        newPassword: newPassword.trim(),
        token: resetToken.trim() || undefined,
      }),
    });
    if (response.ok) {
      toast.success("Password reset complete.");
      setNewPassword("");
      setResetToken("");
      return;
    }
    toast.error("Unable to reset password.");
  }

  return (
    <main className="min-h-svh bg-neutral-50 p-4 text-zinc-950 md:p-6">
      <div className="mx-auto grid w-full max-w-7xl gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <Card className="border-zinc-200 bg-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCog className="size-5" />
              Account
            </CardTitle>
            <CardDescription>Profile customization, verification, passkeys, 2FA, and live session controls.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? <p className="text-sm text-zinc-500">Loading account settings...</p> : null}
            {profile ? (
              <>
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <div className="flex items-center justify-between text-xs text-zinc-500">
                    <span>Profile strength</span>
                    <span>{completion}/5 • {Math.round((completion / 5) * 100)}%</span>
                  </div>
                  <Progress value={(completion / 5) * 100} className="mt-2 h-2" />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                   <div className="space-y-2">
                     <Label htmlFor="profile-name">Display name</Label>
                     <Input id="profile-name" value={profile.name} onChange={(event) => setProfile((current) => current ? { ...current, name: event.target.value } : current)} />
                   </div>
                   <div className="space-y-2">
                     <Label htmlFor="profile-email">Email</Label>
                     <div className="flex gap-2">
                       <Input id="profile-email" value={profile.email} disabled className="flex-1" />
                       <Button type="button" size="icon" variant="outline" onClick={() => copyToClipboard(profile.email, "Email copied")} title="Copy email">
                         <Copy className="size-4" />
                       </Button>
                     </div>
                   </div>
                 </div>
                 <div className="flex items-center gap-2 text-xs text-zinc-500">
                   <span>User ID: {profile.id}</span>
                   <Button type="button" size="sm" variant="ghost" onClick={() => copyToClipboard(profile.id, "User ID copied")} title="Copy ID">
                     <Copy className="size-3" />
                   </Button>
                 </div>
                <div className="grid gap-4 md:grid-cols-2">
                   <div className="space-y-2">
                     <Label htmlFor="profile-image">Avatar URL</Label>
                     <Input id="profile-image" value={profile.image ?? ""} onChange={(event) => setProfile((current) => current ? { ...current, image: event.target.value || null } : current)} />
                     <div className="flex items-center gap-3 pt-1">
                       <Avatar className="size-10 border">
                         <AvatarImage src={profile.image || undefined} alt="Avatar preview" />
                         <AvatarFallback>{profile.name?.[0]?.toUpperCase() ?? "U"}</AvatarFallback>
                       </Avatar>
                       <span className="text-xs text-zinc-500">Live preview</span>
                     </div>
                   </div>
                  <div className="space-y-2">
                    <Label htmlFor="profile-phone">Phone number</Label>
                    <Input id="profile-phone" value={profile.phoneNumber ?? ""} onChange={(event) => setProfile((current) => current ? { ...current, phoneNumber: event.target.value || null } : current)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-bio">Bio</Label>
                  <Textarea id="profile-bio" value={profile.bio} onChange={(event) => setProfile((current) => current ? { ...current, bio: event.target.value } : current)} />
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="profile-visibility">Visibility</Label>
                    <select
                      id="profile-visibility"
                      className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm"
                      value={profile.privacySettings.profileVisibility ?? "team"}
                      onChange={(event) =>
                        setProfile((current) =>
                          current
                            ? {
                                ...current,
                                privacySettings: { ...current.privacySettings, profileVisibility: event.target.value as Profile["privacySettings"]["profileVisibility"] },
                              }
                            : current,
                        )
                      }
                    >
                      <option value="public">Public</option>
                      <option value="team">Team</option>
                      <option value="private">Private</option>
                    </select>
                  </div>
                   <div className="space-y-2">
                     <Label htmlFor="profile-accent">Accent color</Label>
                     <div className="flex items-center gap-2">
                       <Input id="profile-accent" type="color" value={profile.themeAccent} onChange={(event) => setProfile((current) => current ? { ...current, themeAccent: event.target.value } : current)} className="w-16 p-1" />
                       <div className="size-8 rounded-md border border-zinc-300" style={{ backgroundColor: profile.themeAccent }} title="Live accent preview" />
                       <span className="text-xs text-zinc-500">Live preview</span>
                     </div>
                   </div>
                  <div className="flex items-end gap-3 rounded-xl border border-zinc-200 p-3">
                    <div className="space-y-1">
                      <p className="text-xs uppercase tracking-wide text-zinc-500">High contrast</p>
                      <p className="text-sm text-zinc-600">Accessibility mode.</p>
                    </div>
                    <Switch checked={profile.highContrast} onCheckedChange={(checked) => setProfile((current) => current ? { ...current, highContrast: checked } : current)} />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="security-question">Security question</Label>
                    <Input id="security-question" value={securityQuestion} onChange={(event) => setSecurityQuestion(event.target.value)} placeholder="What is your preferred workspace name?" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="security-hint">Answer hint</Label>
                    <Input id="security-hint" value={securityAnswerHint} onChange={(event) => setSecurityAnswerHint(event.target.value)} placeholder="Hint only, never the full answer" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" className="bg-zinc-950 text-white hover:bg-zinc-800" onClick={() => void saveProfile()} disabled={saving}>
                    {saving ? "Saving..." : "Save profile"}
                  </Button>
                  <Button type="button" variant="outline" className="border-zinc-200 bg-white text-zinc-700" onClick={() => setProfile((current) => current ? { ...current, onboardingCompleted: true } : current)}>
                    Mark onboarding complete
                  </Button>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                  <p>Email verification: {profile.emailVerified ? "verified" : verificationState}</p>
                  <p>Phone verification: {profile.phoneVerified ? "verified" : "pending"}</p>
                  <p>Onboarding: {profile.onboardingCompleted ? "complete" : "in progress"}</p>
                  <p>Failed sign-in attempts: {profile.failedLoginAttempts}</p>
                  {profile.lockedUntil ? <p>Locked until: {new Date(profile.lockedUntil).toLocaleString()}</p> : null}
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-zinc-200 bg-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="size-5" />
                Verification & reset
              </CardTitle>
              <CardDescription>Send verification emails, password resets, and security recovery links.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button type="button" className="w-full bg-zinc-950 text-white hover:bg-zinc-800" onClick={() => void sendVerificationEmail()}>
                Resend verification email
              </Button>
              <div className="space-y-2">
                <Input value={resetEmail} onChange={(event) => setResetEmail(event.target.value)} placeholder="Recovery email" />
                <Button type="button" variant="outline" className="w-full border-zinc-200 bg-white text-zinc-700" onClick={() => void requestPasswordReset()}>
                  Send password reset link
                </Button>
              </div>
              <div className="space-y-2">
                <Input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" placeholder="New password" />
                <Input value={resetToken} onChange={(event) => setResetToken(event.target.value)} placeholder="Reset token or leave blank if using the emailed link" />
                <Button type="button" variant="outline" className="w-full border-zinc-200 bg-white text-zinc-700" onClick={() => void resetPassword()}>
                  Complete password reset
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-zinc-200 bg-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-5" />
                2FA & passkeys
              </CardTitle>
              <CardDescription>Use TOTP, backup codes, and biometrics/passkeys on supported devices.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input value={twoFactorPassword} onChange={(event) => setTwoFactorPassword(event.target.value)} type="password" placeholder="Password to confirm 2FA" />
              <div className="flex flex-wrap gap-2">
                <Button type="button" className="bg-zinc-950 text-white hover:bg-zinc-800" onClick={() => void enableTwoFactor()}>
                  Enable 2FA
                </Button>
                <Button type="button" variant="outline" className="border-zinc-200 bg-white text-zinc-700" onClick={() => void disableTwoFactor()}>
                  Disable 2FA
                </Button>
              </div>
              <div className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                <Fingerprint className="size-5 text-zinc-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Biometric login</p>
                  <p className="text-xs text-zinc-500">Add a passkey to sign in with fingerprint or face ID.</p>
                </div>
                <Button type="button" variant="outline" className="border-zinc-200 bg-white text-zinc-700" onClick={() => void signInWithPasskey()}>
                  Use passkey
                </Button>
              </div>
              <div className="flex gap-2">
                <Input value={passkeyLabel} onChange={(event) => setPasskeyLabel(event.target.value)} placeholder="Passkey label" />
                <Button type="button" className="bg-zinc-950 text-white hover:bg-zinc-800" onClick={() => void createPasskey()}>
                  Add passkey
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-zinc-200 bg-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="size-5" />
                Active sessions
              </CardTitle>
              <CardDescription>Review open sessions and revoke access remotely.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="border-zinc-200 bg-white text-zinc-700" onClick={() => void loadAccount()}>
                  Refresh sessions
                </Button>
                <Button type="button" variant="outline" className="border-zinc-200 bg-white text-zinc-700" onClick={() => void revokeOtherSessions()}>
                  Log out other devices
                </Button>
              </div>
              <div className="space-y-2">
                {sessions.map((session) => (
                  <div key={session.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600">
                    <p className="font-medium text-zinc-900">{session.userAgent ?? "Unknown device"}</p>
                    <p>IP: {session.ipAddress ?? "n/a"}</p>
                    <p>Expires: {new Date(session.expiresAt).toLocaleString()}</p>
                    <div className="mt-2 flex justify-end">
                      <Button type="button" size="sm" variant="outline" className="border-zinc-200 bg-white text-zinc-700" onClick={() => void revokeSession(session.token)}>
                        <LogOut className="mr-2 size-4" />
                        Revoke
                      </Button>
                    </div>
                  </div>
                ))}
                {sessions.length === 0 ? <p className="text-sm text-zinc-500">No active sessions found.</p> : null}
              </div>
            </CardContent>
          </Card>

          <Card className="border-zinc-200 bg-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="size-5" />
                Social login
              </CardTitle>
              <CardDescription>Use Google, GitHub, or Microsoft to sign in faster.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {SOCIAL_PROVIDERS.map((provider) => (
                <Button
                  key={provider.id}
                  type="button"
                  variant="outline"
                  className="w-full justify-between border-zinc-200 bg-white text-zinc-700"
                  onClick={() => void connectSocial(provider.id)}
                  disabled={socialBusy === provider.id}
                >
                  <span>Connect {provider.label}</span>
                  <span className="text-xs text-zinc-400">{socialBusy === provider.id ? "Opening..." : "OAuth"}</span>
                </Button>
              ))}
            </CardContent>
          </Card>

          <Card className="border-zinc-200 bg-white">
            <CardHeader>
              <CardTitle>Onboarding</CardTitle>
              <CardDescription>Mark the post-sign-up wizard complete after the first win.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-zinc-600">
              <p>Completion progress: {completion}/5 steps</p>
               <p>Suggested first actions: create a project, start chat, invite the team, and connect an account.</p>
               <div className="grid gap-2 sm:grid-cols-2">
                 <Button type="button" className="w-full bg-zinc-950 text-white hover:bg-zinc-800" onClick={() => setProfile((current) => current ? { ...current, onboardingCompleted: true } : current)}>
                   Finish onboarding
                 </Button>
                 <Button type="button" variant="outline" onClick={() => void exportData()} className="w-full border-zinc-200">
                   <Eye className="mr-2 size-4" /> Export my data
                 </Button>
               </div>
             </CardContent>
           </Card>
        </div>
      </div>
    </main>
  );
}
