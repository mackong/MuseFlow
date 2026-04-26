"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { OwnProfileShell, ProfilePatch } from "@/lib/contracts/profile.contract";
import {
  DisplayNameSchema,
  ProfileDescriptionSchema,
  UsernameSchema,
} from "@/lib/contracts/profile.contract";
import { ApiError, api } from "@/lib/http/client";

/**
 * /me/edit — profile edit form.
 *
 * PATCH /api/me with the diff. The server enforces uniqueness on
 * displayName / username; we surface ConflictError → field-scoped
 * inline message rather than a toast.
 */
export default function EditProfilePage() {
  const router = useRouter();

  const [shell, setShell] = useState<OwnProfileShell | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [description, setDescription] = useState("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api<OwnProfileShell>("/api/me");
        if (!cancelled) {
          setShell(res);
          setDisplayName(res.user.displayName);
          setUsername(res.user.username);
          setDescription(res.user.description ?? "");
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof ApiError ? err.envelope.error.message : "Couldn't load profile.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function buildPatch():
    | { ok: true; patch: ProfilePatch }
    | { ok: false; errors: Record<string, string> } {
    if (!shell) return { ok: false, errors: { _: "Not loaded yet" } };
    const errors: Record<string, string> = {};
    const patch: ProfilePatch = {};

    if (displayName !== shell.user.displayName) {
      const parsed = DisplayNameSchema.safeParse(displayName);
      if (!parsed.success) errors.displayName = "Display name must be 2–40 characters.";
      else patch.displayName = parsed.data;
    }
    if (username !== shell.user.username) {
      const parsed = UsernameSchema.safeParse(username);
      if (!parsed.success)
        errors.username = "Username can only contain a-z, 0-9, _ and - (2–30 chars).";
      else patch.username = parsed.data;
    }
    const currentDescription = shell.user.description ?? "";
    if (description !== currentDescription) {
      const parsed = ProfileDescriptionSchema.safeParse(
        description.length > 0 ? description : null,
      );
      if (!parsed.success) errors.description = "Description is too long (max 240 chars).";
      else patch.description = parsed.data;
    }

    if (Object.keys(errors).length > 0) return { ok: false, errors };
    return { ok: true, patch };
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFieldErrors({});

    const built = buildPatch();
    if (!built.ok) {
      setFieldErrors(built.errors);
      return;
    }
    if (Object.keys(built.patch).length === 0) {
      toast.message("Nothing to save — your profile is unchanged.");
      return;
    }

    setSaving(true);
    try {
      await api<OwnProfileShell>("/api/me", { method: "PATCH", json: built.patch });
      toast.success("Profile saved.");
      router.replace("/me");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.envelope.error.code === "conflict") {
        const msg = err.envelope.error.message.toLowerCase();
        if (msg.includes("display")) {
          setFieldErrors({ displayName: err.envelope.error.message });
        } else if (msg.includes("username")) {
          setFieldErrors({ username: err.envelope.error.message });
        } else {
          setFieldErrors({ _: err.envelope.error.message });
        }
      } else {
        setFieldErrors({
          _: err instanceof ApiError ? err.envelope.error.message : "Couldn't save profile.",
        });
      }
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div className="flex flex-col gap-3 px-4 py-6">
        <p role="alert" className="text-sm text-destructive">
          {loadError}
        </p>
      </div>
    );
  }

  if (!shell) {
    return (
      <div className="flex flex-col gap-3 px-4 py-6">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-4 px-4 py-6" onSubmit={(e) => void onSubmit(e)}>
      <header>
        <h1 className="text-xl font-semibold">Edit profile</h1>
      </header>

      {fieldErrors._ && (
        <p role="alert" className="text-sm text-destructive">
          {fieldErrors._}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="displayName">Display name</Label>
        <Input
          id="displayName"
          name="displayName"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          minLength={2}
          maxLength={40}
          required
        />
        {fieldErrors.displayName && (
          <p className="text-xs text-destructive">{fieldErrors.displayName}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          name="username"
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          autoCapitalize="none"
          autoCorrect="off"
          minLength={2}
          maxLength={30}
          required
        />
        {fieldErrors.username && <p className="text-xs text-destructive">{fieldErrors.username}</p>}
        <p className="text-xs text-muted-foreground">a-z, 0-9, _ and - only.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Bio</Label>
        <Textarea
          id="description"
          name="description"
          rows={4}
          maxLength={240}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional. Up to 240 characters."
        />
        {fieldErrors.description && (
          <p className="text-xs text-destructive">{fieldErrors.description}</p>
        )}
        <p className="text-xs text-muted-foreground">{description.length}/240</p>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={saving} className="flex-1">
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.replace("/me")}
          disabled={saving}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
