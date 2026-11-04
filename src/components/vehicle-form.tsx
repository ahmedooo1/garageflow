"use client";

import type { Vehicle } from "@prisma/client";
import { ActionForm, SubmitButton } from "@/components/forms";
import { PlateLookup } from "@/components/plate-lookup";
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
  plateLookup = false,
}: {
  vehicle?: Vehicle;
  customers: CustomerOption[];
  customerId?: string;
  returnTo?: string;
  /** Recherche par immatriculation activée sur le serveur (création uniquement). */
  plateLookup?: boolean;
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
          {!vehicle && plateLookup && <PlateLookup />}
          <div className="grid gap-4 sm:grid-cols-2">
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
          <fieldset className="space-y-4 rounded-[10px] border border-line p-4">
            <legend className="px-1 text-sm font-bold text-ink">Caractéristiques techniques (facultatif)</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Version" name="version" error={state.fields?.version}>
                <input id="version" name="version" className="input" defaultValue={vehicle?.version} maxLength={80} />
              </Field>
              <Field label="Motorisation" name="engine" error={state.fields?.engine}>
                <input id="engine" name="engine" className="input" defaultValue={vehicle?.engine} maxLength={80} />
              </Field>
              <Field label="Mise en circulation" name="firstRegistrationDate" error={state.fields?.firstRegistrationDate}>
                <input
                  id="firstRegistrationDate"
                  name="firstRegistrationDate"
                  type="date"
                  className="input"
                  defaultValue={vehicle?.firstRegistrationDate ? vehicle.firstRegistrationDate.toISOString().slice(0, 10) : ""}
                />
              </Field>
              <Field label="Boîte de vitesses" name="gearbox" error={state.fields?.gearbox}>
                <input id="gearbox" name="gearbox" className="input" defaultValue={vehicle?.gearbox} list="gearbox-options" maxLength={40} />
                <datalist id="gearbox-options">
                  <option value="Manuelle" />
                  <option value="Automatique" />
                </datalist>
              </Field>
              <Field label="Puissance (kW)" name="powerKw" error={state.fields?.powerKw}>
                <input id="powerKw" name="powerKw" type="number" inputMode="numeric" min={1} max={2000} className="input" defaultValue={vehicle?.powerKw ?? ""} />
              </Field>
              <Field label="Puissance fiscale (CV)" name="fiscalPower" error={state.fields?.fiscalPower}>
                <input id="fiscalPower" name="fiscalPower" type="number" inputMode="numeric" min={1} max={200} className="input" defaultValue={vehicle?.fiscalPower ?? ""} />
              </Field>
            </div>
          </fieldset>
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
