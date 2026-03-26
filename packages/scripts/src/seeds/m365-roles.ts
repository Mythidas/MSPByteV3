import { supabase } from "../lib/supabase.js";

const GRAPH_URL = "https://graph.microsoft.com/v1.0/directoryRoleTemplates";

// You need to implement this depending on your auth setup
async function getAccessToken() {
  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    },
  );

  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data.access_token;
}

async function fetchM365Roles() {
  const token = await getAccessToken();

  const res = await fetch(GRAPH_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));

  return data.value.map((role: any) => ({
    template_id: role.id,
    name: role.displayName,
    description: role.description || null,
  }));
}

export async function seed() {
  const roles = await fetchM365Roles();

  const { error } = await supabase
    .schema("definitions")
    .from("m365_roles")
    .upsert(roles, { onConflict: "template_id" });

  if (error) throw error;

  console.log(`Seeded ${roles.length} M365 roles (live from Graph)`);
}
