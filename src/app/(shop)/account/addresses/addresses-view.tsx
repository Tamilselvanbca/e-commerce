"use client";

import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { Address } from "@/lib/types";
import { useAuth, useToast } from "@/components/providers";
import { Badge, Button, Card, EmptyState, Modal } from "@/components/ui";
import { AddressForm, AddressLines } from "@/components/shop/address-form";
import { MapPinIcon, PencilIcon, PlusIcon, TrashIcon } from "@/components/shop/icons";
import { useApi } from "@/components/shop/use-api";

type Editing = { mode: "new" } | { mode: "edit"; address: Address } | null;

function sortAddresses(list: Address[]): Address[] {
  return [...list].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

export function AddressesView() {
  const { user } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload, mutate } = useApi<{ items: Address[] }>("/addresses");
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<Address | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const addresses = data?.items ?? [];

  function onSaved(saved: Address) {
    const wasNew = editing?.mode === "new";
    mutate((prev) => {
      const list = (prev?.items ?? []).filter((a) => a.id !== saved.id);
      const next = saved.isDefault ? list.map((a) => ({ ...a, isDefault: false })) : list;
      return { items: sortAddresses([...next, saved]) };
    });
    setEditing(null);
    toast.success(wasNew ? "Address added" : "Address updated");
    // The first address becomes the default on the server; refetch to stay in sync.
    if (wasNew && addresses.length === 0) reload();
  }

  async function makeDefault(address: Address) {
    setBusy(address.id);
    try {
      const updated = await api<Address>(`/addresses/${address.id}/default`, { method: "POST" });
      mutate((prev) => ({
        items: sortAddresses((prev?.items ?? []).map((a) => (a.id === updated.id ? updated : { ...a, isDefault: false }))),
      }));
      toast.success("Default address updated");
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    const target = deleting;
    setBusy(target.id);
    try {
      await api(`/addresses/${target.id}`, { method: "DELETE" });
      setDeleting(null);
      toast.success("Address deleted");
      // Deleting the default may promote another address server side.
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Addresses</h2>
          <p className="mt-1 text-sm text-zinc-600">Saved delivery addresses for faster checkout.</p>
        </div>
        {addresses.length > 0 && (
          <Button onClick={() => setEditing({ mode: "new" })}>
            <PlusIcon className="size-4" />
            Add address
          </Button>
        )}
      </div>

      <div className="mt-6">
        {loading && !data ? (
          <div className="grid animate-pulse gap-4 sm:grid-cols-2" aria-busy="true">
            <div className="h-40 rounded-xl bg-zinc-100" />
            <div className="h-40 rounded-xl bg-zinc-100" />
          </div>
        ) : error && !data ? (
          <EmptyState
            title="We couldn't load your addresses"
            description={errorMessage(error)}
            action={
              <Button variant="outline" onClick={reload}>
                Try again
              </Button>
            }
          />
        ) : addresses.length === 0 ? (
          <EmptyState
            icon={<MapPinIcon className="size-10" />}
            title="No saved addresses"
            description="Add an address now and checkout will be quicker next time."
            action={
              <Button onClick={() => setEditing({ mode: "new" })}>
                <PlusIcon className="size-4" />
                Add address
              </Button>
            }
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {addresses.map((a) => (
              <li key={a.id} className="flex flex-col rounded-xl border border-zinc-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <AddressLines address={a} />
                  {a.isDefault && <Badge className="shrink-0 bg-brand-700 text-white ring-brand-700">Default</Badge>}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-1 border-t border-zinc-100 pt-3">
                  <Button variant="ghost" size="sm" onClick={() => setEditing({ mode: "edit", address: a })} disabled={busy !== null}>
                    <PencilIcon className="size-4" />
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleting(a)} disabled={busy !== null}>
                    <TrashIcon className="size-4" />
                    Delete
                  </Button>
                  {!a.isDefault && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto"
                      onClick={() => makeDefault(a)}
                      loading={busy === a.id}
                      disabled={busy !== null}
                    >
                      Set as default
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.mode === "edit" ? "Edit address" : "Add a new address"}
        size="lg"
      >
        {editing && (
          <AddressForm
            key={editing.mode === "edit" ? editing.address.id : "new"}
            address={editing.mode === "edit" ? editing.address : null}
            defaults={{ fullName: user?.name, phone: user?.phone }}
            onSaved={onSaved}
            onCancel={() => setEditing(null)}
            showDefaultToggle={addresses.length > 0}
          />
        )}
      </Modal>

      <Modal
        open={deleting !== null}
        onClose={() => (busy ? undefined : setDeleting(null))}
        title="Delete address?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)} disabled={busy !== null}>
              Keep it
            </Button>
            <Button variant="danger" onClick={confirmDelete} loading={busy !== null && busy === deleting?.id}>
              Delete
            </Button>
          </>
        }
      >
        {deleting && (
          <div className="space-y-3 text-sm text-zinc-600">
            <p>This address will be removed from your account. Past orders are not affected.</p>
            <div className="rounded-lg bg-zinc-50 p-3">
              <AddressLines address={deleting} />
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
