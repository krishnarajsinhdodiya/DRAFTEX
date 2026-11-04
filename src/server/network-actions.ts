"use server";
// Network screen actions. The custom server and Next.js both check the Origin of every action.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actorOf } from "@/lib/auth/service";
import { getData } from "@/lib/data";
import { clientAddress, requireAdmin } from "./auth";
import { networkDeps } from "./network";
import { NetworkInputError, networkCommands } from "./network-commands";

export type NetworkResult = { ok: true } | { ok: false; message: string };

async function commands() {
  const { user } = await requireAdmin();
  return networkCommands(await getData(), networkDeps(), actorOf(user), await clientAddress());
}

async function attempt(fn: () => Promise<unknown>): Promise<NetworkResult> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof NetworkInputError) return { ok: false, message: e.message };
    throw e;
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

const field = z.string().max(1000);
const formSchema = z.object({
  mode: field,
  port: field,
  hostNames: field,
  bindAddress: field,
  trustedProxies: field,
});

export async function saveNetworkAction(form: z.input<typeof formSchema>): Promise<NetworkResult> {
  const c = await commands();
  const parsed = formSchema.safeParse(form);
  if (!parsed.success)
    return { ok: false, message: "The settings could not be read. Reload the page." };
  return attempt(() => c.save(parsed.data));
}

export async function addFirewallRuleAction(): Promise<NetworkResult> {
  const c = await commands();
  return attempt(() => c.addFirewallRule());
}

export async function removeFirewallRuleAction(): Promise<NetworkResult> {
  const c = await commands();
  return attempt(() => c.removeFirewallRule());
}

export async function restartAction(): Promise<NetworkResult> {
  const c = await commands();
  return attempt(() => c.restart());
}
