import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PagePlaceholder";
import { ChatBox, type ChatMessage } from "@/components/ChatBox";

export const metadata = { title: "AI Analyst · Folio" };

export default async function AIPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("ai_messages").select("role, content, created_at").order("created_at", { ascending: false }).limit(40);
  const initial = ((data ?? []) as (ChatMessage & { created_at: string })[]).reverse().map(({ role, content }) => ({ role, content }));

  return (
    <>
      <PageHeader title="AI Analyst" subtitle="Ask about stocks, sectors and markets. It knows your holdings in % terms, and it explains rather than advises." />
      <ChatBox initial={initial} />
    </>
  );
}
