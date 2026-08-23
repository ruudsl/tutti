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
      // Bijgewerkt op 22-08-2026, na het koppelen van de formulierlabels.
      // Gemeten:
      //   statements 35,35 (8881/25116)
      //   branches   23,45 (3885/16566)
      //   functions  30,79 (2729/8861)
      //   lines      36,28 (8567/23609)
      //
      // De sprong is groter dan het aantal nieuwe tests doet vermoeden: die
      // tests zoeken velden op label, en daarvoor moet de hele pagina getekend
      // worden. Dat raakt onderweg veel code die nog nergens door een test
      // aangeraakt werd.
      //
      // Branches is bijna verdubbeld (8,68 -> 14,01) terwijl statements maar
      // drie punten steeg. Dat bevestigt waarom de pagina's eerst opgeknipt
      // moesten worden: daar zat het overgrote deel van de vertakkingen, en
      // geen enkele hoeveelheid api- en hooktests kon dat getal meetillen.
      // De 122 karakteriseringstests op zeven pagina's doen dat wel.
      // Bijgewerkt op 23-08-2026, na het opheffen van src/api.ts.
      // Gemeten:
      //   statements 35,06 (8412/23987)
      //   branches   23,42 (3846/16421)
      //   functions  30,24 (2580/8531)
      //   lines      36,00 (8106/22514)
      //
      // Deze getallen zijn LAGER dan de vorige meting, en dat is geen terugval
      // in de tests. Er is 4.149 regel verdwenen doordat src/api.ts is
      // opgeheven, en die code was 44 procent gedekt tegen een codebasegemiddelde
      // van 35. Wie boven het gemiddelde gedekte code weghaalt, verlaagt het
      // gemiddelde - zuiver rekenkunde.
      //
      // De behoefte die die code invulde wordt nog steeds getest: de zes
      // api-*.test.ts-bestanden mikken op '../api', en dat komt nu bij de
      // modules uit in plaats van bij het opgeheven bestand. src/api staat als
      // geheel op 87 procent.
      //
      // De drempels gaan mee omlaag, met ruimte. Ze stonden op statements 35 en
      // lines 36, en de meting kwam uit op 35,06 en precies 36,00 - dat laatste
      // is nul speling. Dan maakt de eerstvolgende commit met één ongedekte
      // regel de bouw rood om een reden die niets met die commit te maken heeft,
      // en dat leert niemand iets. Een ratel moet een terugval vangen, geen
      // afrondingsverschil.
      thresholds: {
        // Gemeten op 23-08-2026 na drie golven: 81,58 / 72,94 / 76,21 / 82,36.
        // De drempels staan een punt of twee daaronder - hoog genoeg om een
        // terugval te vangen, laag genoeg om niet af te gaan op een
        // afrondingsverschil. Een ratel moet een terugval vangen, geen ruis.
        statements: 80,
        branches: 71,
        functions: 74,
        lines: 80,
      },
    },
  },
});
