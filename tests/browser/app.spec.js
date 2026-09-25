import { liveTransport } from "./transport.js";
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { monday, parisToday, datePlus } from "../../src/availability.js";
const fixture = fs.existsSync(".env.e2e")
  ? JSON.parse(fs.readFileSync(".env.e2e", "utf8"))
  : null;
test("auth responsive et invitation conservée", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?invite=10000000-0000-4000-8000-000000000000");
  await expect(
    page.getByRole("heading", { name: "On se retrouve ?" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Créer un compte", exact: true })
    .click();
  await expect(page.getByLabel("Ton prénom ou pseudo")).toBeVisible();
  await expect(
    page.getByText("Ton invitation sera conservée après la connexion."),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/auth-mobile.png",
    fullPage: true,
  });
});
test("parcours réel à deux utilisateurs : auth, groupe, invitation, agenda, realtime, absence", async ({
  page,
  browser,
}) => {
  test.skip(
    !fixture,
    "Créer deux comptes de test confirmés et renseigner .env.e2e (voir README).",
  );
  const { users, password } = fixture;
  await liveTransport(page.context());
  const login = async (p, u) => {
    await p.goto("/");
    await p.getByLabel("Adresse e-mail").fill(u.email);
    await p.getByLabel("Mot de passe", { exact: true }).fill(password);
    await p.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(
      p.getByRole("heading", { name: new RegExp("Bonjour, " + u.name) }),
    ).toBeVisible();
  };
  page.on("requestfailed", (r) =>
    console.log("NETWORK", new URL(r.url()).hostname, r.failure()?.errorText),
  );
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, users[0]);
  await page.getByRole("button", { name: "◎ Groupes", exact: true }).click();
  await page
    .getByRole("button", { name: "+ Créer un groupe", exact: true })
    .click();
  await page.getByLabel("Nom du groupe").fill("Les Potos E2E");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Les Potos E2E" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Créer un lien", exact: true })
    .click();
  await expect(page.locator('[data-action="copy-invite"]')).toBeVisible();
  if (await page.locator("dialog[open]").count())
    await page.getByRole("button", { name: "Fermer", exact: true }).click();
  // Retrieve this owner's single-use invitation through the real RLS API.
  const env = Object.fromEntries(
    fs
      .readFileSync(".env.local", "utf8")
      .trim()
      .split("\n")
      .map((s) => s.split("=")),
  );
  const api = createClient(
    env.VITE_SUPABASE_URL,
    env.VITE_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false } },
  );
  const auth = await api.auth.signInWithPassword({
    email: users[0].email,
    password,
  });
  expect(auth.error).toBeNull();
  const { data: invitations, error } = await api
    .from("invitations")
    .select("*");
  expect(error).toBeNull();
  const invitation = invitations.find((i) => !i.used_at && !i.revoked);
  expect(invitation).toBeTruthy();
  const context = await browser.newContext();
  await liveTransport(context);
  const bob = await context.newPage();
  await bob.goto("/?invite=" + invitation.token);
  await bob.getByLabel("Adresse e-mail").fill(users[1].email);
  await bob.getByLabel("Mot de passe", { exact: true }).fill(password);
  await bob.getByRole("button", { name: "Se connecter", exact: true }).click();
  await bob
    .getByRole("button", { name: "Rejoindre le groupe", exact: true })
    .click();
  await expect(
    bob.getByRole("heading", { name: "Les Potos E2E" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "◈ Accueil", exact: true }).click();
  await page
    .getByRole("button", { name: "+ Ajouter un cours", exact: true })
    .click();
  await page.getByLabel("Matière", { exact: true }).fill("Mathématiques E2E");
  await page.getByLabel("À partir du").fill("2026-01-01");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  const nextMonday = datePlus(monday(parisToday()), 7);
  await page.getByRole("button", { name: "→", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Mathématiques E2E/ }),
  ).toBeVisible();
  await bob.getByRole("button", { name: "◈ Accueil", exact: true }).click();
  await bob.getByRole("button", { name: "→", exact: true }).click();
  await expect(
    bob.getByRole("button", { name: /Mathématiques E2E/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Mathématiques E2E/ }).click();
  await page.getByRole("button", { name: "Prof absent", exact: true }).click();
  await expect(
    bob.getByRole("button", { name: "Confirmer", exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await bob.getByRole("button", { name: "Confirmer", exact: true }).click();
  await expect(page.locator(".course.good")).toContainText(
    "Mathématiques E2E",
    { timeout: 15000 },
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
  });
  // Leave: confirmation must be revoked and cross-group data disappear.
  await bob.getByRole("button", { name: "◎ Groupes", exact: true }).click();
  bob.once("dialog", (d) => d.accept());
  await bob.getByRole("button", { name: "Quitter", exact: true }).click();
  await expect(
    bob.getByText("Aucun groupe sélectionné.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".course.good")).toHaveCount(0, { timeout: 15000 });
  expect(errors).toEqual([]);
  await context.close();
  await api.auth.signOut();
});
