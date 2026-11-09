export type DatabaseProvider = "supabase" | "neon" | "octo";

export function resolveLinkedDatabaseProvider({
  hasSupabaseProject,
  hasNeonProject,
  hasOctoWorkspace,
}: {
  hasSupabaseProject: boolean;
  hasNeonProject: boolean;
  hasOctoWorkspace?: boolean;
}): DatabaseProvider | undefined {
  // Octo wins: it is the owner's data layer (delta 7), a single workspace read
  // from config, so Supabase/Neon never resolve once it is configured.
  if (hasOctoWorkspace) return "octo";
  if (hasNeonProject) return "neon";
  if (hasSupabaseProject) return "supabase";
  return undefined;
}

export type DatabasePromptState =
  | "supabase"
  | "supabase-disconnected"
  | "neon"
  | "neon-disconnected"
  | "octo"
  | "none";

export function resolveRootDatabasePromptState({
  hasSupabaseProject,
  supabaseCredentialsAvailable,
  hasNeonProject,
  neonCredentialsAvailable,
  hasOctoWorkspace,
}: {
  hasSupabaseProject: boolean;
  supabaseCredentialsAvailable: boolean;
  hasNeonProject: boolean;
  neonCredentialsAvailable: boolean;
  hasOctoWorkspace?: boolean;
}): DatabasePromptState {
  const provider = resolveLinkedDatabaseProvider({
    hasSupabaseProject,
    hasNeonProject,
    hasOctoWorkspace,
  });
  if (provider === "octo") {
    return "octo";
  }
  if (provider === "neon") {
    return neonCredentialsAvailable ? "neon" : "neon-disconnected";
  }
  if (provider === "supabase") {
    return supabaseCredentialsAvailable ? "supabase" : "supabase-disconnected";
  }
  return "none";
}
