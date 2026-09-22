import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    /*
     * Les aperçus de la page d'accueil sont des copies d'écran : de larges
     * aplats et beaucoup de texte fin. AVIF les compresse nettement mieux que
     * WebP à qualité égale, et les navigateurs qui l'ignorent reçoivent le WebP.
     * L'ordre compte : Next propose le premier format accepté par le client.
     */
    formats: ["image/avif", "image/webp"],
    /* 68 pour les aperçus, 75 reste le défaut de Next pour tout le reste. */
    qualities: [68, 75],
  },
};

export default nextConfig;
