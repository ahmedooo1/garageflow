import "dotenv/config";
import sharp from "sharp";
import { prisma } from "@/server/db";
import type { Ctx } from "@/server/context";
import { hashPassword } from "@/server/lib/password";
import { submitDecision } from "@/server/services/approvals";
import { updateChecklistItem } from "@/server/services/checklist";
import { createCustomer } from "@/server/services/customers";
import { addDamage } from "@/server/services/damages";
import { addLine, sendEstimate } from "@/server/services/estimates";
import { addFinding } from "@/server/services/findings";
import { addPhoto } from "@/server/services/photos";
import { createVehicle } from "@/server/services/vehicles";
import { applyAction, createWorkOrder, deliverVehicle, saveFinalCheck } from "@/server/services/workorders";

/**
 * Données de démonstration : Garage Normandie Auto.
 * Relance possible : le garage démo est supprimé puis recréé.
 */

export const DEMO_PASSWORD = "Demo1234!Garage";
export const DEMO_OWNER_EMAIL = "philippe@normandie-auto.fr";

async function fakePhoto(label: string, color: string): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">
    <rect width="1200" height="900" fill="${color}"/>
    <rect x="150" y="300" width="900" height="300" rx="60" fill="#ffffff" opacity="0.15"/>
    <text x="600" y="470" font-family="Arial" font-size="72" font-weight="bold" fill="#ffffff" text-anchor="middle">${label}</text>
    <text x="600" y="560" font-family="Arial" font-size="36" fill="#ffffff" text-anchor="middle">GarageFlow · photo de démonstration</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer();
}

function daysAgo(days: number, hour = 9): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function inDays(days: number, hour = 18): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: DEMO_OWNER_EMAIL }, select: { garageId: true } });
  if (existing) {
    console.log("Suppression du garage démo existant…");
    await prisma.garage.delete({ where: { id: existing.garageId } });
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const garage = await prisma.garage.create({
    data: {
      name: "Garage Normandie Auto",
      address: "12 rue des Forges, 14000 Caen",
      phone: "02 31 00 00 00",
      email: "contact@normandie-auto.fr",
      siret: "812 345 678 00019",
      users: {
        create: [
          { email: DEMO_OWNER_EMAIL, passwordHash, firstName: "Philippe", lastName: "Lemaire", role: "OWNER" },
          { email: "claire@normandie-auto.fr", passwordHash, firstName: "Claire", lastName: "Dubois", role: "RECEPTION" },
          { email: "karim@normandie-auto.fr", passwordHash, firstName: "Karim", lastName: "Benali", role: "TECHNICIAN" },
          { email: "julien@normandie-auto.fr", passwordHash, firstName: "Julien", lastName: "Morel", role: "TECHNICIAN" },
        ],
      },
    },
    include: { users: true },
  });
  const byEmail = (e: string) => garage.users.find((u) => u.email === e)!;
  const owner = byEmail(DEMO_OWNER_EMAIL);
  const reception = byEmail("claire@normandie-auto.fr");
  const karim = byEmail("karim@normandie-auto.fr");
  const julien = byEmail("julien@normandie-auto.fr");
  const ctxOf = (u: { id: string; role: "OWNER" | "RECEPTION" | "TECHNICIAN" }): Ctx => ({ garageId: garage.id, userId: u.id, role: u.role, ip: "127.0.0.1" });
  const rec = ctxOf(reception);
  const tk = ctxOf(karim);
  const tj = ctxOf(julien);

  // --- Clients & véhicules ---------------------------------------------------
  const customersData = [
    { firstName: "Jean", lastName: "Martin", phone: "06 12 34 56 78", email: "jean.martin@example.fr", address: "4 allée des Tilleuls, 14000 Caen", notes: "Préfère être appelé le matin." },
    { firstName: "Sophie", lastName: "Leroux", phone: "06 98 76 54 32", email: "sophie.leroux@example.fr", address: "22 rue de Bayeux, 14000 Caen", notes: "" },
    { firstName: "Marc", lastName: "Fontaine", phone: "07 11 22 33 44", email: "", address: "Ferme des Écoles, 14370 Argences", notes: "Utilitaire pour son exploitation : disponibilité critique." },
    { firstName: "Nadia", lastName: "Haddad", phone: "06 55 44 33 22", email: "nadia.haddad@example.fr", address: "8 place Saint-Sauveur, 14000 Caen", notes: "" },
    { firstName: "Bernard", lastName: "Petit", phone: "02 31 99 88 77", email: "b.petit@example.fr", address: "3 chemin du Moulin, 14200 Hérouville-Saint-Clair", notes: "Client depuis 2015. Véhicule de collection en garage l'hiver." },
    { firstName: "Émilie", lastName: "Rousseau", phone: "06 20 30 40 50", email: "emilie.rousseau@example.fr", address: "17 rue Écuyère, 14000 Caen", notes: "" },
  ];
  const customers = [];
  for (const c of customersData) customers.push(await createCustomer(rec, c));
  const [martin, leroux, fontaine, haddad, petit, rousseau] = customers;

  const vehiclesData = [
    { customerId: martin.id, plate: "GH-123-KL", vin: "VF3LCYHZPJS123456", make: "Peugeot", model: "308", year: 2019, fuel: "DIESEL", mileage: 87400, color: "Gris" },
    { customerId: martin.id, plate: "FA-456-BC", vin: "VF1RFB00X61234567", make: "Renault", model: "Clio V", year: 2021, fuel: "PETROL", mileage: 32100, color: "Rouge" },
    { customerId: leroux.id, plate: "EZ-789-DE", vin: "WVWZZZAUZKW123456", make: "Volkswagen", model: "Golf 7", year: 2018, fuel: "DIESEL", mileage: 112300, color: "Noir" },
    { customerId: fontaine.id, plate: "DK-321-FG", vin: "VF7YCCMFC12345678", make: "Citroën", model: "Jumper", year: 2017, fuel: "DIESEL", mileage: 198750, color: "Blanc" },
    { customerId: haddad.id, plate: "GT-654-HJ", vin: "JTDKB20U123456789", make: "Toyota", model: "Yaris Hybride", year: 2022, fuel: "HYBRID", mileage: 21800, color: "Bleu" },
    { customerId: petit.id, plate: "BX-987-KM", vin: "", make: "Peugeot", model: "205 GTI", year: 1989, fuel: "PETROL", mileage: 143000, color: "Rouge" },
    { customerId: petit.id, plate: "FR-147-LN", vin: "VF30ABHZM12345678", make: "Peugeot", model: "3008", year: 2020, fuel: "DIESEL", mileage: 64500, color: "Gris" },
    { customerId: rousseau.id, plate: "GC-258-PQ", vin: "WDD2130041A123456", make: "Mercedes", model: "Classe A", year: 2020, fuel: "PETROL", mileage: 45900, color: "Blanc" },
    { customerId: rousseau.id, plate: "HB-369-RS", vin: "ZFA31200003123456", make: "Fiat", model: "500e", year: 2023, fuel: "ELECTRIC", mileage: 9800, color: "Vert" },
  ] as const;
  const vehicles = [];
  for (const v of vehiclesData) vehicles.push(await createVehicle(rec, { ...v }));
  const [p308, clio, golf, jumper, yaris, gti, p3008, classeA, fiat] = vehicles;

  // --- Dossier 1 : Peugeot 308 – validé partiellement, en réparation --------
  const wo1 = await createWorkOrder(rec, {
    customerId: martin.id,
    vehicleId: p308.id,
    mileageIn: 87650,
    reason: "Bruit au freinage + révision",
    symptoms: "Grincement au freinage à froid depuis deux semaines, surtout en marche arrière.",
    promisedAt: inDays(1, 17),
    technicianId: karim.id,
  });
  await addPhoto(tk, wo1.id, await fakePhoto("AVANT", "#3a4655"), { type: "FRONT", comment: "" });
  await addPhoto(tk, wo1.id, await fakePhoto("ARRIERE", "#2b3542"), { type: "REAR", comment: "" });
  await addPhoto(tk, wo1.id, await fakePhoto("GAUCHE", "#4b5563"), { type: "LEFT", comment: "" });
  await addPhoto(tk, wo1.id, await fakePhoto("DROITE", "#4b5563"), { type: "RIGHT", comment: "Rayure aile arrière droite" });
  await addPhoto(tk, wo1.id, await fakePhoto("TABLEAU DE BORD", "#1f2731"), { type: "DASHBOARD", comment: "87 650 km, aucun voyant" });
  const dmg = await addDamage(tk, wo1.id, { type: "SCRATCH", location: "Aile arrière droite", description: "Rayure 15 cm, non signalée par le client" });
  await addPhoto(tk, wo1.id, await fakePhoto("RAYURE", "#7c3006"), { type: "DAMAGE", comment: "", damageId: dmg.id });
  await applyAction(tk, wo1.id, "START_DIAGNOSIS");
  const f1 = await addFinding(tk, wo1.id, { title: "Plaquettes avant usées", category: "Freinage", description: "Épaisseur restante 2 mm, témoin d'usure atteint. Disques dans les tolérances.", urgency: "URGENT" });
  await addPhoto(tk, wo1.id, await fakePhoto("PLAQUETTES", "#c62828"), { type: "FINDING", comment: "Plaquette AVG", findingId: f1.id });
  const f2 = await addFinding(tk, wo1.id, { title: "Vidange à prévoir", category: "Entretien", description: "Dernière vidange à 72 000 km selon carnet.", urgency: "RECOMMENDED" });
  await addFinding(tk, wo1.id, { title: "Pneus arrière à 3 mm", category: "Pneumatiques", description: "Usure régulière, à surveiller d'ici l'hiver.", urgency: "WATCH" });
  for (const [key, status, comment] of [
    ["TIRE_FL", "OK", ""], ["TIRE_FR", "OK", ""], ["TIRE_RL", "WATCH", "3 mm"], ["TIRE_RR", "WATCH", "3 mm"],
    ["BRAKE_PADS_FRONT", "URGENT", "2 mm"], ["BRAKE_PADS_REAR", "OK", "7 mm"], ["BRAKE_DISCS_FRONT", "OK", ""], ["BRAKE_DISCS_REAR", "OK", ""],
    ["ENGINE_OIL", "RECOMMENDED", "Niveau bas, huile noire"], ["ENGINE_LEAKS", "OK", ""], ["ENGINE_COOLING", "OK", ""], ["ENGINE_BATTERY", "OK", "12,6 V"],
    ["VIS_WINDSHIELD", "OK", ""], ["VIS_WIPERS", "WATCH", "Balais durcis"], ["LIGHT_HEADLIGHTS", "OK", ""], ["LIGHT_INDICATORS", "OK", ""], ["LIGHT_BRAKE", "OK", ""],
  ] as const) {
    await updateChecklistItem(tk, wo1.id, { key, status, comment });
  }
  await addLine(tk, wo1.id, { title: "Remplacement plaquettes de frein avant", description: "Plaquettes Bosch + nettoyage étriers", partsPrice: "62,50", laborPrice: "83,33", vatRate: "20", urgency: "URGENT", findingId: f1.id });
  await addLine(tk, wo1.id, { title: "Vidange huile + filtre", description: "Huile 5W30 5 L + filtre à huile", partsPrice: "48,00", laborPrice: "43,67", vatRate: "20", urgency: "RECOMMENDED", findingId: f2.id });
  await addLine(tk, wo1.id, { title: "Balais d'essuie-glace avant", description: "", partsPrice: "29,90", laborPrice: "8,00", vatRate: "20", urgency: "WATCH" });
  const sent1 = await sendEstimate(rec, wo1.id, process.env.APP_URL ?? "http://localhost:3000");
  const lines1 = await prisma.estimateLine.findMany({ where: { estimateId: sent1.estimateId }, orderBy: { position: "asc" } });
  await submitDecision(
    sent1.token,
    { decisions: { [lines1[0].id]: "ACCEPTED", [lines1[1].id]: "ACCEPTED", [lines1[2].id]: "REFUSED" }, customerName: "Jean Martin", comment: "Les essuie-glaces, je les ferai moi-même." },
    { ip: "127.0.0.1", userAgent: "seed" },
  );
  await applyAction(tk, wo1.id, "START_REPAIR");

  // --- Dossier 2 : Golf – attente client ------------------------------------
  const wo2 = await createWorkOrder(rec, {
    customerId: leroux.id,
    vehicleId: golf.id,
    mileageIn: 112480,
    reason: "Voyant moteur allumé",
    symptoms: "Voyant orange fixe depuis 3 jours, légère perte de puissance en côte.",
    promisedAt: inDays(2, 12),
    technicianId: julien.id,
  });
  await addPhoto(tj, wo2.id, await fakePhoto("AVANT", "#3a4655"), { type: "FRONT", comment: "" });
  await addPhoto(tj, wo2.id, await fakePhoto("TABLEAU DE BORD", "#1f2731"), { type: "DASHBOARD", comment: "Voyant moteur allumé" });
  await applyAction(tj, wo2.id, "START_DIAGNOSIS");
  const f3 = await addFinding(tj, wo2.id, { title: "Vanne EGR encrassée", category: "Moteur", description: "Code P0401 – débit EGR insuffisant. Vanne grippée, nettoyage impossible.", urgency: "URGENT" });
  await addPhoto(tj, wo2.id, await fakePhoto("VANNE EGR", "#6c46b8"), { type: "FINDING", comment: "", findingId: f3.id });
  await addLine(tj, wo2.id, { title: "Remplacement vanne EGR", description: "Pièce d'origine + joint + effacement défaut", partsPrice: "245,00", laborPrice: "180,00", vatRate: "20", urgency: "URGENT", findingId: f3.id });
  await addLine(tj, wo2.id, { title: "Nettoyage admission", description: "Décalaminage collecteur", partsPrice: "35,00", laborPrice: "90,00", vatRate: "20", urgency: "RECOMMENDED" });
  await sendEstimate(rec, wo2.id, process.env.APP_URL ?? "http://localhost:3000");

  // --- Dossier 3 : Jumper – attente pièces ----------------------------------
  const wo3 = await createWorkOrder(rec, {
    customerId: fontaine.id,
    vehicleId: jumper.id,
    mileageIn: 199120,
    reason: "Embrayage qui patine",
    symptoms: "Régime qui monte sans accélération, odeur de brûlé en charge.",
    promisedAt: inDays(3, 18),
    technicianId: karim.id,
  });
  await applyAction(tk, wo3.id, "START_DIAGNOSIS");
  const f4 = await addFinding(tk, wo3.id, { title: "Embrayage HS", category: "Transmission", description: "Disque usé, volant moteur à contrôler au démontage.", urgency: "CRITICAL" });
  await addLine(tk, wo3.id, { title: "Kit embrayage + butée", description: "Kit complet Valeo", partsPrice: "410,00", laborPrice: "520,00", vatRate: "20", urgency: "CRITICAL", findingId: f4.id });
  const sent3 = await sendEstimate(rec, wo3.id, process.env.APP_URL ?? "http://localhost:3000");
  const lines3 = await prisma.estimateLine.findMany({ where: { estimateId: sent3.estimateId } });
  await submitDecision(sent3.token, { decisions: { [lines3[0].id]: "ACCEPTED" }, customerName: "Marc Fontaine", comment: "" }, { ip: "127.0.0.1", userAgent: "seed" });
  await applyAction(tk, wo3.id, "WAIT_PARTS");

  // --- Dossier 4 : Yaris – réceptionnée ce matin ----------------------------
  await createWorkOrder(rec, {
    customerId: haddad.id,
    vehicleId: yaris.id,
    mileageIn: 21950,
    reason: "Révision 2 ans",
    symptoms: "",
    promisedAt: inDays(0, 17),
    technicianId: null,
  });

  // --- Dossier 5 : 3008 – contrôle final ------------------------------------
  const wo5 = await createWorkOrder(rec, {
    customerId: petit.id,
    vehicleId: p3008.id,
    mileageIn: 64720,
    reason: "Remplacement batterie",
    symptoms: "Démarrages difficiles le matin.",
    promisedAt: inDays(0, 16),
    technicianId: julien.id,
  });
  await applyAction(tj, wo5.id, "START_DIAGNOSIS");
  const f5 = await addFinding(tj, wo5.id, { title: "Batterie faible", category: "Électricité", description: "Test : 11,8 V au repos, 9,2 V au démarrage.", urgency: "URGENT" });
  await addLine(tj, wo5.id, { title: "Batterie 70 Ah AGM + pose", description: "", partsPrice: "165,00", laborPrice: "25,00", vatRate: "20", urgency: "URGENT", findingId: f5.id });
  const sent5 = await sendEstimate(rec, wo5.id, process.env.APP_URL ?? "http://localhost:3000");
  const lines5 = await prisma.estimateLine.findMany({ where: { estimateId: sent5.estimateId } });
  await submitDecision(sent5.token, { decisions: { [lines5[0].id]: "ACCEPTED" }, customerName: "Bernard Petit", comment: "" }, { ip: "127.0.0.1", userAgent: "seed" });
  await applyAction(tj, wo5.id, "START_REPAIR");
  await applyAction(tj, wo5.id, "FINISH_REPAIR");

  // --- Dossier 6 : Classe A – prête -----------------------------------------
  const wo6 = await createWorkOrder(rec, {
    customerId: rousseau.id,
    vehicleId: classeA.id,
    mileageIn: 46010,
    reason: "Pneus avant",
    symptoms: "",
    promisedAt: inDays(0, 12),
    technicianId: karim.id,
  });
  await applyAction(tk, wo6.id, "START_DIAGNOSIS");
  const f6 = await addFinding(tk, wo6.id, { title: "Pneus avant à la limite", category: "Pneumatiques", description: "1,8 mm AVG, 2,0 mm AVD.", urgency: "URGENT" });
  await addLine(tk, wo6.id, { title: "2 pneus 205/55 R17 + équilibrage", description: "Michelin Primacy 4", partsPrice: "238,00", laborPrice: "40,00", vatRate: "20", urgency: "URGENT", findingId: f6.id });
  const sent6 = await sendEstimate(rec, wo6.id, process.env.APP_URL ?? "http://localhost:3000");
  const lines6 = await prisma.estimateLine.findMany({ where: { estimateId: sent6.estimateId } });
  await submitDecision(sent6.token, { decisions: { [lines6[0].id]: "ACCEPTED" }, customerName: "Émilie Rousseau", comment: "" }, { ip: "127.0.0.1", userAgent: "seed" });
  await applyAction(tk, wo6.id, "START_REPAIR");
  await applyAction(tk, wo6.id, "FINISH_REPAIR");
  await saveFinalCheck(tk, wo6.id, { roadTest: "on", fluids: "on", warningLights: "on", toolsRemoved: "on", cleaned: "on", comment: "RAS" });
  await applyAction(tk, wo6.id, "MARK_READY");

  // --- Dossier 7 : Clio – clôturé (historique) ------------------------------
  const wo7 = await createWorkOrder(rec, {
    customerId: martin.id,
    vehicleId: clio.id,
    mileageIn: 31800,
    reason: "Révision annuelle",
    symptoms: "",
    promisedAt: daysAgo(20, 17),
    technicianId: julien.id,
  });
  await applyAction(tj, wo7.id, "START_DIAGNOSIS");
  await addLine(tj, wo7.id, { title: "Révision constructeur", description: "Vidange, filtres huile/air/habitacle, contrôle 30 points", partsPrice: "95,00", laborPrice: "85,00", vatRate: "20", urgency: "RECOMMENDED" });
  const sent7 = await sendEstimate(rec, wo7.id, process.env.APP_URL ?? "http://localhost:3000");
  const lines7 = await prisma.estimateLine.findMany({ where: { estimateId: sent7.estimateId } });
  await submitDecision(sent7.token, { decisions: { [lines7[0].id]: "ACCEPTED" }, customerName: "Jean Martin", comment: "" }, { ip: "127.0.0.1", userAgent: "seed" });
  await applyAction(tj, wo7.id, "START_REPAIR");
  await applyAction(tj, wo7.id, "FINISH_REPAIR");
  await saveFinalCheck(tj, wo7.id, { roadTest: "on", fluids: "on", warningLights: "on", toolsRemoved: "on", cleaned: "on", comment: "" });
  await applyAction(tj, wo7.id, "MARK_READY");
  await deliverVehicle(rec, wo7.id, { mileageOut: 31812, comment: "Prochaine révision à 47 000 km" });
  await applyAction(ctxOf(owner), wo7.id, "CLOSE");
  // Antidater le dossier clôturé pour un historique réaliste.
  await prisma.workOrder.update({ where: { id: wo7.id }, data: { createdAt: daysAgo(21), deliveredAt: daysAgo(20, 17), closedAt: daysAgo(20, 18) } });
  await prisma.timelineEvent.updateMany({ where: { workOrderId: wo7.id }, data: { createdAt: daysAgo(21, 10) } });

  // --- Dossier 8 : 205 GTI – annulé -----------------------------------------
  const wo8 = await createWorkOrder(rec, {
    customerId: petit.id,
    vehicleId: gti.id,
    mileageIn: 143050,
    reason: "Devis restauration carrosserie",
    symptoms: "",
    promisedAt: null,
    technicianId: null,
  });
  await applyAction(rec, wo8.id, "CANCEL");
  void fiat;

  const counts = {
    clients: await prisma.customer.count({ where: { garageId: garage.id } }),
    véhicules: await prisma.vehicle.count({ where: { garageId: garage.id } }),
    dossiers: await prisma.workOrder.count({ where: { garageId: garage.id } }),
    photos: await prisma.photo.count({ where: { garageId: garage.id } }),
  };
  console.log("Seed terminé :", counts);
  console.log(`Connexion : ${DEMO_OWNER_EMAIL} / ${DEMO_PASSWORD} (gérant)`);
  console.log(`            claire@normandie-auto.fr (réception), karim@ / julien@normandie-auto.fr (techniciens), même mot de passe`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
