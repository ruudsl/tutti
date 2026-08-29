---
name: nieuwe-route
description: Een API-eindpunt toevoegen of wijzigen in de Tutti-backend. Gebruik dit voor elke nieuwe router of route-handler, inclusief het aanhaken in de frontend.
---

# Een route bouwen

## Het skelet

```ts
import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { cacheMiddleware, cacheInvalidator } from '../middleware/cache';
import logger from '../utils/logger';

const router = Router();

const CACHE_PATH = '/api/dingen';

const aanmaakSchema = z.object({
  naam: z.string().min(1).max(200),
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

router.get(
  '/',
  authenticateToken,
  cacheMiddleware({ ttlSeconds: 300 }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const rijen = db
      .prepare('SELECT * FROM dingen WHERE association_id = ? ORDER BY datum DESC LIMIT ? OFFSET ?')
      .all(req.user!.associationId, limiet, offset);
    res.json(rijen);
  }),
);

export default router;
```

Aanhaken in `backend/src/index.ts`: `app.use('/api/dingen', dingenRoutes);`.
De volgorde telt - een specifieker pad staat vóór een algemener pad.

## De vaste eisen

1. **`association_id` in élke query.** Er is geen middleware die dat voor je
   doet. Een `WHERE id = ?` zonder vereniging geeft een lid van vereniging A
   toegang tot een rij van vereniging B.
2. **Validatie met Zod**, via `validate(schema)` of `validate(schema, 'query')`.
   Niet met handgeschreven `if (!req.body.naam)`.
3. **`asyncHandler` + `ApiError`.** Geen eigen `try/catch` met `res.status(500)`;
   dat gaat om de centrale foutafhandeling en het logboek heen.
4. **Autorisatie met middleware**, niet in de handler: `requireRole('admin')`,
   `requireMinRole('conductor')`, `requireSuperAdmin`.
5. **Hoort de route bij een module?** Dan `requireModule('sleutel')` erachter -
   die geeft 404, geen 403. Zie de skill `nieuwe-module`.
6. **Lijsten pagineren.** `LIMIT`/`OFFSET` met een bovengrens; een eindpunt dat
   alles teruggeeft werkt tot een vereniging groeit.
7. **Uitgaande HTTP** gaat via `backend/src/services/`, niet rechtstreeks uit
   een route, en heeft een tijdslimiet plus een stroomonderbreker via
   `beschermd(...)` uit `utils/veerkracht.ts`. Herkansen mag alleen als de
   aanroep herhaalbaar is; iets versturen krijgt `pogingen: 1`. Zie
   `docs/VEERKRACHT.md`.

## Cache

- `cacheMiddleware` varieert standaard op vereniging.
- Geeft de route **gegevens van de ingelogde gebruiker** terug (`/my-*`), dan is
  `varyByUser: true` verplicht. Zonder dat krijgt lid A het antwoord van lid B.
- Elke schrijfactie ruimt de cache op met `cacheInvalidator(CACHE_PATH)`, anders
  ziet de gebruiker zijn eigen wijziging niet.

## Logboek

Wijzigingen die iemand later moet kunnen terugvinden krijgen
`logAuditEvent(...)` uit `routes/audit-logs.ts`: wie, wat, welk soort ding,
welk id. Zet er geen wachtwoorden, tokens of volledige persoonsgegevens in.

## De frontend

- Alles gaat via `frontend/src/api/`. **Geen kale `fetch` met een token** - die
  gaat langs de 401-afhandeling en de gebruiker blijft op een leeg scherm staan.
- Serverstatus via React Query; invalideer de bijbehorende sleutel na een
  mutatie.
- Nieuwe zichtbare tekst in `frontend/src/locales/nl.json`, `en.json` én
  `de.json`.

## Testen

In `backend/src/__tests__/routes/`, met een naam die het gedrag beschrijft.
Gebruik `createTestEnvironment()` uit `testUtils.ts`.

Minimaal:

- het gelukte pad;
- zonder token → 401;
- met een rol die het niet mag → 403;
- **met een gebruiker van een andere vereniging → niet gevonden of geen
  toegang** (dit is de test die er het vaakst niet is);
- ongeldige invoer → 400;
- met de module uit → 404 (als de route bij een module hoort).

## Checklist

- [ ] `association_id` in elke query
- [ ] Zod-schema en `validate`
- [ ] `asyncHandler` + `ApiError`
- [ ] Rol- en modulecontrole als middleware
- [ ] Paginering op lijsten
- [ ] Cache-invalidatie bij schrijven, `varyByUser` bij persoonlijke gegevens
- [ ] Auditlogregel bij wijzigingen die ertoe doen
- [ ] Gemount in `index.ts`
- [ ] Frontend via `src/api/`, vertalingen in drie talen
- [ ] Tests inclusief de verenigingsgrens
- [ ] `docs/API.md` bijgewerkt
