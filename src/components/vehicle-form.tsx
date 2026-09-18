"use client";

import type { Vehicle } from "@prisma/client";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";
import { formatPlate } from "@/lib/format";
import { FUEL_LABELS } from "@/lib/labels";
import { createVehicleAction, updateVehicleAction } from "@/server/actions/vehicles";

type CustomerOption = { id: string; firstName: string; lastName: string };

export function VehicleForm({
  vehicle,
  customers,
  customerId,
  returnTo,
}: {
  vehicle?: Vehicle;
  customers: CustomerOption[];
  customerId?: string;
  returnTo?: string;
}) {
  const action = vehicle ? updateVehicleAction : createVehicleAction;
  const selected = vehicle?.customerId ?? customerId ?? "";
  return (
    <ActionForm action={action} className="space-y-4" hidden={{ id: vehicle?.id, returnTo }}>
      {(state) => (
        <>
          <Field label="Client" name="customerId" error={state.fields?.customerId} required>
            <select id="customerId" name="customerId" className="input" defaultValue={selected} required>
              <option value="">Choisir un client…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.lastName.toUpperCase()} {c.firstName}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Immatriculation" name="plate" error={state.fields?.plate} required>
              <input
                id="plate"
                name="plate"
                className="input font-mono uppercase tracking-widest"
                defaultValue={vehicle ? formatPlate(vehicle.plate) : ""}
                placeholder="AB-123-CD"
                autoCapitalize="characters"
                required
                autoFocus={!vehicle}
              />
            </Field>
            <Field label="VIN (numéro de série)" name="vin" error={state.fields?.vin}>
              <input id="vin" name="vin" className="input font-mono uppercase" defaultValue={vehicle?.vin} maxLength={17} autoCapitalize="characters" />
            </Field>
            <Field label="Marque" name="make" error={state.fields?.make} required>
              <input id="make" name="make" className="input" defaultValue={vehicle?.make} placeholder="Peugeot" required />
            </Field>
            <Field label="Modèle" name="model" error={state.fields?.model} required>
              <input id="model" name="model" className="input" defaultValue={vehicle?.model} placeholder="308" required />
            </Field>
            <Field label="Année" name="year" error={state.fields?.year}>
              <input id="year" name="year" type="number" inputMode="numeric" min={1950} max={2100} className="input" defaultValue={vehicle?.year ?? ""} />
            </Field>
            <Field label="Carburant" name="fuel" error={state.fields?.fuel}>
              <select id="fuel" name="fuel" className="input" defaultValue={vehicle?.fuel ?? "DIESEL"}>
                {Object.entries(FUEL_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Kilométrage" name="mileage" error={state.fields?.mileage}>
              <input id="mileage" name="mileage" type="number" inputMode="numeric" min={0} className="input" defaultValue={vehicle?.mileage ?? ""} placeholder="0" />
            </Field>
            <Field label="Couleur" name="color" error={state.fields?.color}>
              <input id="color" name="color" className="input" defaultValue={vehicle?.color} />
            </Field>
          </div>
          <Field label="Notes" name="notes" error={state.fields?.notes}>
            <textarea id="notes" name="notes" className="input" defaultValue={vehicle?.notes} rows={2} />
          </Field>
          <div className="flex justify-end pt-2">
            <SubmitButton size="lg" pendingText="Enregistrement…">
              {vehicle ? "Enregistrer" : "Créer le véhicule"}
            </SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
