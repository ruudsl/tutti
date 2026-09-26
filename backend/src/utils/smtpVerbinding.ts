/**
 * Waarheen verbindt nodemailer voor de eigen SMTP-server van een vereniging?
 *
 * De host komt van een beheerder van een vereniging. Hij wordt opgezocht en
 * gecontroleerd met `controleerUitgaandeHost`, en nodemailer krijgt daarna het
 * gecontroleerde IP-adres als `host`. Kreeg nodemailer de naam, dan zocht hij
 * die zelf nog eens op - en een eigen nameserver kan dan een ander antwoord
 * geven dan bij de controle (DNS-rebinding), bijvoorbeeld 127.0.0.1.
 *
 * De oorspronkelijke naam gaat mee als `tls.servername`: daarop controleert
 * TLS het certificaat en die gaat als SNI naar de server. Zonder dat zou een
 * geldig certificaat voor `smtp.voorbeeld.nl` worden afgewezen omdat er met
 * een IP-adres is verbonden.
 *
 * Alleen voor SMTP van een vereniging. De installatiebrede SMTP uit de
 * omgevingsvariabelen stelt wie Tutti draait zelf in; die wordt vertrouwd.
 */

import { controleerUitgaandeHost, Opzoeker } from './uitgaandAdres';

export interface SmtpVerbinding {
  host: string;
  tls?: { servername: string };
}

/**
 * @throws OnveiligAdresFout als de host geen geldige hostnaam is of naar een
 *   eigen of speciaal adres wijst.
 */
export async function gecontroleerdeSmtpVerbinding(ruw: string, opzoeken?: Opzoeker): Promise<SmtpVerbinding> {
  const { adres, servername } = await controleerUitgaandeHost(ruw, opzoeken);
  return servername ? { host: adres, tls: { servername } } : { host: adres };
}
