"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useId, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { cn, formatDate, formatPrice } from "@/lib/format";
import type { GiftCardDetail, GiftCardTransaction } from "@/lib/types";
import { useToast } from "@/components/providers";
import { Badge, Button, Field, Input, Modal, PageLoader, Textarea } from "@/components/ui";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Table, TableCard, TableEmpty, Td, Th, THead, Row } from "@/components/admin/data-table";
import { GIFT_CARD_STATUS, rupeesToPaise, toLocalInput } from "@/components/admin/discount-utils";
import { InlineAlert, LoadError } from "@/components/admin/feedback";
import { useApiQuery } from "@/components/admin/hooks";
import { IconCopy } from "@/components/admin/icons";
import { DescriptionList, PageHeader, Panel } from "@/components/admin/page-header";
import { validationErrors, type FieldErrors } from "@/components/admin/utils";

const KIND_LABEL: Record<GiftCardTransaction["kind"], string> = {
  issue: "Issued",
  redeem: "Used on order",
  refund: "Returned (order cancelled)",
  adjust: "Adjusted",
};

export default function GiftCardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, isLoading, reload, setData } = useApiQuery<GiftCardDetail>(`/admin/gift-cards/${id}`);
  const toast = useToast();
  const [modal, setModal] = useState<"adjust" | "edit" | "disable" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (isLoading) return <PageLoader />;
  if (!data) return <LoadError error={error} onRetry={reload} backHref="/admin/gift-cards" backLabel="Back to gift cards" what="this gift card" />;

  const card = data;
  const status = GIFT_CARD_STATUS[card.status];
  const update = (next: GiftCardDetail) => setData(() => next);

  async function setActive(isActive: boolean) {
    setBusy("active");
    try {
      update(await api<GiftCardDetail>(`/admin/gift-cards/${card.id}`, { method: "PATCH", body: { isActive } }));
      toast.success(isActive ? "Gift card enabled" : "Gift card disabled");
      setModal(null);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  }

  async function resend() {
    setBusy("email");
    try {
      const res = await api<{ to: string }>(`/admin/gift-cards/${card.id}/email`, { method: "POST" });
      toast.success(`Gift card emailed to ${res.to}`);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title={<span className="font-mono">{card.code}</span>}
        documentTitle={`Gift card ${card.code.slice(-4)}`}
        back={{ href: "/admin/gift-cards", label: "Gift cards" }}
        meta={
          <>
            <Badge className={status.className}>{status.label}</Badge>
            <span className="text-sm text-zinc-600">Issued {formatDate(card.createdAt, true)}</span>
          </>
        }
        actions={
          <>
            <CopyButton text={card.code} />
            {card.recipientEmail && (
              <Button variant="outline" onClick={resend} loading={busy === "email"}>
                Email again
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="min-w-0 space-y-6">
          <Panel title="Balance">
            <p className="text-3xl font-semibold tabular-nums text-zinc-900">{formatPrice(card.balance)}</p>
            <p className="mt-1 text-sm text-zinc-600">of {formatPrice(card.initialBalance)} originally issued</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100" aria-hidden="true">
              <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, (card.balance / card.initialBalance) * 100)}%` }} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setModal("adjust")}>
                Adjust balance
              </Button>
              {card.isActive ? (
                <Button variant="ghost" size="sm" className="text-red-700 hover:bg-red-50" onClick={() => setModal("disable")}>
                  Disable card
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setActive(true)} loading={busy === "active"}>
                  Enable card
                </Button>
              )}
            </div>
          </Panel>

          <Panel title="History" flush>
            <TableCard label="Gift card history" className="rounded-none border-0">
              {card.transactions.length === 0 ? (
                <TableEmpty title="No activity yet" />
              ) : (
                <Table minWidth={560}>
                  <THead>
                    <Th>Date</Th>
                    <Th>Activity</Th>
                    <Th align="right">Amount</Th>
                  </THead>
                  <tbody>
                    {card.transactions.map((t) => (
                      <Row key={t.id}>
                        <Td className="whitespace-nowrap text-zinc-600">{formatDate(t.createdAt, true)}</Td>
                        <Td>
                          <span className="block text-zinc-900">
                            {KIND_LABEL[t.kind]}
                            {t.orderNumber && (
                              <>
                                {" "}
                                <Link href={`/admin/orders/${encodeURIComponent(t.orderNumber)}`} className="font-mono text-brand-800 hover:underline">
                                  {t.orderNumber}
                                </Link>
                              </>
                            )}
                          </span>
                          {(t.note || t.createdByName) && (
                            <span className="block text-xs text-zinc-500">{[t.note, t.createdByName && `by ${t.createdByName}`].filter(Boolean).join(" · ")}</span>
                          )}
                        </Td>
                        <Td align="right" className={cn("whitespace-nowrap tabular-nums font-medium", t.amount < 0 ? "text-zinc-900" : "text-emerald-700")}>
                          {t.amount < 0 ? "−" : "+"}
                          {formatPrice(Math.abs(t.amount))}
                        </Td>
                      </Row>
                    ))}
                  </tbody>
                </Table>
              )}
            </TableCard>
          </Panel>
        </div>

        <Panel
          title="Details"
          actions={
            <Button variant="ghost" size="sm" onClick={() => setModal("edit")}>
              Edit
            </Button>
          }
        >
          <DescriptionList
            items={[
              { label: "Recipient", value: card.recipientName },
              { label: "Email", value: card.recipientEmail ? <span className="break-all">{card.recipientEmail}</span> : null },
              { label: "From", value: card.senderName },
              { label: "Expires", value: card.expiresAt ? formatDate(card.expiresAt, true) : "Never" },
              { label: "Message", value: card.message ? <span className="whitespace-pre-line">{card.message}</span> : null },
            ]}
          />
        </Panel>
      </div>

      {modal === "adjust" && <AdjustModal card={card} onClose={() => setModal(null)} onSaved={update} />}
      {modal === "edit" && <EditModal card={card} onClose={() => setModal(null)} onSaved={update} />}
      <ConfirmDialog
        open={modal === "disable"}
        title="Disable this gift card?"
        description={`It can't be used at checkout until you enable it again. The ${formatPrice(card.balance)} balance is kept.`}
        confirmLabel="Disable card"
        loading={busy === "active"}
        onConfirm={() => setActive(false)}
        onClose={() => setModal(null)}
      />
    </>
  );
}

function CopyButton({ text }: { text: string }) {
  const toast = useToast();
  return (
    <Button
      variant="outline"
      onClick={() =>
        navigator.clipboard.writeText(text).then(
          () => toast.success("Code copied"),
          () => toast.error("Couldn't copy. Select the code and copy it manually."),
        )
      }
    >
      <IconCopy className="size-4" />
      Copy code
    </Button>
  );
}

function AdjustModal({ card, onClose, onSaved }: { card: GiftCardDetail; onClose: () => void; onSaved: (c: GiftCardDetail) => void }) {
  const toast = useToast();
  const uid = useId();
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    const paise = rupeesToPaise(amount);
    if (!paise || Number.isNaN(paise) || paise <= 0) {
      setErrors({ amount: "Enter an amount in rupees" });
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const next = await api<GiftCardDetail>(`/admin/gift-cards/${card.id}/adjust`, {
        method: "POST",
        body: { amount: direction === "add" ? paise : -paise, note: note.trim() },
      });
      onSaved(next);
      toast.success(`Balance is now ${formatPrice(next.balance)}`);
      onClose();
    } catch (err) {
      setErrors(validationErrors(err) ?? {});
      setFormError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Adjust balance" size="sm">
      <div className="space-y-4">
        <div role="group" aria-label="Add or remove" className="inline-flex rounded-lg bg-zinc-100 p-1">
          {(["add", "remove"] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={direction === d}
              onClick={() => setDirection(d)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium",
                direction === d ? "bg-white text-brand-800 shadow-sm ring-1 ring-brand-200" : "text-zinc-600 hover:text-zinc-900",
              )}
            >
              {d === "add" ? "Add" : "Remove"}
            </button>
          ))}
        </div>
        <Field label="Amount" htmlFor={`${uid}-amount`} error={errors.amount} hint={`Current balance ${formatPrice(card.balance)}`}>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-zinc-500">₹</span>
            <Input
              id={`${uid}-amount`}
              type="number"
              inputMode="decimal"
              min={0.01}
              step={0.01}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="pl-7"
              autoFocus
              aria-invalid={errors.amount ? true : undefined}
            />
          </div>
        </Field>
        <Field label="Reason" htmlFor={`${uid}-note`} error={errors.note} hint="Saved in the card's history.">
          <Input id={`${uid}-note`} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {formError && <InlineAlert>{formError}</InlineAlert>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            {direction === "add" ? "Add to balance" : "Remove from balance"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function EditModal({ card, onClose, onSaved }: { card: GiftCardDetail; onClose: () => void; onSaved: (c: GiftCardDetail) => void }) {
  const toast = useToast();
  const uid = useId();
  const [recipientName, setRecipientName] = useState(card.recipientName ?? "");
  const [recipientEmail, setRecipientEmail] = useState(card.recipientEmail ?? "");
  const [senderName, setSenderName] = useState(card.senderName ?? "");
  const [message, setMessage] = useState(card.message ?? "");
  const initialExpires = toLocalInput(card.expiresAt).slice(0, 10);
  const [expires, setExpires] = useState(initialExpires);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setFormError(null);
    try {
      const next = await api<GiftCardDetail>(`/admin/gift-cards/${card.id}`, {
        method: "PATCH",
        body: {
          recipientName: recipientName.trim() || null,
          recipientEmail: recipientEmail.trim() || null,
          senderName: senderName.trim() || null,
          message: message.trim() || null,
          // Only send the expiry when it changed (past dates are rejected). End of the chosen day.
          ...(expires !== initialExpires ? { expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : null } : {}),
        },
      });
      onSaved(next);
      toast.success("Gift card updated");
      onClose();
    } catch (err) {
      setErrors(validationErrors(err) ?? {});
      setFormError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Edit gift card">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Recipient name" htmlFor={`${uid}-name`} error={errors.recipientName}>
          <Input id={`${uid}-name`} value={recipientName} maxLength={100} onChange={(e) => setRecipientName(e.target.value)} />
        </Field>
        <Field label="Recipient email" htmlFor={`${uid}-email`} error={errors.recipientEmail}>
          <Input id={`${uid}-email`} type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} />
        </Field>
        <Field label="From" htmlFor={`${uid}-sender`} error={errors.senderName}>
          <Input id={`${uid}-sender`} value={senderName} maxLength={100} onChange={(e) => setSenderName(e.target.value)} />
        </Field>
        <Field label="Expires on" htmlFor={`${uid}-expires`} error={errors.expiresAt} hint="Empty = never expires.">
          <Input id={`${uid}-expires`} type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </Field>
        <Field label="Message" htmlFor={`${uid}-message`} className="sm:col-span-2">
          <Textarea id={`${uid}-message`} rows={3} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} />
        </Field>
      </div>
      {formError && <InlineAlert className="mt-4">{formError}</InlineAlert>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} loading={saving}>
          Save
        </Button>
      </div>
    </Modal>
  );
}
