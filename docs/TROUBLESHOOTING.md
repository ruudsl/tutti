# Probleemoplossing

Deze handleiding helpt je bij het oplossen van veelvoorkomende problemen met Tutti.

## Inhoudsopgave

- [Databaseproblemen](#databaseproblemen)
- [Upload Problemen](#upload-problemen)
- [E-mail Problemen](#e-mail-problemen)
- [SSO Configuratie](#sso-configuratie)
- [Prestatieproblemen](#prestatieproblemen)
- [Docker Problemen](#docker-problemen)
- [Veelvoorkomende Foutmeldingen](#veelvoorkomende-foutmeldingen)

---

## Databaseproblemen

### "Database is locked"

**Oorzaak:** SQLite kan vastlopen bij gelijktijdige schrijfbewerkingen.

**Oplossingen:**

1. **Herstart de backend:**
   ```bash
   docker compose restart backend
   ```

2. **Controleer op vastgelopen processen:**
   ```bash
   docker compose exec backend ps aux | grep node
   ```

3. **Forceer herstart:**
   ```bash
   docker compose down
   docker compose up -d
   ```

### "SQLITE_CORRUPT: database disk image is malformed"

**Oorzaak:** De database is beschadigd, vaak door een onverwachte shutdown.

**Oplossingen:**

1. **Controleer integriteit:**
   ```bash
   docker compose exec backend sqlite3 /app/data/tutti.db "PRAGMA integrity_check;"
   ```

2. **Herstel van backup:**
   ```bash
   docker compose down
   ./scripts/restore.sh /pad/naar/backup.tar.gz --docker
   docker compose up -d
   ```

3. **Probeer te repareren (experimenteel):**
   ```bash
   docker compose exec backend sqlite3 /app/data/tutti.db ".recover" | sqlite3 /app/data/tutti-recovered.db
   ```

### "Database connection failed"

**Controleer:**

1. **Bestaat het databasebestand?**
   ```bash
   docker compose exec backend ls -la /app/data/
   ```

2. **Zijn de rechten correct?**
   ```bash
   docker compose exec backend chmod 664 /app/data/tutti.db
   ```

3. **Is er genoeg schijfruimte?**
   ```bash
   df -h
   ```

---

## Upload Problemen

### "File too large"

**Standaard limiet:** 25 MB per bestand.

**Verhogen:**

1. Pas de omgevingsvariabele aan:
   ```env
   MAX_FILE_SIZE=52428800  # 50 MB in bytes
   ```

2. Herstart de applicatie:
   ```bash
   docker compose restart backend
   ```

### "Invalid file type"

**Toegestane types:**
- Bladmuziek: PDF
- Audio: MP3, WAV, M4A
- Bulk: ZIP

**Controleer:**
- Is het bestand daadwerkelijk een PDF? (niet hernoemd van ander formaat)
- Is het bestand niet corrupt?

### "Upload failed" zonder specifieke fout

**Stappen:**

1. **Controleer backend logs:**
   ```bash
   docker compose logs backend --tail=50
   ```

2. **Controleer schijfruimte:**
   ```bash
   df -h
   ```

3. **Controleer upload directory:**
   ```bash
   docker compose exec backend ls -la /app/uploads/
   ```

4. **Controleer rechten:**
   ```bash
   docker compose exec backend chmod -R 755 /app/uploads/
   ```

### ZIP-upload werkt niet

**Controleer:**

1. **Is de ZIP geldig?**
   ```bash
   unzip -t mijnbestand.zip
   ```

2. **Bevat de ZIP PDF-bestanden?**
   De ZIP moet PDF-bestanden bevatten in de root of in submappen.

3. **Is de ZIP niet te groot?**
   De totale gedecomprimeerde grootte heeft ook een limiet.

---

## E-mail Problemen

### E-mails worden niet verzonden

**Controleer SMTP-configuratie:**

```bash
# Bekijk huidige configuratie (verberg wachtwoord)
docker compose exec backend env | grep -E "(SMTP|EMAIL)" | grep -v PASSWORD
```

**Benodigde variabelen:**

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=true
SMTP_USER=noreply@example.com
SMTP_PASSWORD=your-password
EMAIL_FROM=Tutti <noreply@example.com>
```

### "SMTP connection failed"

**Stappen:**

1. **Test verbinding:**
   ```bash
   nc -zv smtp.example.com 587
   ```

2. **Controleer firewall:**
   ```bash
   sudo ufw status
   ```

3. **Controleer SSL/TLS:**
   - Poort 587 gebruikt meestal STARTTLS
   - Poort 465 gebruikt meestal SSL/TLS

### E-mails komen in spam terecht

**Oplossingen:**

1. **Configureer SPF-record** in je DNS:
   ```
   v=spf1 include:_spf.google.com ~all
   ```

2. **Configureer DKIM** (indien je provider dit ondersteunt)

3. **Gebruik een transactionele e-mailservice:**
   - SendGrid
   - Mailgun
   - Amazon SES

### Wachtwoord-reset e-mail komt niet aan

**Controleer:**

1. Is SMTP correct geconfigureerd?
2. Staat het e-mailadres correct in de database?
3. Check de spam-folder
4. Bekijk de backend logs voor fouten:
   ```bash
   docker compose logs backend | grep -i mail
   ```

---

## SSO Configuratie

### Microsoft SSO werkt niet

**Vereiste configuratie:**

```env
# Azure Entra ID (voorheen Azure AD)
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-client-secret
AZURE_TENANT_ID=your-tenant-id
AZURE_REDIRECT_URI=https://tutti.example.com/api/auth/azure/callback
```

**Controleer in Azure Portal:**

1. **App Registration** bestaat en is actief
2. **Redirect URI** is correct geconfigureerd
3. **Client secret** is niet verlopen
4. **API permissions** zijn correct ingesteld:
   - `User.Read`
   - `openid`
   - `profile`
   - `email`

### "Invalid redirect URI"

**Oorzaken:**

1. **Mismatch tussen configuratie en Azure:**
   De redirect URI in je `.env` moet exact overeenkomen met die in Azure Portal.

2. **HTTP vs HTTPS:**
   Azure vereist HTTPS voor productie.

3. **Trailing slash:**
   `/callback` is anders dan `/callback/`

### "User not found" na SSO login

**Mogelijke oorzaken:**

1. **Gebruiker bestaat niet** in Tutti
   - Maak de gebruiker aan met hetzelfde e-mailadres
   - Of configureer automatische gebruikersaanmaak

2. **E-mailadres mismatch:**
   - Azure-email moet exact overeenkomen met Tutti-email

### Automatische gebruikerssynchronisatie werkt niet

**Controleer:**

1. Is Entra Sync geconfigureerd?
   ```bash
   docker compose exec backend env | grep AZURE
   ```

2. Heeft de app voldoende permissions?
   - `User.Read.All` (voor sync)

3. Bekijk sync logs:
   ```bash
   docker compose logs backend | grep -i entra
   ```

---

## Prestatieproblemen

### Pagina's laden langzaam

**Backend diagnostiek:**

1. **Controleer health endpoint:**
   ```bash
   curl http://localhost:3001/api/health
   ```

2. **Bekijk resource gebruik:**
   ```bash
   docker stats
   ```

3. **Controleer database queries:**
   - Schakel query logging in via `LOG_LEVEL=debug`

**Frontend diagnostiek:**

1. Open browser DevTools (F12)
2. Ga naar Network tab
3. Identificeer langzame requests

### Database queries zijn traag

**Optimalisaties:**

1. **Controleer indices:**
   ```bash
   docker compose exec backend sqlite3 /app/data/tutti.db ".indices"
   ```

2. **Analyseer database:**
   ```bash
   docker compose exec backend sqlite3 /app/data/tutti.db "ANALYZE;"
   ```

3. **Vacuum database:**
   ```bash
   docker compose exec backend sqlite3 /app/data/tutti.db "VACUUM;"
   ```

### Hoog geheugengebruik

**Controleer:**

1. **Container statistieken:**
   ```bash
   docker stats tutti-backend
   ```

2. **Verhoog memory limit** in `docker-compose.prod.yml`:
   ```yaml
   deploy:
     resources:
       limits:
         memory: 2G
   ```

3. **Controleer op memory leaks:**
   ```bash
   docker compose exec backend node --expose-gc -e "global.gc(); console.log(process.memoryUsage())"
   ```

### Veel gelijktijdige gebruikers

**Overwegingen:**

- SQLite is single-writer; overweeg bij hoge load een andere database
- Configureer connection pooling
- Gebruik een reverse proxy met caching (Nginx, Cloudflare)

---

## Docker Problemen

### Containers starten niet

**Diagnostiek:**

1. **Bekijk status:**
   ```bash
   docker compose ps -a
   ```

2. **Bekijk logs:**
   ```bash
   docker compose logs
   ```

3. **Controleer configuratie:**
   ```bash
   docker compose config
   ```

### "Port already in use"

**Oplossingen:**

1. **Vind het proces:**
   ```bash
   sudo lsof -i :3001
   sudo lsof -i :5173
   ```

2. **Stop het proces:**
   ```bash
   sudo kill -9 <PID>
   ```

3. **Of wijzig de poort** in `docker-compose.yml`

### "Volume mount failed"

**Controleer:**

1. **Bestaan de directories?**
   ```bash
   ls -la /pad/naar/volumes/
   ```

2. **Zijn de rechten correct?**
   ```bash
   sudo chown -R $USER:$USER /pad/naar/volumes/
   ```

### Docker gebruikt te veel schijfruimte

**Opschonen:**

```bash
# Verwijder ongebruikte images, containers, volumes
docker system prune -a --volumes

# Bekijk schijfgebruik
docker system df
```

### SSL-certificaten vernieuwen niet

**Traefik/Let's Encrypt:**

1. **Controleer Traefik logs:**
   ```bash
   docker compose logs traefik
   ```

2. **Forceer vernieuwing:**
   ```bash
   docker compose exec traefik rm /letsencrypt/acme.json
   docker compose restart traefik
   ```

3. **Controleer rate limits:**
   Let's Encrypt heeft rate limits. Wacht indien nodig.

---

## Veelvoorkomende Foutmeldingen

### "JWT_SECRET is required in production"

**Oplossing:**

Stel een sterk JWT-geheim in:

```bash
# Genereer geheim
openssl rand -base64 64

# Voeg toe aan .env
JWT_SECRET=je-gegenereerde-geheim
```

### "Invalid token" of "Token expired"

**Oorzaken:**

1. **Token is verlopen** — Log opnieuw in
2. **JWT_SECRET is gewijzigd** — Alle tokens zijn dan ongeldig
3. **Clock skew** — Synchroniseer servertijd

**Oplossing voor gebruikers:**
Log uit en log opnieuw in.

### "Association not found"

**Oorzaken:**

1. De organisatie bestaat niet in de database
2. De gebruiker is niet gekoppeld aan een organisatie
3. JWT bevat een ongeldige association_id

**Controleer:**

```bash
docker compose exec backend sqlite3 /app/data/tutti.db "SELECT * FROM associations;"
```

### "Rate limit exceeded"

**Betekenis:** Te veel verzoeken in korte tijd.

**Oplossingen:**

1. **Wacht** — Standaard 15 minuten
2. **Verhoog limieten** (voor beheerders):
   ```env
   RATE_LIMIT_MAX_REQUESTS=200
   RATE_LIMIT_WINDOW_MS=900000
   ```

### "CORS error" in browser console

**Oorzaken:**

1. **Frontend en backend op verschillende domeinen**
2. **CORS niet correct geconfigureerd**

**Oplossing:**

Configureer `CORS_ORIGIN` in de backend:

```env
CORS_ORIGIN=https://tutti.example.com
```

### "Network error" of "Failed to fetch"

**Controleer:**

1. **Is de backend bereikbaar?**
   ```bash
   curl http://localhost:3001/api/health
   ```

2. **Firewall regels?**
3. **Proxy configuratie?**
4. **HTTPS mixed content?** (HTTP resources op HTTPS pagina)

### "Cannot read property of undefined"

**Frontend error** — meestal een bug of onverwachte API-response.

**Stappen:**

1. Hard refresh: `Ctrl+Shift+R`
2. Wis localStorage: `localStorage.clear()` in console
3. Controleer browser console voor details
4. Meld de bug op GitHub met reproductie-stappen

---

## Hulp Nodig?

Als je probleem niet in deze handleiding staat:

1. **Doorzoek bestaande issues:** [github.com/ruudsl/tutti/issues](https://github.com/ruudsl/tutti/issues)
2. **Stel een vraag:** [github.com/ruudsl/tutti/discussions](https://github.com/ruudsl/tutti/discussions)
3. **Maak een issue aan** met:
   - Beschrijving van het probleem
   - Stappen om te reproduceren
   - Relevante logs
   - Omgevingsinformatie (OS, Docker versie, etc.)
