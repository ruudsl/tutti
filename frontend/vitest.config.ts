/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // vite-plugin-pwa draait hier niet, dus deze virtuele module bestaat niet
      // tijdens het testen. Zonder alias faalt niet de test maar de
      // dekkingsmeting: PWAUpdatePrompt.tsx werd niet getransformeerd, waarna
      // de v8-provider het rauw probeerde te ontleden, over de JSX struikelde
      // en het bestand stilzwijgend uit de noemer liet vallen.
      'virtual:pwa-register/react': path.resolve(__dirname, 'src/test/pwa-register-stub.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],

      // `include` is hier het belangrijkste, om dezelfde reden als in
      // backend/vitest.config.ts.
      //
      // Zonder deze regel telt de v8-provider alleen bestanden die een test
      // toevallig inlaadt. Een bestand dat geen enkele test aanraakt verdwijnt
      // dan uit de noemer in plaats van als nul mee te tellen. Het gemeten
      // getal ging daardoor over 2134 statements, terwijl de frontend 350
      // bronbestanden heeft: het las als 82 procent terwijl het overgrote deel
      // van de code niet eens bekeken werd.
      //
      // Dat geeft ook een averechtse prikkel: een test toevoegen trekt het
      // bestand dat hij aanroept de noemer in, waardoor het percentage daalt
      // terwijl er juist meer getest wordt.
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/__tests__/**', 'src/test/**', 'src/**/*.d.ts', 'src/main.tsx', 'src/vite-env.d.ts'],
      // Gemeten over de hele frontend op 21-08-2026, met `include` erbij:
      //   statements 6,89 (1710/24789)
      //   branches   3,31 (546/16471)
      //   functions  6,58 (577/8760)
      //   lines      6,96 (1622/23294)
      //
      // Die getallen zijn niet te vergelijken met de 81,95 procent die hier
      // eerder uit kwam: dat ging over 2134 statements omdat alleen aangeraakte
      // bestanden meetelden. De hoeveelheid geteste code is niet veranderd,
      // alleen de noemer klopt nu.
      //
      // Drempels net onder de gemeten stand, zodat ze een terugval vangen
      // zonder bij de eerste de beste meetruis af te gaan. Verhoog ze als er
      // tests bij komen - dat is het hele punt van een ratel.
      // Bijgewerkt op 22-08-2026, na de restpuntenronde. Gemeten:
      //   statements 28,81 (7225/25070)
      //   branches   15,70 (2599/16544)
      //   functions  27,26 (2416/8860)
      //   lines      29,40 (6929/23563)
      //
      // Branches is bijna verdubbeld (8,68 -> 14,01) terwijl statements maar
      // drie punten steeg. Dat bevestigt waarom de pagina's eerst opgeknipt
      // moesten worden: daar zat het overgrote deel van de vertakkingen, en
      // geen enkele hoeveelheid api- en hooktests kon dat getal meetillen.
      // De 122 karakteriseringstests op zeven pagina's doen dat wel.
      thresholds: {
        statements: 28,
        branches: 15,
        functions: 27,
        lines: 29,
      },
    },
  },
});
