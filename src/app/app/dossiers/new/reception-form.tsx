"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field } from "@/components/ui";
import { formatPlate, toDateTimeLocal } from "@/lib/format";
import { createWorkOrderAction } from "@/server/actions/workorders";

type Customer = { id: string; firstName: string; lastName: string; phone: string };
type Vehicle = { id: string; customerId: string; plate: string; make: string; model: string; mileage: number };
type Technician = { id: string; firstName: string; lastName: string };

function defaultPromised(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(18, 0, 0, 0);
  return toDateTimeLocal(d);
}

export function ReceptionForm({
  customers,
  vehicles,
  technicians,
  initialCustomerId,
  initialVehicleId,
}: {
  customers: Customer[];
  vehicles: Vehicle[];
  technicians: Technician[];
  initialCustomerId?: string;
  initialVehicleId?: string;
}) {
  const [customerId, setCustomerId] = useState(initialCustomerId ?? "");
  const [vehicleId, setVehicleId] = useState(initialVehicleId ?? "");
  const [filter, setFilter] = useState("");

  const filteredCustomers = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return customers;
    return customers.filter((c) => `${c.firstName} ${c.lastName} ${c.phone}`.toLowerCase().includes(f));
  }, [customers, filter]);

  const customerVehicles = useMemo(() => vehicles.filter((v) => v.customerId === customerId), [vehicles, customerId]);
  const selectedVehicle = customerVehicles.find((v) => v.id === vehicleId);

  const returnTo = `/app/dossiers/new${customerId ? `?customerId=${customerId}` : ""}`;

  return (
    <ActionForm action={createWorkOrderAction} className="space-y-4">
      {(state) => (
        <>
          <Card title="1. Client" actions={<Link href={`/app/clients/new?returnTo=${encodeURIComponent("/app/dossiers/new")}`} className="btn btn-secondary btn-sm"><Plus className="h-4 w-4" /> Nouveau client</Link>}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Rechercher" name="customerFilter">
                <input id="customerFilter" className="input" placeholder="Nom ou téléphone…" value={filter} onChange={(e) => setFilter(e.target.value)} autoComplete="off" />
              </Field>
              <Field label="Client" name="customerId" error={state.fields?.customerId} required>
                <select
                  id="customerId"
                  name="customerId"
                  className="input"
                  value={customerId}
                  onChange={(e) => {
                    setCustomerId(e.target.value);
                    setVehicleId("");
                  }}
                  required
                >
                  <option value="">Choisir un client…</option>
                  {filteredCustomers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.lastName.toUpperCase()} {c.firstName}
                      {c.phone ? ` · ${c.phone}` : ""}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </Card>

          <Card
            title="2. Véhicule"
            actions={
              customerId ? (
                <Link href={`/app/vehicules/new?customerId=${customerId}&returnTo=${encodeURIComponent(returnTo)}`} className="btn btn-secondary btn-sm">
                  <Plus className="h-4 w-4" /> Nouveau véhicule
                </Link>
              ) : null
            }
          >
            {!customerId ? (
              <p className="text-sm text-muted">Sélectionnez d&apos;abord un client.</p>
            ) : customerVehicles.length === 0 ? (
              <p className="text-sm text-muted">Ce client n&apos;a pas encore de véhicule : créez-en un.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {customerVehicles.map((v) => (
                  <label key={v.id} className={`flex cursor-pointer items-center gap-3 rounded-[10px] border-2 p-3 ${vehicleId === v.id ? "border-accent bg-accent-soft" : "border-line hover:border-steel-300"}`}>
                    <input type="radio" name="vehicleId" value={v.id} checked={vehicleId === v.id} onChange={() => setVehicleId(v.id)} className="h-5 w-5 accent-accent" required />
                    <span>
                      <span className="plate text-sm">{formatPlate(v.plate)}</span>
                      <span className="ml-2 font-bold">
                        {v.make} {v.model}
                      </span>
                      <span className="block text-xs text-muted">{v.mileage.toLocaleString("fr-FR")} km au dernier passage</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
            {state.fields?.vehicleId && <p className="mt-2 text-sm font-medium text-danger">{state.fields.vehicleId}</p>}
          </Card>

          <Card title="3. Visite">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Kilométrage à l'entrée" name="mileageIn" error={state.fields?.mileageIn} required>
                <input
                  key={selectedVehicle?.id ?? "none"}
                  id="mileageIn"
                  name="mileageIn"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  className="input text-lg font-bold"
                  defaultValue={selectedVehicle?.mileage || ""}
                  required
                />
              </Field>
              <Field label="Heure de restitution prévue" name="promisedAt" error={state.fields?.promisedAt}>
                <input id="promisedAt" name="promisedAt" type="datetime-local" className="input" defaultValue={defaultPromised()} />
              </Field>
              <Field label="Raison de la visite" name="reason" error={state.fields?.reason} required className="sm:col-span-2">
                <input id="reason" name="reason" className="input" placeholder="Ex : bruit au freinage, révision, voyant moteur…" required />
              </Field>
              <Field label="Symptômes décrits par le client" name="symptoms" error={state.fields?.symptoms} className="sm:col-span-2">
                <textarea id="symptoms" name="symptoms" className="input" rows={3} placeholder="Quand ? À quelle vitesse ? Depuis combien de temps ?" />
              </Field>
              <Field label="Technicien (facultatif)" name="technicianId" error={state.fields?.technicianId}>
                <select id="technicianId" name="technicianId" className="input" defaultValue="">
                  <option value="">Non assigné</option>
                  {technicians.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.firstName} {t.lastName}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </Card>

          <div className="flex justify-end">
            <SubmitButton size="lg" pendingText="Création du dossier…" disabled={!customerId || !vehicleId}>
              Réceptionner le véhicule → photos
            </SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
