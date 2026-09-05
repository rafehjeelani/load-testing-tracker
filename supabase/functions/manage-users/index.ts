// Supabase Edge Function: manage-users
//
// Admin-only operations that require the service role (never available
// client-side, since it bypasses RLS entirely):
//   - { action: "delete", user_id }               -- deletes the auth user
//     (profiles row cascades via `on delete cascade`). Fails with a clear
//     error if that user is still assigned as moderator on any candidate,
//     since candidates.moderator_id has no cascade -- reassign those first.
//   - { action: "update_email", user_id, email }  -- changes the user's
//     Supabase Auth login email AND the profiles.email column together, so
//     the two never drift apart.
//   - { action: "generate_link", type: "invite" | "recovery", email,
//       full_name?, role? }                       -- generates the same
//     invite/reset link Supabase's own emails would contain, but *without*
//     sending an email. This is the one supported way to sidestep GoTrue's
//     built-in email rate limit (a handful of sends per hour on the
//     default/no-custom-SMTP setup): the admin copies the link from the UI
//     and shares it directly (Slack, WhatsApp, etc). "invite" also creates
//     the auth user + profiles row, same as create-moderator does when it
//     sends its own email. "recovery" targets an existing user.
//
// Deploy via the Supabase dashboard: Edge Functions -> Create a new
// function -> name it "manage-users" -> paste this file's contents.
import { createClient } from "npm:@supabase/supabase-js@2";

const APP_RESET_PASSWORD_URL = "https://rafehjeelani.github.io/load-testing-tracker/reset-password";

// Accounts that can never be deleted through this function, regardless of
// who's asking -- a permanent safeguard against locking the whole org out
// of the admin console.
const PROTECTED_EMAILS = ["rafehjeelani@gmail.com"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Not authenticated" }, 401);

    const { data: profile } = await callerClient
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();
    if (profile?.role !== "admin") return json({ error: "Only admins can manage users" }, 403);

    const body = await req.json();
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    if (body.action === "delete") {
      const { user_id } = body;
      if (!user_id) return json({ error: "user_id is required" }, 400);
      if (user_id === userData.user.id) {
        return json({ error: "You can't delete your own account." }, 400);
      }

      const { data: target } = await adminClient
        .from("profiles")
        .select("email")
        .eq("id", user_id)
        .single();
      if (target?.email && PROTECTED_EMAILS.includes(target.email.toLowerCase())) {
        return json({ error: "This account is protected and can't be deleted." }, 400);
      }

      const { count } = await adminClient
        .from("candidates")
        .select("id", { count: "exact", head: true })
        .eq("moderator_id", user_id);
      if (count && count > 0) {
        return json(
          {
            error: `This user is still assigned as moderator on ${count} candidate${count === 1 ? "" : "s"}. Reassign them first.`,
          },
          400,
        );
      }

      const { error: delErr } = await adminClient.auth.admin.deleteUser(user_id);
      if (delErr) return json({ error: delErr.message }, 400);
      return json({ ok: true });
    }

    if (body.action === "update_email") {
      const { user_id, email } = body;
      if (!user_id || !email) return json({ error: "user_id and email are required" }, 400);

      const { error: authErr } = await adminClient.auth.admin.updateUserById(user_id, { email });
      if (authErr) return json({ error: authErr.message }, 400);

      const { error: profileErr } = await adminClient.from("profiles").update({ email }).eq("id", user_id);
      if (profileErr) return json({ error: profileErr.message }, 400);

      return json({ ok: true });
    }

    if (body.action === "generate_link") {
      const { type, email, full_name, role } = body;
      if (!email) return json({ error: "email is required" }, 400);
      if (type !== "invite" && type !== "recovery") {
        return json({ error: "type must be 'invite' or 'recovery'" }, 400);
      }

      if (type === "invite") {
        if (!full_name) return json({ error: "full_name is required" }, 400);
        const targetRole = role ?? "moderator";
        if (targetRole !== "admin" && targetRole !== "moderator") {
          return json({ error: "role must be 'admin' or 'moderator'" }, 400);
        }

        const { data, error } = await adminClient.auth.admin.generateLink({
          type: "invite",
          email,
          options: { redirectTo: APP_RESET_PASSWORD_URL },
        });
        if (error || !data?.user) return json({ error: error?.message ?? "Could not generate that link" }, 400);

        const { error: profileErr } = await adminClient.from("profiles").insert({
          id: data.user.id,
          role: targetRole,
          full_name,
          email,
        });
        if (profileErr) return json({ error: profileErr.message }, 400);

        return json({ link: data.properties.action_link });
      }

      // type === "recovery" -- targets an existing user, nothing to insert.
      const { data, error } = await adminClient.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: APP_RESET_PASSWORD_URL },
      });
      if (error || !data?.properties) return json({ error: error?.message ?? "Could not generate that link" }, 400);
      return json({ link: data.properties.action_link });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
