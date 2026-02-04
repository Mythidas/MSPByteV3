// src/routes/(app)/integrations/autotask/+page.server.ts
import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { superValidate, message } from "sveltekit-superforms";
import { zod4 } from "sveltekit-superforms/adapters";
import { prepareSensitiveFormData, isMaskedSecret } from "$lib/utils/forms";
import { AutoTaskConnector } from "@workspace/shared/lib/connectors/AutoTaskConnector";
import { autoTaskConfigSchema } from "./_forms";
import { Encryption } from "$lib/server/encryption";
import { ORM } from "@workspace/shared/lib/utils/orm";
import { supabase } from "$lib/supabase";

const fetchTenants = async () => {
  const orm = new ORM(supabase);
  const { data } = await orm.selectSingle("public", "integrations", (q) =>
    q.eq("id", "autotask"),
  );
  if (!data) return { data: [] };

  (data.config as any).clientSecret = Encryption.decrypt(
    (data.config as any).clientSecret,
  );
  const autotask = new AutoTaskConnector(data.config as any);
  const { data: companies, error } = await autotask.getCompanies();

  if (error) {
    return { error };
  }

  return { data: companies.map((c) => ({ id: c.id, name: c.companyName })) };
};

const fetchLinks = async () => {
  const orm = new ORM(supabase);
  const { data } = await orm.select("public", "site_to_integration", (q) =>
    q.eq("integration_id", "autotask"),
  );
  return { data: data?.rows || [] };
};

export const load: PageServerLoad = async ({ locals }) => {
  const { data: integration } = await locals.orm.selectSingle(
    "public",
    "integrations",
    (q) => q.eq("id", "autotask"),
  );
  const { data: sites } = await locals.orm.select("public", "sites");

  const formDefaults = integration?.config
    ? {
        ...(integration.config as any),
        clientSecret: "••••••••••", // Mask existing secret
      }
    : null;

  const form = await superValidate(formDefaults, zod4(autoTaskConfigSchema));

  return {
    integration,
    sites: sites?.rows || [],
    form,
    tenants: fetchTenants(),
    siteLinks: fetchLinks(),
  };
};

export const actions: Actions = {
  testConnection: async ({ request, locals }) => {
    const form = await superValidate(request, zod4(autoTaskConfigSchema));

    if (!form.valid) {
      return fail(400, { form });
    }

    try {
      // Get existing config to handle masked secret
      const { data: integration } = await locals.orm.selectSingle(
        "public",
        "integrations",
        (q) => q.eq("id", "autotask"),
      );

      // Prepare data, using existing secret if it's still masked
      const configData = prepareSensitiveFormData(
        form.data,
        (integration?.config as any) || null,
        ["clientSecret"],
      );

      const connector = new AutoTaskConnector(configData as any);
      const result = await connector.checkHealth();

      if (!result.data) {
        return message(
          form,
          "Connection failed. Please check your credentials.",
          {
            status: 400,
          },
        );
      }

      return message(form, "Connection successful!");
    } catch (err) {
      return message(form, `Connection failed: ${String(err)}`, {
        status: 500,
      });
    }
  },

  save: async ({ request, locals }) => {
    const form = await superValidate(request, zod4(autoTaskConfigSchema));

    if (!form.valid) {
      return fail(400, { form });
    }

    try {
      // Get existing config to handle masked secret
      const { data: integration } = await locals.orm.selectSingle(
        "public",
        "integrations",
        (q) => q.eq("id", "autotask"),
      );

      // Prepare data, using existing secret if it's still masked
      form.data.clientSecret = Encryption.encrypt(form.data.clientSecret);
      const configData = prepareSensitiveFormData(
        form.data,
        (integration?.config as any) || null,
        ["clientSecret"],
      );

      // Test connection before saving
      const connector = new AutoTaskConnector(configData);
      const healthCheck = await connector.checkHealth();

      if (!healthCheck.data) {
        return message(
          form,
          "Cannot save: Connection test failed. Please verify your credentials.",
          { status: 400 },
        );
      }

      const { error } = await locals.orm.upsert("public", "integrations", [
        {
          id: "autotask",
          tenant_id: locals.session.tenant_id,
          config: configData,
          updated_at: new Date().toISOString(),
        },
      ]);

      if (error) {
        return message(form, `Failed to save: ${error.message}`, {
          status: 500,
        });
      }

      return message(form, "Configuration saved successfully!");
    } catch (err) {
      return message(form, `Failed to save: ${String(err)}`, {
        status: 500,
      });
    }
  },

  delete: async ({ locals }) => {
    try {
      // DB Query: Delete integration
      const { error } = await locals.orm.delete("public", "integrations", (q) =>
        q.eq("id", "autotask").eq("tenant_id", locals.session.tenant_id),
      );

      if (error) {
        return fail(500, { error: error.message });
      }

      return { success: true };
    } catch (err) {
      return fail(500, { error: String(err) });
    }
  },
};
