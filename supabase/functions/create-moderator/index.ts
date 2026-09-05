// Supabase Edge Function: create-moderator
//
// Client-side code can never hold the service-role key (it bypasses Row
// Level Security entirely), so creating a new Supabase Auth user has to
// happen server-side. This function does that: it verifies the caller is
// a signed-in admin, then uses the service role (available automatically
// inside every Edge Function as SUPABASE_SERVICE_ROLE_KEY) to invite the
// new staff member by email and create their `profiles` row -- as either
// a moderator or another admin, per the `role` field in the request body.
//
// Deploy via the Supabase dashboard: Edge Functions -> Create a new
// function -> name it "create-moderator" -> paste this file's contents.
// (Kept the original function name on the redeploy so no new function
// needs to be created in the dashboard -- just replace the code.)
import { createClient } from "npm:@supabase/supabase-js@2";

const APP_RESET_PASSWORD_URL = "https://rafehjeelani.github.io/load-testing-tracker/reset-password";

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

    // Scoped to the caller's own session -- used only to verify who's asking.
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
    if (profile?.role !== "admin") return json({ error: "Only admins can invite moderators" }, 403);

    const { email, full_name, role } = await req.json();
    if (!email || !full_name) return json({ error: "email and full_name are required" }, 400);
    const targetRole = role ?? "moderator";
    if (targetRole !== "admin" && targetRole !== "moderator") {
      return json({ error: "role must be 'admin' or 'moderator'" }, 400);
    }

    // Elevated client -- service role bypasses RLS, used only for the two
    // admin-only operations below (never returned to the browser).
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: invited, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo: APP_RESET_PASSWORD_URL,
    });
    if (inviteErr || !invited.user) {
      return json({ error: inviteErr?.message ?? "Could not invite that user" }, 400);
    }

    const { error: profileErr } = await adminClient.from("profiles").insert({
      id: invited.user.id,
      role: targetRole,
      full_name,
      email,
    });
    if (profileErr) return json({ error: profileErr.message }, 400);

    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
