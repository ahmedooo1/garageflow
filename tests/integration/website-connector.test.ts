import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkWebsite, createGuardedFetch, robotsAllows } from "@/server/growth/website";

/**
 * Connecteur « site web » exercé sur une vraie pile HTTP (serveur local, vraies
 * sockets). Le nom « garage-test.example » est résolu vers 127.0.0.1 par un
 * résolveur de test ; tout le reste (robots.txt, redirections, délais, taille,
 * contrôle d'adresse à la connexion) est le code de production.
 */

type Handler = (req: IncomingMessage, res: ServerResponse) => void;
let server: Server;
let port = 0;
let handler: Handler = (_req, res) => res.end();

beforeAll(async () => {
  server = createServer((req, res) => handler(req, res));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const HOST = "garage-test.example";
const site = () => `http://${HOST}:${port}/`;
// Résolveur vu par la vérification d'URL : un nom public.
const publicResolve = async () => ["93.184.216.34"];
// Résolution réelle au moment de la connexion : vers le serveur local, autorisé pour le test seulement.
const toLocal = (_host: string, cb: (err: Error | null, list: { address: string; family: number }[]) => void) => cb(null, [{ address: "127.0.0.1", family: 4 }]);
const testFetch = createGuardedFetch({ lookup: toLocal, isAllowed: (a) => a === "127.0.0.1" });
const opts = () => ({ fetchImpl: testFetch, resolve: publicResolve, policy: { allowedPorts: [String(port)] }, timeoutMs: 1500 });

function routes(map: Record<string, (res: ServerResponse) => void>): Handler {
  return (req, res) => {
    const route = map[req.url ?? "/"];
    if (route) route(res);
    else {
      res.statusCode = 404;
      res.end("introuvable");
    }
  };
}
const html = (body: string) => (res: ServerResponse) => {
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(body);
};

describe("protection SSRF à la connexion", () => {
  it("refuse localhost avec la vraie résolution DNS", async () => {
    await expect(createGuardedFetch()(`http://localhost:${port}/`)).rejects.toThrow(/interne/);
  });

  it("refuse un nom public qui se résout en adresse interne au moment de la connexion (rebinding)", async () => {
    handler = (_req, res) => html("<p>ne doit pas être lu</p>")(res);
    // La vérification préalable voit une IP publique ; la connexion, elle, obtient 127.0.0.1.
    const rebinding = createGuardedFetch({ lookup: toLocal });
    const r = await checkWebsite(site(), { fetchImpl: rebinding, resolve: publicResolve, policy: { allowedPorts: [String(port)] } });
    expect(r.signals.reachable).toBe(false);
    expect(r.signals.error).toMatch(/interne/);
  });

  it("refuse une redirection vers une adresse IP interne", async () => {
    handler = routes({ "/": (res) => res.writeHead(302, { location: `http://127.0.0.1:${port}/admin` }).end() });
    const r = await checkWebsite(site(), opts());
    expect(r.signals.reachable).toBe(false);
    expect(r.signals.error).toMatch(/interne/);
  });

  it("refuse les ports non standards et les identifiants dans l'URL", async () => {
    const r = await checkWebsite(`http://${HOST}:${port}/`, { fetchImpl: testFetch, resolve: publicResolve });
    expect(r.signals.error).toMatch(/port/);
    const r2 = await checkWebsite(`http://user:pass@${HOST}/`, { fetchImpl: testFetch, resolve: publicResolve });
    expect(r2.signals.error).toMatch(/identifiants/);
  });
});

describe("robots.txt", () => {
  it("respecte un Disallow global", async () => {
    handler = routes({ "/robots.txt": (res) => res.end("User-agent: *\nDisallow: /\n"), "/": html("<p>accueil</p>") });
    const r = await checkWebsite(site(), opts());
    expect(r.signals.error).toMatch(/robots\.txt/);
  });

  it("s'abstient si robots.txt répond 5xx, explore si 404", async () => {
    handler = routes({ "/robots.txt": (res) => res.writeHead(503).end(), "/": html("<p>accueil</p>") });
    expect((await checkWebsite(site(), opts())).signals.error).toMatch(/robots\.txt indisponible/);
    handler = routes({ "/": html('<a href="mailto:atelier@garage-test.example">x</a>') });
    const r = await checkWebsite(site(), opts());
    expect(r.signals.reachable).toBe(true);
    expect(r.contacts.email).toBe("atelier@garage-test.example");
  });

  it("applique les groupes et la règle la plus longue (RFC 9309)", () => {
    expect(robotsAllows("User-agent: *\nUser-agent: Googlebot\nDisallow: /")).toBe(false);
    expect(robotsAllows("User-agent: *\nDisallow: /\n\nUser-agent: GarageFlow-prospection\nAllow: /")).toBe(true);
    expect(robotsAllows("User-agent: GarageFlow\nDisallow: /\n\nUser-agent: *\nAllow: /")).toBe(false);
    expect(robotsAllows("User-agent: *\nDisallow: /\nAllow: /$")).toBe(true);
    expect(robotsAllows("User-agent: *\nDisallow: /*.php$", "/")).toBe(true);
    expect(robotsAllows("User-agent: *\nDisallow:")).toBe(true);
  });
});

describe("redirections, délais, taille", () => {
  it("suit jusqu'à 3 redirections et garde l'URL finale comme source", async () => {
    handler = routes({
      "/": (res) => res.writeHead(301, { location: "/fr" }).end(),
      "/fr": (res) => res.writeHead(302, { location: "/fr/accueil" }).end(),
      "/fr/accueil": html("<p>Prise de rendez-vous en ligne</p>"),
    });
    const r = await checkWebsite(site(), opts());
    expect(r.signals.reachable).toBe(true);
    expect(r.signals.onlineBooking).toBe(true);
    expect(r.signals.checkedUrl).toBe(`http://${HOST}:${port}/fr/accueil`);
  });

  it("abandonne une boucle de redirections", async () => {
    handler = routes({ "/": (res) => res.writeHead(302, { location: "/" }).end() });
    expect((await checkWebsite(site(), opts())).signals.error).toMatch(/redirections/);
  });

  it("abandonne un serveur qui ne répond pas, dans le délai", async () => {
    handler = () => undefined; // aucune réponse
    const started = Date.now();
    const r = await checkWebsite(site(), opts());
    expect(r.signals.reachable).toBe(false);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it("ne lit que les premiers 512 Ko d'une page énorme", async () => {
    const big = "<p>" + "x".repeat(4 * 1024 * 1024) + '</p><a href="mailto:trop-loin@garage-test.example">x</a>';
    handler = routes({ "/": html(big) });
    const r = await checkWebsite(site(), opts());
    expect(r.signals.reachable).toBe(true);
    expect(r.contacts.email).toBe("");
  });

  it("ignore un contenu qui n'est pas une page", async () => {
    handler = routes({ "/": (res) => res.writeHead(200, { "content-type": "application/pdf" }).end("%PDF") });
    expect((await checkWebsite(site(), opts())).signals.error).toMatch(/non HTML/);
  });

  it("s'identifie avec un agent explicite", async () => {
    let ua = "";
    handler = (req, res) => {
      ua = req.headers["user-agent"] ?? "";
      html("<p>ok</p>")(res);
    };
    await checkWebsite(site(), opts());
    expect(ua).toMatch(/^GarageFlow-prospection\/1\.0 \(\+https?:\/\/.+\/confidentialite#prospection\)$/);
  });
});

describe("HTTPS", () => {
  it("vérifie les certificats : un certificat auto-signé est refusé", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gf-tls-"));
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(dir, "k.pem"), "-out", join(dir, "c.pem"), "-days", "1", "-subj", `/CN=${HOST}`], { stdio: "ignore" });
    const tls = createHttpsServer({ key: readFileSync(join(dir, "k.pem")), cert: readFileSync(join(dir, "c.pem")) }, (_req, res) => html("<p>ok</p>")(res));
    await new Promise<void>((r) => tls.listen(0, "127.0.0.1", r));
    const tlsPort = (tls.address() as AddressInfo).port;
    try {
      const r = await checkWebsite(`https://${HOST}:${tlsPort}/`, { fetchImpl: testFetch, resolve: publicResolve, policy: { allowedPorts: [String(tlsPort)] }, timeoutMs: 1500 });
      expect(r.signals.reachable).toBe(false);
    } finally {
      await new Promise<void>((r) => tls.close(() => r()));
    }
  });
});
