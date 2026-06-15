// Supabase persistence — reuses the existing `qsp-wati-copilot` tables:
//   conversations (wa_id, status bot|handoff|cerrada, turns_today/date, ...)
//   messages      (role, content, tool_calls, mode shadow|live, model, tokens, latency)
//   handoffs      (conversation_id, motivo, resuelto)
//   job_log       (function_name, action, ok, detail)
//
// All functions degrade gracefully when Supabase is not configured (return
// null/[] / no-op) so the agent still runs without a database.

import { createClient } from '@supabase/supabase-js';

import { config } from './config.js';

let client = null;

export function isDbEnabled() {
  return Boolean(config.supabase.url && config.supabase.serviceKey);
}

function db() {
  if (!client) {
    client = createClient(config.supabase.url, config.supabase.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

/** Fetch the conversation for a WhatsApp id, creating it if new. */
export async function getOrCreateConversation(waId, senderName) {
  if (!isDbEnabled()) return null;
  const sb = db();

  const existing = await sb.from('conversations').select('*').eq('wa_id', waId).maybeSingle();
  if (existing.error) throw new Error(`conversations select: ${existing.error.message}`);
  if (existing.data) {
    if (senderName && !existing.data.sender_name) {
      await sb.from('conversations').update({ sender_name: senderName }).eq('id', existing.data.id);
      existing.data.sender_name = senderName;
    }
    return existing.data;
  }

  const row = {
    wa_id: waId,
    sender_name: senderName || null,
    status: 'bot',
    first_contact_at: new Date().toISOString(),
  };
  const created = await sb.from('conversations').insert(row).select().single();
  if (created.error) {
    // Lost an insert race (wa_id is unique) — re-fetch the winner.
    const retry = await sb.from('conversations').select('*').eq('wa_id', waId).maybeSingle();
    if (retry.data) return retry.data;
    throw new Error(`conversations insert: ${created.error.message}`);
  }
  return created.data;
}

/** Recent user/assistant turns for context, oldest-first. */
export async function getHistory(conversationId, limit = 20) {
  if (!isDbEnabled() || !conversationId) return [];
  const sb = db();
  const { data, error } = await sb
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .in('role', ['user', 'assistant'])
    .not('content', 'is', null)
    .order('id', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`messages select: ${error.message}`);
  return (data || []).reverse().map((m) => ({ role: m.role, content: m.content }));
}

/** Insert one message row. Accepts the columns the copilot schema defines. */
export async function insertMessage(row) {
  if (!isDbEnabled() || !row.conversation_id) return null;
  const sb = db();
  const { data, error } = await sb.from('messages').insert(row).select('id').single();
  if (error) throw new Error(`messages insert: ${error.message}`);
  return data;
}

export async function updateConversation(id, patch) {
  if (!isDbEnabled() || !id) return;
  const sb = db();
  const { error } = await sb.from('conversations').update(patch).eq('id', id);
  if (error) throw new Error(`conversations update: ${error.message}`);
}

export async function createHandoff(conversationId, motivo) {
  if (!isDbEnabled() || !conversationId) return;
  const sb = db();
  const { error } = await sb.from('handoffs').insert({ conversation_id: conversationId, motivo });
  if (error) throw new Error(`handoffs insert: ${error.message}`);
}

/** Operational logging — never throws (logging must not break the request). */
export async function logJob(functionName, action, ok, detail) {
  if (!isDbEnabled()) return;
  try {
    await db().from('job_log').insert({
      function_name: functionName,
      action,
      ok,
      detail: detail || null,
    });
  } catch {
    /* swallow */
  }
}
