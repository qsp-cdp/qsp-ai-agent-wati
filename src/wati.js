// Thin wrapper around @wati-io/wati-cli.
//
// The CLI is "agent-friendly": every command prints JSON to stdout, errors go to
// stderr, and exit codes are meaningful. We shell out to it and parse the JSON.
// This keeps the WhatsApp integration in one place and uses the CLI exactly as
// the project intends.

import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

import { config } from './config.js';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

// Resolve the CLI entry point robustly from the installed package.
const watiPkg = require.resolve('@wati-io/wati-cli/package.json');
const watiBin = join(dirname(watiPkg), 'dist', 'index.js');

// Global flags resolved from config. CLI flags take precedence over env/~/.watirc,
// so passing them explicitly makes behaviour deterministic.
function globalFlags() {
  const flags = [];
  if (config.wati.baseUrl) flags.push('--base-url', config.wati.baseUrl);
  if (config.wati.authToken) flags.push('--token', config.wati.authToken);
  if (config.wati.tenantId) flags.push('--tenant-id', config.wati.tenantId);
  return flags;
}

/**
 * Run a wati CLI command and return its parsed JSON output.
 * @param {string[]} args subcommand + flags, e.g. ['conversations', 'messages', '+507...']
 */
export async function runWati(args) {
  const argv = [watiBin, ...globalFlags(), ...args];
  try {
    const { stdout } = await execFileAsync(process.execPath, argv, {
      env: process.env,
      maxBuffer: 10 * 1024 * 1024,
    });
    return parseJson(stdout);
  } catch (err) {
    // Non-zero exit: the CLI writes a JSON error to stderr.
    const stderr = (err && err.stderr) || '';
    const parsed = safeParse(stderr);
    const message =
      (parsed && (parsed.error || parsed.message)) ||
      stderr.trim() ||
      err.message ||
      'wati CLI failed';
    const error = new Error(`wati ${args.join(' ')} → ${message}`);
    error.cause = err;
    error.details = parsed;
    throw error;
  }
}

function parseJson(stdout) {
  const text = (stdout || '').trim();
  if (!text) return null;
  return JSON.parse(text);
}

function safeParse(text) {
  try {
    return JSON.parse((text || '').trim());
  } catch {
    return null;
  }
}

/**
 * Fetch recent messages for a conversation.
 * @param {string} target phone (e.g. +5071234567), contact id, or Channel:Phone
 * @param {number} [pageSize]
 */
export function getConversationMessages(target, pageSize = config.conversation.historyPageSize) {
  return runWati(['conversations', 'messages', String(target), '--page-size', String(pageSize)]);
}

/**
 * Send a plain text message.
 * @param {string} target phone / contact id
 * @param {string} text message body
 */
export function sendText(target, text) {
  return runWati(['conversations', 'send-text', '--target', String(target), '--text', String(text)]);
}

/**
 * Subscribe a webhook URL to a set of event types.
 * @param {string} url public endpoint
 * @param {string[]} events e.g. ['message', 'newContactMessageReceived']
 */
export function subscribeWebhook(url, events) {
  return runWati(['webhooks', 'subscribe', '--url', url, '--events', events.join(',')]);
}

export function listWebhooks() {
  return runWati(['webhooks', 'list']);
}

export { watiBin };
