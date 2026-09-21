import { Archivo, IBM_Plex_Mono } from "next/font/google";

/**
 * Typographies du site public uniquement. L'application conserve la pile
 * système : ces polices ne sont chargées que sur les pages publiques.
 *
 * Archivo : grotesque à axe de chasse variable, proche de la signalétique
 * industrielle quand on l'élargit. IBM Plex Mono : références, numéros de
 * dossier et horodatages, comme sur un ordre de réparation.
 */
export const displayFont = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
  variable: "--font-display",
});

export const techFont = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-tech",
});

export const publicFontVars = `${displayFont.variable} ${techFont.variable}`;
