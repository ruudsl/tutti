import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    setupFiles: ['src/__tests__/setup.ts'],
    testTimeout: 10000,
    hookTimeout: 10000,
    // Testbestanden draaien parallel.
    //
    // Hier stond `fileParallelism: false` met als reden "to avoid database
    // conflicts". Die reden klopte niet meer, en waarschijnlijk al langer niet:
    // de testdatabase is puur in-geheugen (`new SQL.Database()` in
    // __tests__/testDb.ts) en `isolate: true` geeft elk testbestand een eigen
    // moduleregistratie. Elk bestand had dus allang zijn eigen database - er
    // viel niets te botsen.
    //
    // Het echte risico zat bij de tien testbestanden die naar schijf schrijven
    // en samen de uploads-map delen. Die zijn eerst apart parallel gedraaid:
    // 148 tests groen, en 65 seconden testtijd in 24 seconden wandkloktijd.
    //
    // Daarna de hele suite, drie keer achter elkaar: 4358 tests, elke keer
    // groen. Drie keer, omdat een parallelle suite die één keer slaagt niets
    // bewijst - een test die soms omvalt is erger dan een suite die traag is.
    //
    // Wat het oplevert: 19m35s serieel wordt 10m50s parallel op vier kernen.
    // De suite groeit lineair met het aantal tests, dus dit is niet alleen
    // sneller vandaag maar schuift ook de tijdslimiet in CI vooruit.
    fileParallelism: true,
    isolate: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],

      // `all` en `include` zijn hier het belangrijkste.
      //
      // Zonder deze twee telt de v8-provider alleen bestanden die een test
      // toevallig inlaadt. Een bestand dat geen enkele test aanraakt verdwijnt
      // dan uit de noemer in plaats van als nul mee te tellen. Het gemeten
      // getal ging daardoor over 6140 statements terwijl de backend er 22056
      // heeft: ruim zeventig procent van de code werd niet eens bekeken.
      // Bestanden als accounting.ts, tickets.ts, events.ts en analytics.ts -
      // bij elkaar ruim tienduizend regels - kwamen in het rapport niet voor.
      //
      // Dat gaf ook een averechtse prikkel. Een test toevoegen trekt het
      // bestand dat hij aanroept de noemer in, waardoor het percentage daalt
      // terwijl er juist meer getest wordt. Precies dat gebeurde eerder: van
      // 54,4 naar 47,4 procent nadat er tests bij kwamen. Sturen op zo'n getal
      // beloont het niet schrijven van tests.
      //
      // In oudere Vitest-versies heette dit `all: true`. Die optie bestaat in
      // versie 4 niet meer en wordt stilzwijgend genegeerd; `include` doet nu
      // het werk. Hem laten staan zou de typecheck breken en de indruk wekken
      // dat hij iets doet.
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/__tests__/**',
        'src/**/*.d.ts',
        // Losstaande onderhoudscommando's; die draaien niet in de applicatie.
        // Migraties staan er bewust wel in: die kunnen stukgaan, en dat is in
        // de praktijk ook gebeurd.
        'src/scripts/**',
      ],

      // Gemeten over de hele backend op 19-08-2026:
      //   statements 12,86 (2838/22056)
      //   branches    9,11 (1207/13242)
      //   functions  14,29 (379/2652)
      //   lines      12,89 (2763/21419)
      //
      // Deze drempels zijn niet te vergelijken met de eerdere 46 / 34 / 49 /
      // 46: die golden over een kwart van de code. De hoeveelheid geteste code
      // is niet veranderd - 2838 gedekte statements, voor en na - alleen de
      // noemer klopt nu.
      //
      // Het doel van >80 procent uit WP8 staat daarmee veel verder weg dan het
      // leek: daarvoor moeten er ruim veertienduizend statements bij afgedekt
      // worden.
      // Bijgewerkt op 22-08-2026. Gemeten:
      //   statements 64,72 (14740/22775)
      //   branches   55,65 (7591/13640)
      //   functions  68,32 (1937/2835)
      //   lines      65,00 (14320/22030)
      //
      // Er kwamen zeven routes bij die de frontend al aanriep maar die niet
      // bestonden. Dat is meer code in de noemer, en het percentage ging tóch
      // omhoog: de tests die erbij hoorden dekken meer af dan de routes zelf
      // toevoegen.
      //
      // Drempels net onder de gemeten stand: hoog genoeg om een terugval te
      // vangen, laag genoeg om niet af te gaan op meetruis. Het doel van >80
      // procent uit WP8 is daarmee in zicht maar nog niet gehaald.
      thresholds: {
        statements: 64,
        branches: 55,
        functions: 68,
        lines: 64,
      },
    },
  },
});
