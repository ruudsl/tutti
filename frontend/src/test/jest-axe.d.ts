/**
 * De toegankelijkheidsmatcher van jest-axe bij vitest aanmelden.
 *
 * `expect.extend(toHaveNoViolations)` in accessibility.test.tsx regelt het
 * draaien; dit bestand regelt alleen dat TypeScript de matcher kent.
 *
 * `@types/jest-axe` schrijft zijn eigen aangifte, maar die is voor de oude
 * vorm van `Assertion`. Vitest 5 geeft de interface twee typeparameters - de
 * retourwaarde en de waarde waarover je iets beweert - en daardoor viel de
 * matcher buiten de samenvoeging. Zodra `@types/jest-axe` vitest 5 kent, mag
 * dit bestand weg.
 */

import 'vitest';

declare module 'vitest' {
  interface Assertion<R, T> {
    toHaveNoViolations(): R;
  }
  interface AsymmetricMatchersContaining {
    toHaveNoViolations(): void;
  }
}
